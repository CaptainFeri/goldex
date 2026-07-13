import { LoggerService, LogLevel } from '@nestjs/common';

const RESET = '\x1b[0m';
const DIM = '\x1b[2m';
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const MAGENTA = '\x1b[35m';
const CYAN = '\x1b[36m';
const BLUE = '\x1b[34m';

const LEVEL_STYLE: Record<string, string> = {
  log: GREEN,
  error: RED,
  warn: YELLOW,
  debug: MAGENTA,
  verbose: CYAN,
};

function formatMessage(
  level: string,
  message: unknown,
  context?: string,
): string {
  const timestamp = new Date().toISOString();
  const color = LEVEL_STYLE[level] ?? GREEN;
  const ctx = context ? ` ${BLUE}[${context}]${RESET}` : '';
  const msg = typeof message === 'string' ? message : JSON.stringify(message);
  return `${DIM}${timestamp}${RESET} ${color}[${level.toUpperCase()}]${RESET}${ctx} ${msg}`;
}

export class ColoredConsoleLogger implements LoggerService {
  private levels: Set<LogLevel> = new Set([
    'log',
    'error',
    'warn',
    'debug',
    'verbose',
  ]);

  setLogLevels(levels: LogLevel[]): void {
    this.levels = new Set(levels);
  }

  private isLevelEnabled(level: LogLevel): boolean {
    return this.levels.has(level);
  }

  log(message: unknown, context?: string): void {
    if (!this.isLevelEnabled('log')) return;
    console.log(formatMessage('log', message, context));
  }

  error(message: unknown, ...optionalParams: any[]): void {
    if (!this.isLevelEnabled('error')) return;
    const traceOrContext: unknown = optionalParams[0];
    const maybeContext: unknown = optionalParams[1];
    const context =
      typeof maybeContext === 'string'
        ? maybeContext
        : typeof traceOrContext === 'string'
          ? traceOrContext
          : undefined;
    const trace =
      typeof traceOrContext === 'string' && optionalParams.length > 1
        ? traceOrContext
        : undefined;
    const msg: unknown = trace
      ? `${typeof message === 'string' ? message : JSON.stringify(message)}\n${trace}`
      : message;
    console.error(formatMessage('error', msg, context));
  }

  warn(message: unknown, context?: string): void {
    if (!this.isLevelEnabled('warn')) return;
    console.warn(formatMessage('warn', message, context));
  }

  debug(message: unknown, context?: string): void {
    if (!this.isLevelEnabled('debug')) return;
    console.debug(formatMessage('debug', message, context));
  }

  verbose(message: unknown, context?: string): void {
    if (!this.isLevelEnabled('verbose')) return;
    console.log(formatMessage('verbose', message, context));
  }
}
