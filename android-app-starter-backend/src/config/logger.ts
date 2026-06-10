import { pino } from 'pino';
import type { LoggerOptions } from 'pino';

const customLevels = {
  fatal: 60,
  error: 50,
  important: 45,
  warn: 40,
  info: 30,
  debug: 20,
  trace: 10,
};

const isProd = process.env.NODE_ENV === 'production';

const loggerOptions: LoggerOptions = {
  customLevels,
  useOnlyCustomLevels: false,
  level: process.env.LOG_LEVEL || (isProd ? 'important' : 'debug'),
  messageKey: 'msg',
  formatters: {
    level(label: string) {
      return { level: label.toUpperCase() };
    },
  },
  transport: !isProd
    ? {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:standard',
          ignore: 'pid,hostname',
          customColors: 'error:red,important:magenta,warn:yellow,info:blue',
          messageFormat: '[{level}] {msg}',
        },
      }
    : undefined,
};

const logger = pino(loggerOptions);

export default logger;
