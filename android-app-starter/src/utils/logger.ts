type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const enabled = import.meta.env.DEV || import.meta.env.VITE_ENABLE_LOGS === 'true';

const write = (level: LogLevel, args: unknown[]) => {
  if (!enabled && level !== 'error') return;
  console[level](...args);
};

export const logger = {
  log: (...args: unknown[]) => write('debug', args),
  debug: (...args: unknown[]) => write('debug', args),
  info: (...args: unknown[]) => write('info', args),
  warn: (...args: unknown[]) => write('warn', args),
  error: (...args: unknown[]) => write('error', args),
};
