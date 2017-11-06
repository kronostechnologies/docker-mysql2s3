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

```
AWS_REGION
AWS_ACCESS_KEY_ID
AWS_SECRET_ACCESS_KEY
AWS_S3_BUCKET
AWS_S3_QUEUESIZE
AWS_S3_PARTSIZE
COMPRESSION_TYPE
COMPRESSION_LEVEL
COMPRESSION_THREADS
CONCURRENCY
KEYNAME_TEMPLATE
LOG_LEVEL
MYSQL_HOST
MYSQL_USER
MYSQL_PWD
```

## Troubleshoot
### Missing credentials in config
Your AWS credentials are missing. You need to add both environment variable `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY`.

### Access Denied
This most likely means that the aws user you use does not have access to your bucket.

