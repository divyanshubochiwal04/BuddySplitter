export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

class Logger {
  private format(level: LogLevel, message: string): string {
    const timestamp = new Date().toISOString();
    return `[${timestamp}] [${level.toUpperCase()}] ${message}`;
  }

  debug(message: string, ...args: unknown[]): void {
    if (process.env.NODE_ENV !== 'test') {
      console.debug(this.format('debug', message), ...args);
    }
  }

  info(message: string, ...args: unknown[]): void {
    if (process.env.NODE_ENV !== 'test') {
      console.info(this.format('info', message), ...args);
    }
  }

  warn(message: string, ...args: unknown[]): void {
    console.warn(this.format('warn', message), ...args);
  }

  error(message: string, ...args: unknown[]): void {
    console.error(this.format('error', message), ...args);
  }
}

export const logger = new Logger();
