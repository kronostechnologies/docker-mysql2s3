# Docker MySQL to S3

This image is meant to backup a MySQL database to AWS S3.

## Usage

Below an example with everything you need to define for this container to work properly.
```
docker run --rm -e AWS_REGION=us-east-1 -e AWS_ACCESS_KEY_ID=your-access-key-id -e AWS_SECRET_ACCESS_KEY=your-secret-access-key -e AWS_S3_BUCKET="some.s3.bucket" -e LOG_LEVEL=debug -e MYSQL_HOST=mysql-host-name -e MYSQL_USER=username -e MYSQL_PWD=password kronostechnologies/mysql2s3
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

| Variable              | Default | Description                                                 |
| --------------------- | ------- | ----------------------------------------------------------- |
| AWS_REGION            |         | S3 bucket region                                            |
| AWS_ACCESS_KEY_ID     |         | AWS access key. Leave unset when using an instance role     |
| AWS_SECRET_ACCESS_KEY |         | AWS secret key. Leave unset when using an instance role.    |
| AWS_S3_BUCKET         |         | S3 bucket name                                              |
| AWS_S3_QUEUESIZE      | 4       | S3 multipart parallel upload count                          |
| AWS_S3_PARTSIZE       | 5242880 | S3 multipart chunk size in bytes                            |
| AWS_S3_PREFIX         |         | Add a prefix dir on the S3 bucket                           |
| COMPRESSION_TYPE      | xz      | Compression type (gz, xz, blank: uncompressed).             |
| COMPRESSION_LEVEL     | 2       | Compression level (1-9).                                    |
| COMPRESSION_THREADS   | 1       | Compression threads per dump process (0:auto, n:n threads). |
| CONCURRENCY           | 1       | Number of concurrent dumps.                                 |
| LOG_LEVEL             | info    | Container log level.                                        |
| LOG_CLEAN             | true    | Cleans up sensitive variables in debug output.              |
| MYSQL_HOST            |         | MySQL hostname                                              |
| MYSQL_USER            |         | MySQL username                                              |
| MYSQL_PWD             |         | MySQL password                                              |
