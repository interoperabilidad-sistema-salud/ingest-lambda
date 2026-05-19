const LOG_LEVELS = { DEBUG: 0, INFO: 1, WARN: 2, ERROR: 3 };
const currentLevel = LOG_LEVELS[process.env.LOG_LEVEL?.toUpperCase()] ?? LOG_LEVELS.INFO;

function buildLogEntry(level, message, context = {}) {
  return JSON.stringify({
    timestamp: new Date().toISOString(),
    level,
    message,
    service: 'lambda-ingest',
    environment: process.env.NODE_ENV ?? 'dev',
    ...context,
  });
}

export const logger = {
  debug: (message, context) => {
    if (currentLevel <= LOG_LEVELS.DEBUG) console.debug(buildLogEntry('DEBUG', message, context));
  },
  info: (message, context) => {
    if (currentLevel <= LOG_LEVELS.INFO) console.info(buildLogEntry('INFO', message, context));
  },
  warn: (message, context) => {
    if (currentLevel <= LOG_LEVELS.WARN) console.warn(buildLogEntry('WARN', message, context));
  },
  error: (message, context) => {
    if (currentLevel <= LOG_LEVELS.ERROR) console.error(buildLogEntry('ERROR', message, context));
  },
};