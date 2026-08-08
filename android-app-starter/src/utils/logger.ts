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

  /**
   * Always logs to the console, including production native builds.
   * Use for temporary debugging on the Android emulator or device: filter logcat
   * with the tag, e.g. `adb logcat | findstr mytag` (Windows) or
   * `adb logcat | grep mytag` (macOS/Linux). Plain objects are JSON-stringified
   * so logcat lines stay readable. Remove call sites before release if log volume matters.
   *
   * @param tag Short filter token printed as `[tag]`.
   * @param args Message parts to log after the tag.
   */
  simulatorDebugLog: (tag: string, ...args: unknown[]) => {
    const formatted = args.map((arg) => {
      if (arg !== null && typeof arg === 'object') {
        try {
          return JSON.stringify(arg);
        } catch {
          return arg;
        }
      }
      return arg;
    });
    console.log(`[${tag}]`, ...formatted);
  }

};
