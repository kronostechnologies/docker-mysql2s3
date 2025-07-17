#!/usr/local/bin/node
require('dotenv').config();

const child_process = require('child_process');
const dateFormat = require('dateformat');
const lzma = require('lzma-native');
const zlib = require('zlib');
const stream = require('stream');
const mysql = require('mysql');
const sentry = require("@sentry/node");

const winston = require('winston');

const logger = winston.createLogger({
	level: process.env.LOG_LEVEL,
	format: winston.format.combine(
		winston.format.timestamp(),
		winston.format.json(),
	),
	transports: [
		new winston.transports.Console()
	]
});

const AWS = require('aws-sdk');
AWS.config.region = process.env.AWS_REGION;
const S3 = new AWS.S3();

let bytes = 0;

const config = {
	concurrency: process.env.CONCURRENCY,
	environment: process.env.ENVIRONMENT || '',
	backup: {
		mysql: {
			host: process.env.MYSQL_HOST,
			user: process.env.MYSQL_USER,
			password: process.env.MYSQL_PWD,
			max_allowed_packet: process.env.MAX_ALLOWED_PACKET || "256000000",
		},
		s3: {
			bucket: process.env.AWS_S3_BUCKET,
			queueSize: process.env.AWS_S3_QUEUESIZE,
			partSize: process.env.AWS_S3_PARTSIZE,
			prefix: process.env.AWS_S3_PREFIX || '',
		},
		compression: {
			type: process.env.COMPRESSION_TYPE,
			level: process.env.COMPRESSION_LEVEL,
			threads: process.env.COMPRESSION_THREADS,
		},
	},
	sentry: {
		dsn: process.env.SENTRY_DSN,
		monitor_slug: process.env.SENTRY_MONITOR_SLUG,
	}
};

if (config.sentry.dsn) {
	if (!config.sentry.monitor_slug) {
		throw new Error("SENTRY_MONITOR_SLUG is required when SENTRY_DSN is set");
	}
	sentry.init({
		dsn: config.sentry.dsn,
		environment: config.environment,
		tracesSampleRate: 0.0,
	});
}

const start = async () => {
	let checkInId;
	try {
		logger.info('Starting backup');
		logger.debug('### ENVIRONMENT ###');
		logger.debug(_cleanSensitiveEnvInformation(process.env));
		logger.debug('#####################');
	
		if (config.sentry.dsn) {
			checkInId = sentry.captureCheckIn({
				monitorSlug: config.sentry.monitor_slug,
				status: "in_progress",
			});
		}

		const databases = await _getDatabases(config.backup.mysql);
		await _launchConcurrentBackups(databases, config);
		logger.info('Backup successful');

		if (config.sentry.dsn) {
			sentry.captureCheckIn({
				checkInId,
				monitorSlug: config.sentry.monitor_slug,
				status: "ok",
			});
		}
	}
	catch(e) {
		process.exitCode = 1;
		logger.error(`Backup failed: ${e}`)
		if (e.stack) {
			logger.debug(e.stack);
		}
		if (config.sentry.dsn && checkInId) {
			sentry.captureCheckIn({
				checkInId,
				monitorSlug: config.sentry.monitor_slug,
				status: "error",
			});
		}
	}
};

const _getDatabases = (config) => {
	return new Promise((resolve, reject) => {
		const connection = mysql.createConnection({
			host: config.host,
			user: config.user,
			password: config.password,
			database: 'INFORMATION_SCHEMA'
		});

		connection.connect();
		connection.query({
			sql: 'SELECT SCHEMA_NAME FROM SCHEMATA WHERE SCHEMA_NAME NOT IN ("information_schema", "performance_schema")',
		}, (error, results) => {
			if(error) {
				reject(error);
			}
			else {
				resolve(results.map(v => v.SCHEMA_NAME));
			}
		});
		connection.end();
	});
};

