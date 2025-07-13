/**
 * Unit tests for BaseHandler class
 */

import { BaseHandler, HandlerContext, ToolCallResult } from '../BaseHandler';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';

// Create a concrete implementation for testing
class TestHandler extends BaseHandler {
  public testLog(level: 'info' | 'error' | 'debug' | 'warn', message: string, ...args: any[]): void {
    this.log(level, message, ...args);
  }

  public testHandleError(context: string, error: unknown, requestId?: string): McpError {
    return this.handleError(context, error, requestId);
  }

  public testCreateSuccessResponse(data: any): ToolCallResult {
    return this.createSuccessResponse(data);
  }

  public testCreateErrorResponse(message: string): ToolCallResult {
    return this.createErrorResponse(message);
  }

  public testValidateRequired(params: Record<string, any>, required: string[]): void {
    this.validateRequired(params, required);
  }

  public testSanitizeParams(params: any): any {
    return this.sanitizeParams(params);
  }
}

describe('BaseHandler', () => {
  let handler: TestHandler;
  let consoleSpy: jest.SpyInstance;

  beforeEach(() => {
    handler = new TestHandler(false);
    consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  describe('constructor', () => {
    it('should initialize with debug mode false by default', () => {
      const defaultHandler = new TestHandler();
      expect(defaultHandler['isDebugMode']).toBe(false);
    });

    it('should initialize with debug mode true when specified', () => {
      const debugHandler = new TestHandler(true);
      expect(debugHandler['isDebugMode']).toBe(true);
    });
  });

  describe('log', () => {
    it('should log info messages', () => {
      handler.testLog('info', 'Test message');
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringMatching(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z \[TestHandler\] \[info\] Test message/)
      );
    });

    it('should not log debug messages when debug mode is disabled', () => {
      handler.testLog('debug', 'Debug message');
      expect(consoleSpy).not.toHaveBeenCalled();
    });

    it('should log debug messages when debug mode is enabled', () => {
      const debugHandler = new TestHandler(true);
      debugHandler.testLog('debug', 'Debug message');
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringMatching(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z \[TestHandler\] \[debug\] Debug message/)
      );
    });

    it('should sanitize object arguments', () => {
      const sensitiveData = { password: 'secret123', data: 'public' };
      handler.testLog('info', 'Test message', sensitiveData);
      expect(consoleSpy).toHaveBeenCalledTimes(2);
    });
  });

  describe('handleError', () => {
    it('should return McpError unchanged', () => {
      const originalError = new McpError(ErrorCode.InvalidParams, 'Test error');
      const result = handler.testHandleError('test context', originalError);
      expect(result).toBe(originalError);
    });

    it('should wrap Error objects in McpError', () => {
      const originalError = new Error('Test error');
      const result = handler.testHandleError('test context', originalError);
      expect(result).toBeInstanceOf(McpError);
      expect(result.code).toBe(ErrorCode.InternalError);
      expect(result.message).toContain('test context: Test error');
    });

    it('should wrap non-Error objects in McpError', () => {
      const result = handler.testHandleError('test context', 'string error');
      expect(result).toBeInstanceOf(McpError);
      expect(result.code).toBe(ErrorCode.InternalError);
      expect(result.message).toContain('test context: string error');
    });
  });

  describe('createSuccessResponse', () => {
    it('should create properly formatted success response', () => {
      const data = { key: 'value', number: 42 };
      const result = handler.testCreateSuccessResponse(data);
      
      expect(result).toEqual({
        content: [{
          type: 'text',
          text: JSON.stringify(data, null, 2)
        }]
      });
    });

    it('should handle null data', () => {
      const result = handler.testCreateSuccessResponse(null);
      expect(result.content[0].text).toBe('null');
    });
  });

  describe('createErrorResponse', () => {
    it('should create properly formatted error response', () => {
      const result = handler.testCreateErrorResponse('Test error message');
      
      expect(result).toEqual({
        content: [{
          type: 'text',
          text: 'Error: Test error message'
        }],
        isError: true
      });
    });
  });

  describe('validateRequired', () => {
    it('should pass when all required parameters are present', () => {
      const params = { name: 'test', id: '123', type: 'workflow' };
      expect(() => {
        handler.testValidateRequired(params, ['name', 'id']);
      }).not.toThrow();
    });

    it('should throw McpError when required parameters are missing', () => {
      const params = { name: 'test' };
      expect(() => {
        handler.testValidateRequired(params, ['name', 'id', 'type']);
      }).toThrow(McpError);
    });

    it('should throw with correct error message listing missing parameters', () => {
      const params = { name: 'test' };
      expect(() => {
        handler.testValidateRequired(params, ['name', 'id', 'type']);
      }).toThrow('Missing required parameters: id, type');
    });

    it('should treat empty string as missing', () => {
      const params = { name: '', id: '123' };
      expect(() => {
        handler.testValidateRequired(params, ['name', 'id']);
      }).toThrow('Missing required parameters: name');
    });

    it('should treat null as missing', () => {
      const params = { name: null, id: '123' };
      expect(() => {
        handler.testValidateRequired(params, ['name', 'id']);
      }).toThrow('Missing required parameters: name');
    });

    it('should treat undefined as missing', () => {
      const params = { name: undefined, id: '123' };
      expect(() => {
        handler.testValidateRequired(params, ['name', 'id']);
      }).toThrow('Missing required parameters: name');
    });
  });

  describe('sanitizeParams', () => {
    it('should sanitize sensitive parameters', () => {
      const params = {
        password: 'secret123',
        apiKey: 'key123',
        normalField: 'public data'
      };
      
      const result = handler.testSanitizeParams(params);
      expect(result.password).toBe('[REDACTED]');
      expect(result.apiKey).toBe('[REDACTED]');
      expect(result.normalField).toBe('public data');
    });

    it('should handle nested objects', () => {
      const params = {
        config: {
          password: 'secret',
          settings: {
            apiKey: 'key123',
            timeout: 5000
          }
        }
      };
      
      const result = handler.testSanitizeParams(params);
      expect(result.config.password).toBe('[REDACTED]');
      expect(result.config.settings.apiKey).toBe('[REDACTED]');
      expect(result.config.settings.timeout).toBe(5000);
    });
  });
});