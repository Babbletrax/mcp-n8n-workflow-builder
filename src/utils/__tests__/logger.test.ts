/**
 * Unit tests for logger with credential sanitization
 */

import { sanitizeForLogging, sanitizeArgs } from '../logger';

describe('Logger Sanitization', () => {
  describe('sanitizeForLogging', () => {
    it('should redact sensitive field names', () => {
      const sensitive = {
        api_key: 'secret123',
        password: 'mypassword',
        token: 'bearer-token',
        secret: 'topsecret',
        credential: 'user:pass',
        auth: 'auth-header',
        bearer: 'bearer-value',
        'x-api-key': 'api-key-value',
        authorization: 'Basic dXNlcjpwYXNz',
        // Non-sensitive fields
        name: 'test-workflow',
        id: '12345',
        status: 'active'
      };

      const sanitized = sanitizeForLogging(sensitive);

      // Sensitive fields should be redacted
      expect(sanitized.api_key).toBe('[REDACTED]');
      expect(sanitized.password).toBe('[REDACTED]');
      expect(sanitized.token).toBe('[REDACTED]');
      expect(sanitized.secret).toBe('[REDACTED]');
      expect(sanitized.credential).toBe('[REDACTED]');
      expect(sanitized.auth).toBe('[REDACTED]');
      expect(sanitized.bearer).toBe('[REDACTED]');
      expect(sanitized['x-api-key']).toBe('[REDACTED]');
      expect(sanitized.authorization).toBe('[REDACTED]');

      // Non-sensitive fields should remain
      expect(sanitized.name).toBe('test-workflow');
      expect(sanitized.id).toBe('12345');
      expect(sanitized.status).toBe('active');
    });

    it('should handle case-insensitive field names', () => {
      const sensitive = {
        API_KEY: 'secret123',
        Password: 'mypassword',
        TOKEN: 'bearer-token',
        Secret: 'topsecret'
      };

      const sanitized = sanitizeForLogging(sensitive);

      expect(sanitized.API_KEY).toBe('[REDACTED]');
      expect(sanitized.Password).toBe('[REDACTED]');
      expect(sanitized.TOKEN).toBe('[REDACTED]');
      expect(sanitized.Secret).toBe('[REDACTED]');
    });

    it('should redact strings that look like secrets', () => {
      const secretLookingStrings = [
        'sk-1234567890abcdef1234567890abcdef', // API key pattern
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9', // JWT pattern
        'AKIA1234567890ABCDEF', // AWS access key pattern
        'n8n-api-key-1234567890abcdef' // n8n API key pattern
      ];

      secretLookingStrings.forEach(secret => {
        const sanitized = sanitizeForLogging(secret);
        expect(sanitized).toBe('[REDACTED_STRING]');
      });
    });

    it('should preserve normal strings', () => {
      const normalStrings = [
        'hello world',
        'test',
        'short',
        'workflow-name-with-dashes',
        'This is a normal sentence with spaces.'
      ];

      normalStrings.forEach(str => {
        const sanitized = sanitizeForLogging(str);
        expect(sanitized).toBe(str);
      });
    });

    it('should handle nested objects recursively', () => {
      const nested = {
        user: {
          name: 'John Doe',
          credentials: {
            api_key: 'secret123',
            token: 'bearer-token'
          }
        },
        config: {
          database: {
            password: 'dbpass',
            host: 'localhost'
          }
        }
      };

      const sanitized = sanitizeForLogging(nested);

      expect(sanitized.user.name).toBe('John Doe');
      expect(sanitized.user.credentials.api_key).toBe('[REDACTED]');
      expect(sanitized.user.credentials.token).toBe('[REDACTED]');
      expect(sanitized.config.database.password).toBe('[REDACTED]');
      expect(sanitized.config.database.host).toBe('localhost');
    });

    it('should handle arrays', () => {
      const arrayData = [
        { name: 'item1', api_key: 'secret1' },
        { name: 'item2', token: 'secret2' },
        'normal string',
        'sk-secretlookingstring123456'
      ];

      const sanitized = sanitizeForLogging(arrayData);

      expect(sanitized[0].name).toBe('item1');
      expect(sanitized[0].api_key).toBe('[REDACTED]');
      expect(sanitized[1].name).toBe('item2');
      expect(sanitized[1].token).toBe('[REDACTED]');
      expect(sanitized[2]).toBe('normal string');
      expect(sanitized[3]).toBe('[REDACTED_STRING]');
    });

    it('should prevent infinite recursion', () => {
      const circular: any = { name: 'test' };
      circular.self = circular;

      // Should not throw and should handle deep nesting
      const result = sanitizeForLogging(circular);
      expect(result.name).toBe('test');
      // At some depth, it should hit the max depth limit
    });

    it('should handle null and undefined values', () => {
      expect(sanitizeForLogging(null)).toBeNull();
      expect(sanitizeForLogging(undefined)).toBeUndefined();
      
      const withNulls = {
        name: 'test',
        empty: null,
        missing: undefined,
        api_key: 'secret'
      };

      const sanitized = sanitizeForLogging(withNulls);
      expect(sanitized.name).toBe('test');
      expect(sanitized.empty).toBeNull();
      expect(sanitized.missing).toBeUndefined();
      expect(sanitized.api_key).toBe('[REDACTED]');
    });

    it('should handle primitive values', () => {
      expect(sanitizeForLogging(123)).toBe(123);
      expect(sanitizeForLogging(true)).toBe(true);
      expect(sanitizeForLogging(false)).toBe(false);
    });
  });

  describe('sanitizeArgs', () => {
    it('should sanitize object arguments', () => {
      const args = [
        { name: 'test', api_key: 'secret' },
        'normal string',
        123,
        { token: 'bearer-token', data: 'safe' }
      ];

      const sanitized = sanitizeArgs(args);

      expect(sanitized[0].name).toBe('test');
      expect(sanitized[0].api_key).toBe('[REDACTED]');
      expect(sanitized[1]).toBe('normal string');
      expect(sanitized[2]).toBe(123);
      expect(sanitized[3].token).toBe('[REDACTED]');
      expect(sanitized[3].data).toBe('safe');
    });

    it('should redact potentially secret strings', () => {
      const args = [
        'normal message',
        'sk-1234567890abcdef1234567890abcdef', // Long string without spaces (potential secret)
        'short',
        'this is a normal sentence with spaces'
      ];

      const sanitized = sanitizeArgs(args);

      expect(sanitized[0]).toBe('normal message');
      expect(sanitized[1]).toBe('[REDACTED_ARG]');
      expect(sanitized[2]).toBe('short');
      expect(sanitized[3]).toBe('this is a normal sentence with spaces');
    });

    it('should handle mixed argument types', () => {
      const args = [
        'message',
        { api_key: 'secret', name: 'test' },
        123,
        true,
        null,
        undefined,
        ['array', 'of', 'values']
      ];

      const sanitized = sanitizeArgs(args);

      expect(sanitized[0]).toBe('message');
      expect(sanitized[1].api_key).toBe('[REDACTED]');
      expect(sanitized[1].name).toBe('test');
      expect(sanitized[2]).toBe(123);
      expect(sanitized[3]).toBe(true);
      expect(sanitized[4]).toBeNull();
      expect(sanitized[5]).toBeUndefined();
      expect(sanitized[6]).toEqual(['array', 'of', 'values']);
    });
  });

  describe('Real-world scenarios', () => {
    it('should sanitize n8n API configuration', () => {
      const n8nConfig = {
        baseURL: 'https://n8n.example.com/api/v1/',
        headers: {
          'x-api-key': 'n8n-secret-key-123',
          'user-agent': 'n8n-mcp-client/1.0',
          'content-type': 'application/json'
        },
        timeout: 30000
      };

      const sanitized = sanitizeForLogging(n8nConfig);

      expect(sanitized.baseURL).toBe('https://n8n.example.com/api/v1/');
      expect(sanitized.headers['x-api-key']).toBe('[REDACTED]');
      expect(sanitized.headers['user-agent']).toBe('n8n-mcp-client/1.0');
      expect(sanitized.headers['content-type']).toBe('application/json');
      expect(sanitized.timeout).toBe(30000);
    });

    it('should sanitize axios error response', () => {
      const axiosError = {
        config: {
          url: 'https://api.example.com/workflows',
          headers: {
            authorization: 'Bearer secret-token-123',
            'content-type': 'application/json'
          },
          data: { name: 'test-workflow' }
        },
        response: {
          status: 401,
          data: { error: 'Unauthorized', message: 'Invalid API key' }
        }
      };

      const sanitized = sanitizeForLogging(axiosError);

      expect(sanitized.config.url).toBe('https://api.example.com/workflows');
      expect(sanitized.config.headers.authorization).toBe('[REDACTED]');
      expect(sanitized.config.headers['content-type']).toBe('application/json');
      expect(sanitized.config.data.name).toBe('test-workflow');
      expect(sanitized.response.status).toBe(401);
      expect(sanitized.response.data.error).toBe('Unauthorized');
    });

    it('should sanitize user permissions object', () => {
      const userPermissions = {
        allowedInstances: ['production', 'staging'],
        role: 'admin',
        userId: 'user-12345-secret-id',
        sessionId: 'session-secret-token-67890',
        metadata: {
          lastLogin: '2023-01-01T00:00:00Z',
          ipAddress: '192.168.1.1'
        }
      };

      const sanitized = sanitizeForLogging(userPermissions);

      expect(sanitized.allowedInstances).toEqual(['production', 'staging']);
      expect(sanitized.role).toBe('admin');
      // These are not caught by field name patterns but would be by string pattern
      expect(sanitized.userId).toBe('[REDACTED_STRING]');
      expect(sanitized.sessionId).toBe('[REDACTED_STRING]');
      expect(sanitized.metadata.lastLogin).toBe('2023-01-01T00:00:00Z');
      expect(sanitized.metadata.ipAddress).toBe('192.168.1.1');
    });
  });
});