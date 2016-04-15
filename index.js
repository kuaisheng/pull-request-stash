/**
 * Created by liangkuaisheng on 16/4/13.
 */
'use strict';
var Buffer = require('buffer').Buffer;
var _ = require('lodash');
var Promise = require("bluebird");
var request = Promise.promisifyAll(require('request'));
var inquirer = Promise.promisifyAll(require('inquirer'));

var git = require("git-promise");
var gitInfo = require('git-info-sync');

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

function pullRequestStash (options) {
    //protocol, server, port, username, password
    // http://git.xxx.com/projects/projectKey/repos/repositorySlug/pull-requests?create
    this.opt = _.assign(defaultOpt, options);
    var reviewersAskArr = [];
    this.opt.reviewers.forEach(function (reviewer) {
        reviewersAskArr.push({
            name: reviewer.name + ' @' + reviewer.displayName,
            value: reviewer
        });
    });
    this.opt.reviewersAskArr = reviewersAskArr;
};

pullRequestStash.prototype.send = function (prInfo, options) {
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
    return request.postAsync(req)
        .then(function (response) {
            var bodyObj = {};
            var url = '';
            if (response.statusCode === 201) {
                try {
                    bodyObj = JSON.parse(response.body);
                    url = bodyObj.links.self[0].href;
                } catch (err) {
                    bodyObj = {};
                }

                pr.password = '';
                return {
                    status: 0,
                    msg: 'success',
                    data: {
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
                    msg: bodyObj.errors
                };
            }
        });
};

pullRequestStash.prototype.createAndSend = function () {
    var self = this;
    var opt = self.opt;
    var askArr = [];
    var info = gitInfo(['branch', 'currentUser']);

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
        default: opt.password || '',
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
        default: 'master',
        validate: function (input) {
            if (input === '' ||
                input === null ||
                input === undefined) {
                return 'To Branch Cannot Be Empty!';
            }
            return true;
        }
    });
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

    return inquirer.prompt(askArr)
        .then(function (result) {
            return git('log ' + result.toBranch + '..' + result.fromBranch + ' --pretty=format:"%s" --graph', function (stdout) {
                result.defaultDescription = stdout;
                return result;
            });
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
                message: 'Pull Request Description (Set different commits log to description, please click Enter) ?',
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
};

module.exports = pullRequestStash;