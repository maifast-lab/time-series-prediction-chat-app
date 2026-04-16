type LogLevel = 'info' | 'error' | 'warn' | 'debug';

interface LogPayload {
  message: string;
  level: LogLevel;
  timestamp: string;
  [key: string]: unknown;
}

const isServer = typeof window === 'undefined';

const log = (level: LogLevel, message: string, data?: unknown) => {
  const payload: LogPayload = {
    message,
    level,
    timestamp: new Date().toISOString(),
    ...(data as Record<string, unknown>),
  };

  if (isServer) {
    const output = JSON.stringify(payload) + '\n';
    if (level === 'error') {
      process.stderr.write(output);
    } else {
      process.stdout.write(output);
    }
  } else {
    const args = [message, data].filter(Boolean);
    switch (level) {
      case 'error':
        console.error(...args);
        break;
      case 'warn':
        console.warn(...args);
        break;
      case 'debug':
        console.debug(...args);
        break;
      default:
        console.log(...args);
        break;
    }
  }
};

export const logger = {
  info: (message: string, data?: unknown) => log('info', message, data),
  error: (message: string, error?: unknown, data?: unknown) =>
    log('error', message, {
      error:
        error instanceof Error
          ? { message: error.message, stack: error.stack }
          : error,
      ...(data as Record<string, unknown>),
    }),
  warn: (message: string, data?: unknown) => log('warn', message, data),
  debug: (message: string, data?: unknown) => log('debug', message, data),
};
