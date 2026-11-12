/** Logger: pino for application logs, pino-http for request logs. */
const loggerFile = () => `import pino from 'pino';

// Silent during tests; set LOG_LEVEL in .env to change the level.
export const logger = pino({
  level: process.env.LOG_LEVEL ?? (process.env.NODE_ENV === 'test' ? 'silent' : 'info'),
});
`;

module.exports = {
  key: 'logger',
  label: 'Logger (pino)',
  dependencies: () => ['pino@^10', 'pino-http@^11'],
  files: (o) => [{ path: `src/common/utils/logger.${o.ext}`, content: loggerFile() }],
  envLines: () => ['LOG_LEVEL=info'],
};
