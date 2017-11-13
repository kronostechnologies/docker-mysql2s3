# Docker MySQL to S3

This image is meant to backup a mysql database to aws S3.

## Usage

Below an example with everything you need to define for this container to work properly.
```
docker run --rm -e AWS_REGION=us-east-1 -e AWS_ACCESS_KEY_ID=you-acces-key-id -e AWS_SECRET_ACCESS_KEY=you-secret-acces-key -e AWS_S3_BUCKET="some.s3.bucket" -e LOG_LEVEL=debug -e MYSQL_HOST=mysql-host-name -e MYSQL_USER=username -e MYSQL_PWD=password kronostechnologies/mysql2s3
```

You may also define all environment variable in a file and run the docker like this.
```
docker run --env-file /your/env/file kronostechnologies/mysql2s3
```

## Required AWS permission
These are the permissions needed for this container to successfully backup your mysql database to S3.
```
{
  "Version": "2012-10-17",
  "Statement": [{
    "Sid": "",
    "Effect": "Allow",
    "Action": [
        "s3:PutObjectAcl",
        "s3:PutObject",
        "s3:ListBucket"
    ],
    "Resource": [
        "arn:aws:s3:::bucket-name/*",
        "arn:aws:s3:::bucket-name"
    ]
  }]
}
```

## Environment Variables

### AWS_REGION
The region of your aws account.

### AWS_ACCESS_KEY_ID
The access key id of your aws account.

### AWS_SECRET_ACCESS_KEY
The secret access key of your aws account.

### AWS_S3_BUCKET
The S3 bucket name where you want the backup to live.

### AWS_S3_QUEUESIZE
The number of part the S3 upload can handle in parrallel.

### AWS_S3_PARTSIZE
The size in bytes of each individuals parts to be uploaded.

### COMPRESSION_TYPE
Supported values are `xz` and `gz`

### COMPRESSION_LEVEL
Whatever compression level the compression type support. Usually an integer 1 to 9.

### COMPRESSION_THREADS
Number of threads the compression algorithm use. This works only with `xz` compression type.

### CONCURRENCY
The number of process the container will spawn. If this value is too high, you might ddos your database.

### LOG_LEVEL
The loglevel of this container. Valid values are `info`, `debug`.

### LOG_CLEAN
Set to false to not clean the log for sensitive information. Do not use this in production. Default is true; logs are never contains sensitive information.
When sensitive information is displayed, `*****` will replace the value otherwise, `#EMPTY#` if there's no value.

### MYSQL_HOST
The mysql url.

### MYSQL_USER
The mysql username.

### MYSQL_PWD
The mysql password.

## Troubleshoot
### Missing credentials in config
Your AWS credentials are missing. You need to add both environment variable `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY`.

### Access Denied
This most likely means that the aws user you use does not have access to your bucket.

## Reference
AWS S3 upload: http://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/S3/ManagedUpload.html
