FROM node:18 AS builder

WORKDIR /code
COPY ["package.json", ".yarnclean", "yarn.lock", "/code/"]
RUN yarn install && yarn autoclean --force && yarn cache clean

FROM node:20-alpine

COPY --from=builder /code /code
WORKDIR /code
COPY [".env", "mysql2s3.js", "README.md", "LICENSE", "/code/"]

RUN apk add mysql-client && rm -f /var/cache/apk/*

USER 1000
CMD node --expose-gc ./mysql2s3.js
