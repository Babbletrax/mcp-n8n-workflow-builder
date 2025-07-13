/**
 * Base handler interface for MCP request handlers
 */

import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import logger, { sanitizeForLogging } from '../utils/logger';
import { UserPermissions } from '../utils/security';

/**
 * Standard tool call result format
 */
export interface ToolCallResult {
  content: Array<{
    type: string;
    text: string;
  }>;
  isError?: boolean;
  [key: string]: unknown;
}

/**
 * Structured error response format
 */
export interface ErrorResponse {
  error: {
    code: string;
    message: string;
    details?: any;
    timestamp: string;
    requestId?: string;
  };
}

/**
 * Standard resource content format
 */
export interface ResourceContent {
  contents: Array<{
    type: string;
    text: string;
    mimeType?: string;
    uri?: string;
  }>;
  [key: string]: unknown;
}

/**
 * Context object passed to all handlers
 */
export interface HandlerContext {
  userPermissions?: UserPermissions;
  isDebugMode: boolean;
  requestId?: string;
}

/**
 * Base class for all MCP handlers
 */
export abstract class BaseHandler {
  protected isDebugMode: boolean;

  constructor(isDebugMode: boolean = false) {
    this.isDebugMode = isDebugMode;
  }

  /**
   * Centralized logging with sanitization
   */
  protected log(level: 'info' | 'error' | 'debug' | 'warn', message: string, ...args: any[]): void {
    const timestamp = new Date().toISOString();
    
    if (this.isDebugMode || level !== 'debug') {
      console.error(`${timestamp} [${this.constructor.name}] [${level}] ${message}`);
      if (args.length > 0) {
        const sanitizedArgs = args.map(arg => {
          if (typeof arg === 'object') {
            return sanitizeForLogging(arg);
          }
          return arg;
        });
        console.error(...sanitizedArgs);
      }
    }
  }

  /**
   * Standardized error handling for handlers
   */
  protected handleError(context: string, error: unknown, requestId?: string): McpError {
    const errorMessage = error instanceof Error ? error.message : String(error);
    this.log('error', `Error in ${context}`, { error: errorMessage, requestId });
    
    if (error instanceof McpError) {
      return error;
    }
    
    return new McpError(ErrorCode.InternalError, `${context}: ${errorMessage}`);
  }

  /**
   * Creates a standard success response
   */
  protected createSuccessResponse(data: any): ToolCallResult {
    return {
      content: [{
        type: 'text',
        text: JSON.stringify(data, null, 2)
      }]
    };
  }

  /**
   * Creates a standard error response
   */
  protected createErrorResponse(message: string): ToolCallResult {
    return {
      content: [{
        type: 'text',
        text: `Error: ${message}`
      }],
      isError: true
    };
  }

  /**
   * Creates a structured error response with detailed information
   */
  protected createStructuredErrorResponse(
    code: string, 
    message: string, 
    details?: any,
    requestId?: string
  ): ToolCallResult {
    const errorResponse: ErrorResponse = {
      error: {
        code,
        message,
        details,
        timestamp: new Date().toISOString(),
        requestId
      }
    };

    return {
      content: [{
        type: 'text',
        text: JSON.stringify(errorResponse, null, 2)
      }],
      isError: true
    };
  }

  /**
   * Validates required parameters
   */
  protected validateRequired(params: Record<string, any>, required: string[]): void {
    const missing = required.filter(param => !params[param]);
    if (missing.length > 0) {
      throw new McpError(ErrorCode.InvalidParams, `Missing required parameters: ${missing.join(', ')}`);
    }
  }

  /**
   * Sanitizes parameters for logging
   */
  protected sanitizeParams(params: any): any {
    return sanitizeForLogging(params);
  }
}

/**
 * Interface for tool handlers
 */
export interface ToolHandler {
  handleTool(toolName: string, args: any, context: HandlerContext): Promise<ToolCallResult>;
  getSupportedTools(): string[];
}

/**
 * Interface for resource handlers
 */
export interface ResourceHandler {
  canHandleResource(uri: string): boolean;
  handleResource(uri: string, context: HandlerContext): Promise<ResourceContent>;
}

/**
 * Interface for prompt handlers
 */
export interface PromptHandler {
  canHandlePrompt(promptId: string): boolean;
  handlePrompt(promptId: string, variables: Record<string, string>, context: HandlerContext): Promise<any>;
}
