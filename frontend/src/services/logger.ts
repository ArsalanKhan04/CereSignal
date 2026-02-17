/**
 * Frontend logging service for CereSignal
 * Provides structured logging with configurable levels and optional server-side logging
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  context?: string;
  data?: Record<string, unknown>;
}

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

// Configurable minimum log level (can be changed via environment)
const MIN_LOG_LEVEL: LogLevel = (import.meta.env.VITE_LOG_LEVEL as LogLevel) || 'info';

// Store recent logs in memory for debugging
const LOG_BUFFER_SIZE = 100;
const logBuffer: LogEntry[] = [];

const shouldLog = (level: LogLevel): boolean => {
  return LOG_LEVELS[level] >= LOG_LEVELS[MIN_LOG_LEVEL];
};

const formatLogEntry = (entry: LogEntry): string => {
  let msg = `[${entry.timestamp}] ${entry.level.toUpperCase()}`;
  if (entry.context) {
    msg += ` [${entry.context}]`;
  }
  msg += `: ${entry.message}`;
  return msg;
};

const addToBuffer = (entry: LogEntry): void => {
  logBuffer.push(entry);
  if (logBuffer.length > LOG_BUFFER_SIZE) {
    logBuffer.shift();
  }
};

const createLogEntry = (
  level: LogLevel,
  message: string,
  context?: string,
  data?: Record<string, unknown>
): LogEntry => ({
  timestamp: new Date().toISOString(),
  level,
  message,
  context,
  data,
});

const log = (
  level: LogLevel,
  message: string,
  context?: string,
  data?: Record<string, unknown>
): void => {
  if (!shouldLog(level)) return;

  const entry = createLogEntry(level, message, context, data);
  addToBuffer(entry);

  const formattedMessage = formatLogEntry(entry);

  switch (level) {
    case 'debug':
      console.debug(formattedMessage, data || '');
      break;
    case 'info':
      console.info(formattedMessage, data || '');
      break;
    case 'warn':
      console.warn(formattedMessage, data || '');
      break;
    case 'error':
      console.error(formattedMessage, data || '');
      break;
  }
};

/**
 * Logger object with methods for each log level
 */
export const logger = {
  debug: (message: string, context?: string, data?: Record<string, unknown>) =>
    log('debug', message, context, data),

  info: (message: string, context?: string, data?: Record<string, unknown>) =>
    log('info', message, context, data),

  warn: (message: string, context?: string, data?: Record<string, unknown>) =>
    log('warn', message, context, data),

  error: (message: string, context?: string, data?: Record<string, unknown>) =>
    log('error', message, context, data),

  /**
   * Log an API request
   */
  apiRequest: (method: string, url: string, data?: Record<string, unknown>) =>
    log('info', `API Request: ${method} ${url}`, 'API', data),

  /**
   * Log an API response
   */
  apiResponse: (method: string, url: string, status: number, durationMs?: number) =>
    log('info', `API Response: ${method} ${url} - ${status}${durationMs ? ` (${durationMs}ms)` : ''}`, 'API'),

  /**
   * Log an API error
   */
  apiError: (method: string, url: string, error: unknown) =>
    log('error', `API Error: ${method} ${url}`, 'API', { error: String(error) }),

  /**
   * Log user action
   */
  userAction: (action: string, data?: Record<string, unknown>) =>
    log('info', `User Action: ${action}`, 'USER', data),

  /**
   * Log component lifecycle
   */
  component: (componentName: string, event: string, data?: Record<string, unknown>) =>
    log('debug', `${componentName}: ${event}`, 'COMPONENT', data),

  /**
   * Log navigation
   */
  navigation: (from: string, to: string) =>
    log('info', `Navigation: ${from} -> ${to}`, 'NAV'),

  /**
   * Get recent log entries (useful for debugging)
   */
  getRecentLogs: (): LogEntry[] => [...logBuffer],

  /**
   * Clear log buffer
   */
  clearLogs: (): void => {
    logBuffer.length = 0;
  },
};

export default logger;