const _launchConcurrentBackups = async (databases, config) => {
	let success = 0;
	let skipped = 0;

	let count = databases.length;
	logger.info(`${count} databases found`);

	let loops = [];

	for(let i = 0; i < config.concurrency; i++) {
		loops.push((async () => {
			for(let database; database = databases.shift();) {
				if(database != "mysql") {
					logger.debug(`Starting backup job from loop ${i + 1} of ${config.concurrency}`);
					try {
						const begin = (new Date()).getTime();
						const result = await _backupDatabase(database, config.backup);
						const end = ((new Date()).getTime() - begin)/1000;
						if(result) {
							logger.info(`'${database}' backup finished in ${end}s`);
							success++;
						}
						else {
							logger.debug(`'${database}' backup skipped...`);
							skipped++;
						}
						gc();
					}
					catch(e) {
						logger.error(`'${database}' backup error: ${e}`);
						if (e.stack) {
							logger.debug(e.stack);
						}
					}
				} else {
					count--;
				}
			}
			logger.debug(`Loop ${i + 1} finished`);
		})());
	}

	await Promise.all(loops);

	logger.info(`${success} successful backups; ${skipped} skipped out of ${count}`);
	logger.info(`${bytes} bytes uploaded`);
	await new Promise(resolve => setTimeout(resolve, 180000)); // Wait 3 minutes before resolving to give mysqldump time to finish
	
	const errors = count - skipped - success;
	if(errors) {
		throw `${errors} errors occurred!`;
	}
};

const _backupDatabase = async (database, config) => {
	let s3key = dateFormat(new Date(), "UTC:yyyy'/'mm'/'dd'/" + database + ".sql.xz'");

	if(config.s3.prefix != '') {
		s3key = config.s3.prefix + '/' + s3key
	}

	if(await _getS3ObjectExists({bucket: config.s3.bucket, key: s3key})) {
		return false;
	}

	return new Promise((resolve, reject) => {
		logger.info(`'${database}' backup started`);
		logger.debug(s3key);

		const data_stream = new stream.PassThrough({
			highWaterMark: 131072
		});

		const compressed_stream = _getCompressedStream({
			type: config.compression.type,
			level: config.compression.level,
			threads: config.compression.threads,
			input: data_stream
		});

		const ondumpsuccess = (data) => {
			logger.debug(data);
		};

		const ondumperror = (error) => {
			logger.debug(error);

			if(s3upload) {
				s3upload.abort();
			}
			else {
				reject(`mysqldump error: ${error}`);
			}
		};

		const mysqldump = _getMySqlDump({
			host: config.mysql.host,
			user: config.mysql.user,
			password: config.mysql.password,
			database: database,
			max_allowed_packet: config.mysql.max_allowed_packet,
			stream: data_stream,
			success: ondumpsuccess,
			error: ondumperror
		});

		const ons3error = (error) => {
			logger.debug(error);

			if(mysqldump) {
				mysqldump.kill();
			}
			reject(`S3 error: ${error.message}`);
		};

		const ons3success = (data) => {
			logger.debug(data);

			resolve(true);
		};

		const s3upload = _getS3Upload({
			key: s3key,
			bucket: config.s3.bucket,
			stream: compressed_stream,
			success: ons3success,
			error: ons3error
		});
	});
};

/**
 * @param {Object} config
 * @param {string} config.bucket: S3 bucket
 * @param {string} config.key: S3 key
 * @private
 */
const _getS3ObjectExists = async (config) => {
	return new Promise((resolve, reject) => {
		S3.listObjectsV2({
			Bucket: config.bucket,
			Prefix: config.key
		}, (error, data) => {
			if(error) {
				logger.debug(error);
				reject(error.message);
			}
			else {
				resolve(Boolean(data.KeyCount));
			}
		})
	});
};

