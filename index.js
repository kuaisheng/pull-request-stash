/**
 * Created by liangkuaisheng on 16/4/13.
 */
'use strict';
var colors = require('colors');
var Buffer = require('buffer').Buffer;
var _ = require('lodash');
var Promise = require("bluebird");
var request = Promise.promisifyAll(require('request'));
var inquirer = require('inquirer');
var fsextra = require('fs-extra');
var CryptoJS = require("crypto-js");

var git = require("git-promise");

var defaultOpt = {
    protocol: 'http',
    server: 'localhost',
    port: '7990',
    username: '',
    password: '',
    projectKey: '',
    repositorySlug: ''
};
var defaultReq = {
    url: '',
    body: '',
    headers: {
        'Content-Type': 'application/json'
    }
};
var defaultPr = {
    title: '',
    description: '',
    state: 'OPEN',
    open: true,
    closed: false,
    fromRef: {},
    toRef: {},
    locked: false,
    reviewers: []
};

function PullRequestStash (options, langOpt) {
    //protocol, server, port, username, password
    // http://git.xxx.com/projects/projectKey/repos/repositorySlug/pull-requests?create
    var defaultLangOpt = {
        SEND_TO_GIT: 'send request to git...',
        RES_FROM_GIT: 'response from git...',
        CREATE_PR_SUC: 'create pull request success!',
        TEST_PR_STATUS: 'test pull request status.',
        HAS_CONFLICTS: 'there are conflicts!',
        HAS_NO_CONFLICT: 'there is no conflict!',
        GET_CONFLICT_INFO_FAIL: 'fail to get test conflict info!',
        CANCEL_PR_OR_NOT: 'There are conflicts, do you want to cancel the pull request?',
        CANCEL_PR: 'decline pull request.',
        CANCEL_PR_SUC: 'success to decline conflict!',
        CANCEL_PR_FAIL: 'fail to decline conflict, please do it manually !',
        ASK_REVIEWERS: 'Create Pull Request Add Reviewers. If need no reviewer Click Enter ?',
        ASK_REVIEWERS_MORE: 'Create Pull Request Add Reviewers(@xxx@yyy). If need no reviewer Click Enter ?',
        INPUT_TYPE: 'input should like @xxx@yyy',
        ASK_USR_NAME: 'Your Git User Name?',
        NOT_EMP: 'Should Not Be Empty!',
        USR_NAME_TYPE: 'git username only contain number,letter and _',
        ASK_PASS: 'Your Git Password?',
        ASK_FROM_BR: 'Create Pull Request From Branch ?',
        ASK_TO_BR: 'Create Pull Request To Branch ?',
        READ_GIT_FAIL: 'warning: when read commit-log of branch , error! Please input description',
        ASK_DESCRIPTION: 'Pull Request Description?',
        ASK_DESCRIPTION_MORE: 'Pull Request Description. Default (click Enter) set different commits log of two branches to description?',
        ASK_TITLE: 'Pull Request Title ?'
    };
    var Language = defaultLangOpt;
    if (langOpt) {
        Language = _.assign(defaultLangOpt, langOpt);
    }
    this.Language = Language;
    this.opt = _.assign(defaultOpt, options);
    var reviewersAskArr = [];
    this.opt.reviewers = this.opt.reviewers || [];
    this.opt.reviewers.forEach(function (reviewer) {
        reviewersAskArr.push({
            name: reviewer.name + ' @' + reviewer.displayName,
            value: reviewer,
            checked: reviewer.checked
        });
    });
    this.opt.reviewersAskArr = reviewersAskArr;
}

