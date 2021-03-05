FROM node:14 AS builder
MAINTAINER "na-qc@equisoft.com"

WORKDIR /code
COPY ["package.json", ".yarnclean", "yarn.lock", "/code/"]
RUN yarn install && yarn autoclean --force && yarn cache clean


FROM node:14-slim

COPY --from=builder /code /code
WORKDIR /code
COPY [".env", "mysql2s3.js", "README.md", "LICENSE", "/code/"]

RUN apt update && apt install -y mariadb-client --no-install-recommends --no-install-suggests && apt clean && rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/* /usr/share/doc/*

USER 1000
CMD node --expose-gc ./mysql2s3.js
