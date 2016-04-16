### pull-request-stash

### RepoInfo
 * **author：** liangkuaisheng
 * **Email：**: kuaisheng@126.com
 * **github：** https://github.com/goahead1987/pull-request-stash


### Installation

`npm install pull-request-stash --save`

### Usage

```
var pullrequeststash = require('pull-request-stash');

module.exports = function (gulp) {
    gulp.task('pull-request', [], function (done) {
        var pull = new pullrequeststash({
            protocol: 'http',
            server: 'git.xxxxxx.com',
            port: '80',
            //username: 'liangkuaisheng',
            //password: 'xxxx',
            projectKey: 'project',
            repositorySlug: 'slug',
            reviewers: [
                {
                    name: 'xxxx1',
                    displayName: 'ssss1'
                },
                {
                    name: 'ddd',
                    displayName: 'vvzd'
                },
                {
                    name: 'gfbs',
                    displayName: 'ndfgnd'
                },
                {
                    groupType: true,
                    name: 'ssss',
                    displayName: 'gggggg',
                    users: [
                        {
                            name: 'dddd',
                            displayName: 'fffff'
                        },
                        {
                            name: 'dhsdfg',
                            displayName: 'ggg'
                        }
                    ]
                }
            ]
        });
        pull.createAndSend()
            .then(function (res) {
                console.log(res);
            });
    });
};

```
### Contributing

### History

1.0.5

hide Password

add create password

1.0.4

fix bug when reviewer list for choice is []

1.0.3

move the question `Create Pull Request Add Reviewers (Need no reviewer Click Enter) ?` first

1.0.2

set opt.password = '' when return

1.0.1
add success response data
```
    {
        pr: pr,
        url: url
    }
```
to

```
    {
        opt: opt
        pr: pr,
        url: url
    }
```

### Credits

### License
MIT