PullRequestStash.prototype.send = function (prInfo, options) {
    var Language = this.Language;
    var pr = _.assign(_.cloneDeep(defaultPr), prInfo);
    var req = _.cloneDeep(defaultReq);
    var opt = this.opt;
    if (options) {
        opt = _.assign(opt, options);
    }
    req.url = opt.protocol + '://' + opt.server + ':' + opt.port + '/rest/api/1.0' + '/projects/' +
        opt.projectKey + '/repos/' + opt.repositorySlug + '/pull-requests';
    req.body = JSON.stringify(pr);
    req.headers['Content-Length'] = Buffer.byteLength(req.body, 'utf8');
    req.headers['Authorization'] = 'Basic ' + new Buffer(opt.username + ':' + opt.password).toString('base64');
    console.log(Language.SEND_TO_GIT.blue);
    return request.postAsync(req)
        .then(function (response) {
            console.log(Language.RES_FROM_GIT.blue);
            var bodyObj = {};
            var url = '';
            var prId = 0;
            var prVersion = -1;
            if (response.statusCode === 201) {
                try {
                    bodyObj = JSON.parse(response.body);
                    url = bodyObj.links.self[0].href;
                    prId = bodyObj.id;
                    prVersion = bodyObj.version;
                } catch (err) {
                    bodyObj = {};
                }

                opt.password = '';
                console.log(Language.CREATE_PR_SUC.green);
                console.log(('URL: ' + url).green);
                return {
                    status: 0,
                    msg: 'success',
                    data: {
                        opt: opt,
                        pr: pr,
                        url: url,
                        id: prId,
                        version: prVersion
                    }
                };
            } else {
                try {
                    bodyObj = JSON.parse(response.body);
                } catch (err) {
                    bodyObj = {};
                }
                return {
                    status: 1,
                    data: {
                        opt: opt,
                        pr: pr
                    },
                    msg: bodyObj.errors
                };
            }
        })
        .then(function (prRes) {
            if (prRes && prRes.status !== 0) {
                return prRes;
            }
            var prDiffReq = _.cloneDeep(req);
            prDiffReq.url += '/' + prRes.data.id + '/diff';
            delete prDiffReq.body;
            delete prDiffReq.headers['Content-Length'];
            console.log(Language.TEST_PR_STATUS.blue);
            return request.getAsync(prDiffReq)
                .then(function (response) {
                    if (response.statusCode === 200) {
                        try {
                            if (/"line":"<<<<<<<","truncated":false,"conflictMarker":"MARKER"/.test(response.body)) {
                                console.log(Language.HAS_CONFLICTS.red);
                                return {
                                    status: 2,
                                    data: prRes.data,
                                    msg: Language.HAS_CONFLICTS + ' url:' + prRes.data.url
                                };
                            } else {
                                console.log(Language.HAS_NO_CONFLICT.green);
                                return prRes;
                            }
                        } catch (err) {
                            console.log(Language.GET_CONFLICT_INFO_FAIL.red);
                            return prRes;
                        }
                    } else {
                        console.log(Language.GET_CONFLICT_INFO_FAIL.red);
                        return prRes;
                    }
                });
        })
        .then(function (prRes) {
            if (prRes && prRes.status !== 2) {
                return prRes;
            }
            return inquirer.prompt([{
                    type: 'confirm',
                    name: 'cancelPR',
                    message: Language.CANCEL_PR_OR_NOT,
                }])
                .then(function (res) {
                    if (res.cancelPR) {
                        return {
                            status: 3,
                            data: prRes.data,
                            msg: Language.HAS_CONFLICTS + ' url:' + prRes.data.url
                        };
                    } else {
                        prRes.status = 0;
                        return prRes;
                    }
                });
        })
        .then(function (prRes) {
            if (prRes && prRes.status !== 3) {
                return prRes;
            }
            var prCancelReq = _.cloneDeep(req);
            prCancelReq.url += '/' + prRes.data.id + '/decline?version=' + prRes.data.version;
            prCancelReq.body = JSON.stringify({
                pullRequestId: prRes.data.id
            });
            prCancelReq.headers['Content-Length'] = Buffer.byteLength(prCancelReq.body, 'utf8');
            console.log(Language.CANCEL_PR.blue);
            return request.postAsync(prCancelReq)
                .then(function (response) {
                    if (response.statusCode === 200) {
                        console.log(Language.CANCEL_PR_SUC.green);
                    } else {
                        console.log(Language.CANCEL_PR_FAIL.red);
                    }
                    return prRes;
                });
        })
        .catch(function (err) {
            if (err) throw err;
        });
};

