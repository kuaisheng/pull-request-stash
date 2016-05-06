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

function PullRequestStash(options) {
    //protocol, server, port, username, password
    // http://git.xxx.com/projects/projectKey/repos/repositorySlug/pull-requests?create
    this.opt = _.assign(defaultOpt, options);
    var reviewersAskArr = [];
    this.opt.reviewers = this.opt.reviewers || [];
    this.opt.reviewers.forEach(function (reviewer) {
        reviewersAskArr.push({
            name: reviewer.name + ' @' + reviewer.displayName,
            value: reviewer
        });
    });
    this.opt.reviewersAskArr = reviewersAskArr;
}

PullRequestStash.prototype.send = function (prInfo, options) {
    var pr = _.assign(_.cloneDeep(defaultPr), prInfo);
    var req = _.cloneDeep(defaultReq);
    var opt = this.opt;
    if (options) {
        opt = _.assign(opt, options);
    }
    req.url = opt.protocol + '://' + opt.username + ':' + opt.password +
        '@' + opt.server + ':' + opt.port + '/rest/api/1.0' + '/projects/' +
        opt.projectKey + '/repos/' + opt.repositorySlug + '/pull-requests';
    req.body = JSON.stringify(pr);
    req.headers['Content-Length'] = Buffer.byteLength(req.body, 'utf8');
    console.log('send request to git...'.green);
    return request.postAsync(req)
        .then(function (response) {
            console.log('response from git...'.green);
            var bodyObj = {};
            var url = '';
            if (response.statusCode === 201) {
                try {
                    bodyObj = JSON.parse(response.body);
                    url = bodyObj.links.self[0].href;
                } catch (err) {
                    bodyObj = {};
                }

                opt.password = '';
                return {
                    status: 0,
                    msg: 'success',
                    data: {
                        opt: opt,
                        pr: pr,
                        url: url
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
                    opt: opt,
                    pr: pr,
                    msg: bodyObj.errors
                };
            }
        })
        .catch(function (err) {
            if (err) throw err;
        });
};

PullRequestStash.prototype.createAndSend = function () {
    var self = this;
    var opt = self.opt;
    var askArr = [];
    var info = {};

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
            info.currentUser = res[0];
            info.branch = res[1];

            if (opt.reviewersAskArr && opt.reviewersAskArr.length > 0) {
                askArr.push({
                    type: 'checkbox',
                    name: 'reviewers',
                    message: 'Create Pull Request Add Reviewers (Need no reviewer Click Enter) ?',
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
                console.log('Reviewers List For Select Is Empty, But You Can Continue With No Reviewer!'.red);
            }

            askArr.push({
                type: 'input',
                name: 'username',
                message: 'Your Git User Name?',
                default: opt.username || info.currentUser,
                validate: function (input) {
                    if (input === '' ||
                        input === null ||
                        input === undefined) {
                        return 'User Name Cannot Be Empty!';
                    }
                    return true;
                }
            });
            askArr.push({
                type: 'password',
                name: 'password',
                message: 'Your Git Password?',
                when: function (obj) {
                    return !opt.password;
                },
                validate: function (input) {
                    if (input === '' ||
                        input === null ||
                        input === undefined) {
                        return 'Password Cannot Be Empty!';
                    }
                    return true;
                }
            });
            askArr.push({
                type: 'input',
                name: 'fromBranch',
                message: 'Create Pull Request From Branch ?',
                default: info.branch,
                validate: function (input) {
                    if (input === '' ||
                        input === null ||
                        input === undefined) {
                        return 'From Branch Cannot Be Empty!';
                    }
                    return true;
                }
            });
            askArr.push({
                type: 'input',
                name: 'toBranch',
                message: 'Create Pull Request To Branch ?',
                default: opt.defaultBranch || 'master',
                validate: function (input) {
                    if (input === '' ||
                        input === null ||
                        input === undefined) {
                        return 'To Branch Cannot Be Empty!';
                    }
                    return true;
                }
            });

            return inquirer.prompt(askArr)
                .then(function (result) {
                    if (!result.reviewers) {
                        result.reviewers = [];
                    }
                    if (!result.password) {
                        result.password = opt.password;
                    }
                    try {
                        return git('log origin/' + result.toBranch + '..origin/' + result.fromBranch + ' --pretty=format:"%s" --graph', function (stdout) {
                            result.defaultDescription = stdout;
                            return result;
                        })
                            .fail(function (err) {
                                console.log('when read commit-log of branch , error !'.red);
                                console.log(err);
                                throw err;
                            });
                    } catch (err) {
                        console.log('when read commit-log of branch , error !'.red);
                        console.log(err);
                        throw err;
                    }
                })
                .then(function (resul) {
                    var askArrNext = [];
                    askArrNext.push({
                        type: 'input',
                        name: 'title',
                        message: 'Pull Request Title ?',
                        default: resul.fromBranch + ' to ' + resul.toBranch + ' by ' + resul.username,
                        validate: function (input) {
                            if (input === '' ||
                                input === null ||
                                input === undefined) {
                                return 'Pull Request Title Cannot Be Empty!';
                            }
                            return true;
                        }
                    });
                    askArrNext.push({
                        type: 'input',
                        name: 'description',
                        message: 'Pull Request Description (Set different commits log to description, please click Enter) ?'
                    });
                    return inquirer.prompt(askArrNext)
                        .then(function (res) {
                            resul.title = res.title;
                            resul.description = res.description || resul.defaultDescription;
                            delete resul.defaultDescription;
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
        })
        .catch(function (err) {
            console.log('when get username or branch , error !'.red);
            throw err;
        });
};

PullRequestStash.createKey = function (keyFilePath) {
    var passTemp = '';
    inquirer.prompt([
            {
                type: 'password',
                name: 'password',
                message: 'Please Set New Stash Password?',
                validate: function (input) {
                    if (input === '' ||
                        input === null ||
                        input === undefined) {
                        return 'Password Canot Be Empty!';
                    }
                    passTemp = input;
                    return true;
                }
            },
            {
                type: 'password',
                name: 'password2',
                message: 'Please Input Password Again?',
                validate: function (input) {
                    if (input === '' ||
                        input === null ||
                        input === undefined) {
                        return 'Password Canot Be Empty!';
                    }
                    if (input !== passTemp) {
                        return 'Two Password Different,Please Try Again!';
                    }
                    return true;
                }
            }
        ])
        .then(function (res) {
            if (res.password === res.password2) {
                fsextra.outputFile(keyFilePath, '{"key": "' + CryptoJS.AES.encrypt(res.password, keyFilePath) + '"}', function (err) {
                    if (err) throw err;
                    console.log('Write File OK !'.green);
                    console.log('Set New Password Ok!'.green);
                });
            } else {
                console.log('Two Password Different,Failed!'.red);
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