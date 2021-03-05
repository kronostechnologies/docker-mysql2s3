FROM node:14-slim
MAINTAINER "na-qc@equisoft.com"

RUN apt update && apt install -y mariadb-client --no-install-recommends --no-install-suggests && apt clean

WORKDIR /code
COPY ["package.json", ".yarnclean", "yarn.lock", "/code/"]
RUN yarn install && yarn autoclean --force && yarn cache clean
COPY [".env", "mysql2s3.js", "README.md", "LICENSE", "/code/"]

CMD node --expose-gc ./mysql2s3.js