PullRequestStash.prototype.createAndSend = function (silence) {
    var self = this;
    var Language = self.Language;
    var opt = self.opt;
    var askArr = [];
    var info = {};

    function actions (res) {
        info.currentUser = res[0];
        info.branch = res[1];

        if (opt.reviewersAskArr && opt.reviewersAskArr.length > 0) {
            askArr.push({
                type: 'checkbox',
                name: 'reviewers',
                message: Language.ASK_REVIEWERS,
                choices: opt.reviewersAskArr,
                filter: function (val) {
                    var resObj = {};
                    var resArr = [];
                    val.forEach(function (item) {
                        if (item.groupType) {
                            item.users.forEach(function (subItem) {
                                resObj[subItem.name] = {
                                    user: subItem
                                };
                            });
                        } else {
                            resObj[item.name] = {
                                user: item
                            };
                        }
                    });
                    _.forEach(resObj, function (value, key) {
                        resArr.push(value);
                    });
                    return resArr;
                }
            });
        } else {
            askArr.push({
                type: 'input',
                name: 'reviewers',
                message: Language.ASK_REVIEWERS_MORE,
                validate: function (input) {
                    if (input === '' ||
                        input === null ||
                        input === undefined) {
                        return Language.INPUT_TYPE;
                    }
                    return true;
                },
                filter: function (val) {
                    if (val === '' ||
                        val === null ||
                        val === undefined) {
                        return '[]';
                    }
                    if (!(/^(@\w+)*$/.test(val))) {
                        return '';
                    }
                    var resObj = {};
                    var valArr = val.split('@');
                    var resArr = [];
                    valArr.forEach(function (item) {
                        if (item) {
                            resObj[item] = {
                                user: {
                                    name: item,
                                    displayName: item
                                }
                            };
                        }
                    });
                    _.forEach(resObj, function (value, key) {
                        resArr.push(value);
                    });
                    return JSON.stringify(resArr);
                }
            });
        }

        askArr.push({
            type: 'input',
            name: 'username',
            message: Language.ASK_USR_NAME,
            default: opt.username || info.currentUser,
            when: function (obj) {
                var name = opt.username || info.currentUser || '';
                return !(/^\w+$/.test(name) && silence);
            },
            validate: function (input) {
                if (input === '' ||
                    input === null ||
                    input === undefined) {
                    return Language.NOT_EMP;
                }
                if (!(/^\w+$/.test(input))) {
                    return Language.USR_NAME_TYPE;
                }
                return true;
            }
        });
        askArr.push({
            type: 'password',
            name: 'password',
            message: Language.ASK_PASS,
            when: function (obj) {
                return !opt.password;
            },
            validate: function (input) {
                if (input === '' ||
                    input === null ||
                    input === undefined) {
                    return Language.NOT_EMP;
                }
                return true;
            }
        });
        askArr.push({
            type: 'input',
            name: 'fromBranch',
            message: Language.ASK_FROM_BR,
            default: info.branch,
            when: function (obj) {
                return !(info.branch && silence);
            },
            validate: function (input) {
                if (input === '' ||
                    input === null ||
                    input === undefined) {
                    return Language.NOT_EMP;
                }
                return true;
            }
        });
        askArr.push({
            type: 'input',
            name: 'toBranch',
            message: Language.ASK_TO_BR,
            default: opt.defaultBranch || 'master',
            when: function (obj) {
                return !(opt.defaultBranch && silence);
            },
            validate: function (input) {
                if (input === '' ||
                    input === null ||
                    input === undefined) {
                    return Language.NOT_EMP;
                }
                return true;
            }
        });

        return inquirer.prompt(askArr)
            .then(function (result) {
                if (!result.reviewers) {
                    result.reviewers = [];
                } else {
                    if (_.isString(result.reviewers)) {
                        result.reviewers = JSON.parse(result.reviewers);
                    }
                }
                if (!result.username) {
                    result.username = opt.username || info.currentUser;
                }
                if (!result.password) {
                    result.password = opt.password;
                }
                if (!result.fromBranch) {
                    result.fromBranch = info.branch;
                }
                if (!result.toBranch) {
                    result.toBranch = opt.defaultBranch || 'master';
                }

                return git('log origin/' + result.toBranch + '..origin/' + result.fromBranch + ' --pretty=format:"%s" --graph', function (stdout) {
                    result.defaultDescription = stdout;
                    result.descriptionMsg = '';
                    return result;
                })
                    .fail(function (err) {
                        console.log(Language.READ_GIT_FAIL.yellow);
                        result.defaultDescription = '';
                        result.descriptionMsg = Language.ASK_DESCRIPTION;
                        return result;
                    });
            })
            .then(function (resul) {
                var askArrNext = [];
                var titleStr = resul.fromBranch + ' to ' + resul.toBranch + ' by ' + resul.username;
                var descriptionMsg = resul.descriptionMsg || Language.ASK_DESCRIPTION_MORE;
                askArrNext.push({
                    type: 'input',
                    name: 'title',
                    message: Language.ASK_TITLE,
                    default: opt.title || titleStr,
                    when: function (obj) {
                        return !silence;
                    },
                    validate: function (input) {
                        if (input === '' ||
                            input === null ||
                            input === undefined) {
                            return Language.NOT_EMP;
                        }
                        return true;
                    }
                });
                askArrNext.push({
                    type: 'input',
                    name: 'description',
                    when: function (obj) {
                        return !(silence && resul.defaultDescription !== '');
                    },
                    message: descriptionMsg
                });
                return inquirer.prompt(askArrNext)
                    .then(function (res) {
                        resul.title = res.title || opt.title || titleStr;
                        resul.description = res.description || resul.defaultDescription;
                        resul.description = _.truncate(resul.description, {'length': 500});
                        delete resul.defaultDescription;
                        delete resul.descriptionMsg;
                        return resul;
                    });
            })
            .then(function (resu) {
                return self.send({
                    title: resu.title,
                    description: resu.description,
                    reviewers: resu.reviewers || [],
                    fromRef: {
                        id: resu.fromBranch,
                        repository: {
                            slug: opt.repositorySlug,
                            project: {
                                key: opt.projectKey
                            }
                        }
                    },
                    toRef: {
                        id: resu.toBranch,
                        repository: {
                            slug: opt.repositorySlug,
                            project: {
                                key: opt.projectKey
                            }
                        }
                    }
                }, {
                    username: resu.username,
                    password: resu.password
                });
            });
    }

    return Promise.all([
            git('config --get user.name', function (stdout) {
                var nameStr = '';
                if (stdout) {
                    var arr = stdout.match(/^(.+)\n$/);
                    if (arr && arr.length === 2) {
                        nameStr = arr[1];
                    }
                }
                return nameStr;
            }),
            git('status -b', function (stdout) {
                var branchStr = '';
                if (stdout) {
                    var arr = stdout.match(/^On\sbranch\s(.+)\n/);
                    if (arr && arr.length > 1) {
                        branchStr = arr[1];
                    }
                }
                return branchStr;
            })
        ])
        .then(function (res) {
            return actions(res);
        })
        .catch(function (err) {
            var res = ['', '']
            return actions(res);
        });
};

