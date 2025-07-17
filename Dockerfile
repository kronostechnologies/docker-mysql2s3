FROM node:18 AS builder

WORKDIR /code
COPY ["package.json", ".yarnclean", "yarn.lock", "/code/"]
RUN yarn install && yarn autoclean --force && yarn cache clean

FROM node:20-alpine

# Install dependencies for building MySQL client
RUN apk add --no-cache \
    curl \
    bash \
    python3 \
    make \
    g++ \
    cmake \
    git \
    openssl-dev \
    zlib-dev \
    ncurses-dev \
    bison \
    boost-dev \
    wget \
    libtirpc-dev

# Build MySQL client from source using latest version 9.3.0
WORKDIR /tmp
RUN wget https://dev.mysql.com/get/Downloads/MySQL-9.3/mysql-9.3.0.tar.gz && \
    tar -xzf mysql-9.3.0.tar.gz && \
    cd mysql-9.3.0 && \
    mkdir build && \
    cd build && \
    cmake .. \
        -DCMAKE_INSTALL_PREFIX=/usr/local/mysql \
        -DDOWNLOAD_BOOST=1 \
        -DWITH_BOOST=/tmp/boost \
        -DWITH_SSL=system \
        -DWITH_ZLIB=system \
        -DCMAKE_BUILD_TYPE=Release \
        -DWITHOUT_SERVER=ON \
        -DWITH_UNIT_TESTS=OFF \
        -DENABLED_LOCAL_INFILE=1 \
        -DWITH_INNOBASE_STORAGE_ENGINE=OFF \
        -DWITH_PARTITION_STORAGE_ENGINE=OFF \
        -DWITH_PERFSCHEMA_STORAGE_ENGINE=OFF \
        -DWITH_FEDERATED_STORAGE_ENGINE=OFF \
        -DWITH_BLACKHOLE_STORAGE_ENGINE=OFF \
        -DWITH_EXAMPLE_STORAGE_ENGINE=OFF \
        -DWITH_ARCHIVE_STORAGE_ENGINE=OFF \
        -DWITH_CSV_STORAGE_ENGINE=OFF \
        -DWITH_HEAP_STORAGE_ENGINE=OFF \
        -DWITH_MYISAM_STORAGE_ENGINE=OFF && \
    make -j$(nproc) && \
    make install && \
    ln -s /usr/local/mysql/bin/mysql /usr/local/bin/mysql && \
    ln -s /usr/local/mysql/bin/mysqldump /usr/local/bin/mysqldump && \
    cd / && \
    rm -rf /tmp/mysql-9.3.0* /tmp/boost*

COPY --from=builder /code /code
WORKDIR /code
COPY [".env", "mysql2s3.js", "README.md", "LICENSE", "/code/"]

CMD ["node", "--expose-gc", "./mysql2s3.js"]
