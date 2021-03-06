var AWS = require('aws-sdk');
var s3 = new AWS.S3({signatureVersion: 'v4'});
var unzip = require('unzip2');
var util = require('util');
var fs = require('fs');
var async = require('async');
var walk = require('walk');

exports.handler = function (event, context) {
    var bucket = event.Records[0].s3.bucket.name;
    var key = event.Records[0].s3.object.key;

    unzipAndUpload(bucket, key, context);
};

function unzipAndUpload(bucket, key, context) {
    var params = {
        Key: key,
        Bucket: bucket
    };
    var rand = Math.random().toString(36).substring(14);
    var filePath = '/tmp/' + rand + '.zip';
    var folderPath = '/tmp/' + rand;

    async.waterfall([
        function(callback) {
            s3.getObject(params, function(err, data) {
                callback(err, data);
            });
        },
        function(data, callback) {
            fs.writeFile(filePath, data.Body, function(err) {
                callback(err);
            });
        },
        function(callback) {
            fs.mkdir(folderPath, function(err) {
                callback(err);
            });
        },
        function(callback) {
            var stream = fs.createReadStream(filePath).pipe(unzip.Extract({ path: folderPath }));
            stream.on('close', function(err) {
                callback(err);
            });
        },
        function(callback) {
            var walker = walk.walk(folderPath);
            var files = [];
            walker.on('file', function(root, fileStats, next) {
                var filePath = root + '/' + fileStats.name;
                var file = {
                    'name': fileStats.name,
                    'path': filePath
                };
                files.push(file);

                next();
            });
            walker.on('errors', function(root, fileStats, next) {
                next();
            });
            walker.on('end', function(root, fileStats, next) {
                callback(null, files);
            });
        },
        function(files, callback) {
            async.each(files, function(file, callback) {
                var readstream = fs.createReadStream(file.path);
                var data = '';
                var contentType = '';
                if(file.name.includes('.html')){
                    contentType = 'text/html';
                } else if(file.name.includes('.js')) {
                    contentType = 'application/javascript';
                } else if(file.name.includes('.css')) {
                    contentType = 'text/css';
                } else {
                    contentType = 'application/octet-stream';
                }

                readstream.on('data', function(chunk) {
                    data += chunk;
                });

                readstream.on('end', function() {
                    var params = {
                        Bucket: process.env.BUCKET_NAME,
                        Key: file.name,
                        Body: data,
                        ContentType: contentType
                    };
                    s3.putObject(params, function(err, data) {
                        callback(err);
                    });
                });
            }, function(err) {
                callback(err);
            });
        }
    ], function(err) {
        console.log(err);
        context.done(null, '');
    });
}