/**
 * @param {Object} config
 * @param {string} config.bucket: S3 bucket
 * @param {string} config.key: S3 key
 * @param {string} config.partSize: S3 multipart chunk size
 * @param {string} config.queueSize: S3 multipart parallel upload count
 * @param {stream.Readable} config.stream: Data stream to write into
 * @param {function} config.success: Function to call on success
 * @param {function} config.error: Function to call on error
 * @private
 */
const _getS3Upload = (config) => {
	const s3options = {
		partSize: config.partSize,
		queueSize: config.queueSize
	};

	const s3params = {
		Bucket: config.bucket,
		Key: config.key,
		ServerSideEncryption: 'AES256',
		Body: config.stream
	};

	return S3.upload(s3params, s3options, (error, data) => {
		if(error) {
			config.error(error);
		}
		else {
			config.success(data);
		}
	}).on('httpUploadProgress', (progress) => {
		logger.debug(`${config.key} chunk uploaded to S3 (${progress.loaded} bytes)`);

		if(progress.total && progress.total === progress.loaded) {
			bytes += progress.total;
			logger.info(`${config.key} finished uploading to S3 (${progress.total} bytes)`);
		}
	});
};

/**
 * @param {Object} config
 * @param {string} config.host: MySQL Host
 * @param {string} config.user: MySQL User
 * @param {string} config.password: MySQL Password
 * @param {string} config.database: Database to dump
 * @param {stream.Writable} config.stream: Data stream to write into
 * @param {function} config.success: Function to call on success
 * @param {function} config.error: Function to call on error
 * @private
 */
const _getMySqlDump = (config) => {
	const mysqldump = child_process.spawn(
		'mysqldump',
		[
			'-h', config.host,
			'-u', config.user,
			'--single-transaction',
			'--skip-lock-tables',
			config.database
		],
		{
			stdio: ['ignore', 'pipe', 'ignore'],
			env: {
				MYSQL_PWD: config.password
			},
			maxBuffer: 1048576
		}
	);

	mysqldump.stdout.on('data', (chunk) => {
		if(!config.stream.write(chunk)) {
			mysqldump.stdout.pause();
			mysqldump.kill('SIGSTOP');

			config.stream.once('drain', () => {
				mysqldump.kill('SIGCONT');
				mysqldump.stdout.resume();
			});
		}
	});

	const onclose = (code, signal) => {
		if(code === 0) {
			config.success(`mysqldump '${config.database}' finished successfully`);
			config.stream.end();
		}
		else {
			config.error(`mysqldump '${config.database}' exited with ${code || signal}`);
		}
	};

	mysqldump.on('close', onclose);

	mysqldump.on('error', (error) => {
		mysqldump.removeListener('close', onclose);
		config.error(`could not start mysqldump '${config.database}': ${error}`);
	});

	return mysqldump;
};


/**
 * @param {Object} config
 * @param {string} config.type: Compression type (gz, xz, blank: uncompressed)
 * @param {number} config.level: Compression level (1-9)
 * @param {string} config.threads: Compression threads for process (0:auto, n:n threads)
 * @param {stream.Readable} config.input: Data stream to read from
 * @private
 */
const _getCompressedStream = (config) => {
	let compressor = undefined;
	switch(config.type) {
		case 'xz':
			compressor = lzma.createCompressor({
				preset: config.level,
				threads: config.threads,
				check: lzma.CHECK_CRC32
			});
			break;
		case 'gz':
			compressor = zlib.createGzip({
				level: config.level,
			});
			break;
	}

	if(compressor) {
		return config.input.pipe(compressor);
	}
	else {
		return config.input;
	}

};

const _cleanSensitiveEnvInformation = (env) => {
	if(env.LOG_CLEAN) {
		let env_copy = JSON.parse(JSON.stringify(env));
		env_copy.AWS_SECRET_ACCESS_KEY = env_copy.AWS_SECRET_ACCESS_KEY ? '*****' : '#EMPTY#';
		env_copy.MYSQL_PWD = env_copy.MYSQL_PWD ? '*****' : '#EMPTY#';
		return env_copy;
	}
	return env;
}


start();