PullRequestStash.createKey = function (keyFilePath, langOpt) {
    var defaultLangOpt = {
        SET_NEW_PASS: 'Please Set New Stash Password?',
        SET_PASS_AGAIN: 'Please Input Password Again?',
        PASS_NOT_EMP: 'Password Canot Be Empty!',
        PASS_DIFF: 'Two Password Different,Please Try Again!',
        WRITE_OK: 'Write File OK !',
        SET_PASS_OK: 'Set New Password Ok!'
    };
    var Language = defaultLangOpt;
    if (langOpt) {
        Language = _.assign(defaultLangOpt, langOpt);
    }
    var passTemp = '';
    inquirer.prompt([
            {
                type: 'password',
                name: 'password',
                message: Language.SET_NEW_PASS,
                validate: function (input) {
                    if (input === '' ||
                        input === null ||
                        input === undefined) {
                        return Language.PASS_NOT_EMP;
                    }
                    passTemp = input;
                    return true;
                }
            },
            {
                type: 'password',
                name: 'password2',
                message: Language.SET_PASS_AGAIN,
                validate: function (input) {
                    if (input === '' ||
                        input === null ||
                        input === undefined) {
                        return Language.PASS_NOT_EMP;
                    }
                    if (input !== passTemp) {
                        return Language.PASS_DIFF;
                    }
                    return true;
                }
            }
        ])
        .then(function (res) {
            if (res.password === res.password2) {
                fsextra.outputFile(keyFilePath, '{"key": "' + CryptoJS.AES.encrypt(res.password, keyFilePath) + '"}', function (err) {
                    if (err) throw err;
                    console.log(Language.WRITE_OK.green);
                    console.log(Language.SET_PASS_OK.green);
                });
            } else {
                console.log(Language.PASS_DIFF.red);
            }
        })
        .catch(function (err) {
            if (err) throw err;
        });
};

PullRequestStash.getKey = function (keyFilePath) {
    var keyObj = fsextra.readJSONSync(keyFilePath);
    var bytes = CryptoJS.AES.decrypt(keyObj.key, keyFilePath);
    return bytes.toString(CryptoJS.enc.Utf8);
};

module.exports = PullRequestStash;