/**
 * Enhanced logger with credential sanitization for security
 * Adds timestamps and redacts sensitive information from logs
 */

/**
 * Sensitive field patterns to redact from logs
 */
const SENSITIVE_PATTERNS = [
  /api[_-]?key/i,
  /password/i,
  /token/i,
  /secret/i,
  /credential/i,
  /auth/i,
  /bearer/i,
  /x-api-key/i,
  /authorization/i
];

/**
 * Recursively sanitizes an object by redacting sensitive fields
 */
function sanitizeForLogging(obj: any, depth = 0): any {
  if (depth > 10) return '[MAX_DEPTH_REACHED]'; // Prevent infinite recursion
  
  if (obj === null || obj === undefined) return obj;
  
  if (typeof obj === 'string') {
    // More specific patterns for secrets to avoid false positives
    const SECRET_PATTERNS = [
      /^sk-[a-zA-Z0-9]+$/,              // API keys starting with sk-
      /^[A-Za-z0-9+/]{32,}={0,2}$/,     // Base64 encoded tokens (32+ chars)
      /^eyJ[A-Za-z0-9+/]+=*$/,          // JWT tokens
      /^AKIA[A-Z0-9]{16}$/,             // AWS access keys
      /^xox[bpoa]-[0-9]{12}-[0-9]{12}-[a-zA-Z0-9]{24}$/, // Slack tokens
      /^ghp_[a-zA-Z0-9]{36}$/,          // GitHub tokens
      /^n8n-api-key-[a-zA-Z0-9]+$/,     // n8n API keys
      /^[a-zA-Z0-9]+-[0-9]+-secret-[a-zA-Z0-9]+$/,  // Pattern like user-12345-secret-id
      /^[a-zA-Z0-9]+-secret-[a-zA-Z0-9]+-[0-9]+$/,  // Pattern like session-secret-token-67890
    ];
    
    // Check if string matches any known secret patterns
    if (SECRET_PATTERNS.some(pattern => pattern.test(obj))) {
      return '[REDACTED_STRING]';
    }
    
    // Additional check for very long alphanumeric strings that look like secrets
    if (obj.length > 50 && !obj.includes(' ') && /^[A-Za-z0-9+/=_-]+$/.test(obj)) {
      return '[REDACTED_STRING]';
    }
    
    return obj;
  }
  
  if (typeof obj !== 'object') return obj;
  
  if (Array.isArray(obj)) {
    return obj.map(item => sanitizeForLogging(item, depth + 1));
  }
  
  const sanitized: any = {};
  
  for (const [key, value] of Object.entries(obj)) {
    const keyLower = key.toLowerCase();
    const isSensitive = SENSITIVE_PATTERNS.some(pattern => pattern.test(keyLower));
    
    if (isSensitive && typeof value !== 'object') {
      // Only redact leaf values, not objects themselves
      sanitized[key] = '[REDACTED]';
    } else {
      sanitized[key] = sanitizeForLogging(value, depth + 1);
    }
  }
  
  return sanitized;
}

/**
 * Sanitizes log arguments to remove sensitive information
 */
function sanitizeArgs(args: any[]): any[] {
  return args.map(arg => {
    if (typeof arg === 'object') {
      return sanitizeForLogging(arg);
    }
    if (typeof arg === 'string' && arg.length > 20 && !arg.includes(' ')) {
      // Potentially a secret string
      return '[REDACTED_ARG]';
    }
    return arg;
  });
}

/**
 * Creates a formatted log message with timestamp and level
 */
function formatLogMessage(level: string, message: string): string {
  const timestamp = new Date().toISOString();
  return `${timestamp} [n8n-workflow-builder] [${level}] ${message}`;
}

export const logger = {
  info: function(message: string = '', ...args: any[]) {
    if (message) {
      console.error(formatLogMessage('info', message));
      if (args.length > 0) {
        const sanitizedArgs = sanitizeArgs(args);
        console.error(...sanitizedArgs);
      }
    }
  },
  
  warn: function(message: string = '', ...args: any[]) {
    if (message) {
      console.error(formatLogMessage('warn', message));
      if (args.length > 0) {
        const sanitizedArgs = sanitizeArgs(args);
        console.error(...sanitizedArgs);
      }
    }
  },
  
  error: function(message: string = '', ...args: any[]) {
    if (message) {
      console.error(formatLogMessage('error', message));
      if (args.length > 0) {
        const sanitizedArgs = sanitizeArgs(args);
        console.error(...sanitizedArgs);
      }
    }
  },
  
  debug: function(message: string = '', ...args: any[]) {
    if (message) {
      console.error(formatLogMessage('debug', message));
      if (args.length > 0) {
        const sanitizedArgs = sanitizeArgs(args);
        console.error(...sanitizedArgs);
      }
    }
  },
  
  log: function(message: string = '', ...args: any[]) {
    if (message) {
      console.error(formatLogMessage('log', message));
      if (args.length > 0) {
        const sanitizedArgs = sanitizeArgs(args);
        console.error(...sanitizedArgs);
      }
    }
  }
};

/**
 * Generates a unique request ID for tracing
 */
export function generateRequestId(): string {
  return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Creates a request-specific logger with correlation ID
 */
export function createRequestLogger(requestId: string) {
  return {
    info: (message: string, ...args: any[]) => 
      logger.info(`[${requestId}] ${message}`, ...args),
    error: (message: string, ...args: any[]) => 
      logger.error(`[${requestId}] ${message}`, ...args),
    debug: (message: string, ...args: any[]) => 
      logger.debug(`[${requestId}] ${message}`, ...args),
    warn: (message: string, ...args: any[]) => 
      logger.warn(`[${requestId}] ${message}`, ...args),
    log: (message: string, ...args: any[]) => 
      logger.log(`[${requestId}] ${message}`, ...args)
  };
}

// Export sanitization functions for use in other modules
export { sanitizeForLogging, sanitizeArgs };

export default logger;
