/**
 * Unit tests for security utilities
 */

import {
  validateInstanceAccess,
  validateOperationPermission,
  validateAccess,
  checkRateLimit,
  clearRateLimitStore,
  sanitizeUserPermissions,
  createDefaultAdminUser,
  UserPermissions,
  PermissionLevel,
  OperationType,
  AuthorizationError,
  InstanceAccessError
} from '../security';

describe('Security Utils', () => {
  describe('validateInstanceAccess', () => {
    const availableInstances = ['production', 'staging', 'development'];
    
    it('should allow access when no instance is specified', () => {
      expect(() => validateInstanceAccess(undefined, availableInstances)).not.toThrow();
    });

    it('should allow access when no user permissions are provided (backward compatibility)', () => {
      expect(() => validateInstanceAccess('production', availableInstances)).not.toThrow();
    });

    it('should throw error for non-existent instance', () => {
      expect(() => validateInstanceAccess('invalid', availableInstances)).toThrow(
        "Instance 'invalid' not found. Available instances: production, staging, development"
      );
    });

    it('should allow access for user with specific instance permission', () => {
      const userPermissions: UserPermissions = {
        allowedInstances: ['production', 'staging'],
        role: PermissionLevel.READ,
        userId: 'test-user'
      };

      expect(() => validateInstanceAccess('production', availableInstances, userPermissions)).not.toThrow();
      expect(() => validateInstanceAccess('staging', availableInstances, userPermissions)).not.toThrow();
    });

    it('should deny access for user without instance permission', () => {
      const userPermissions: UserPermissions = {
        allowedInstances: ['production'],
        role: PermissionLevel.READ,
        userId: 'test-user'
      };

      expect(() => validateInstanceAccess('staging', availableInstances, userPermissions)).toThrow(
        InstanceAccessError
      );
    });

    it('should allow access for user with wildcard permission', () => {
      const userPermissions: UserPermissions = {
        allowedInstances: ['*'],
        role: PermissionLevel.ADMIN,
        userId: 'admin-user'
      };

      expect(() => validateInstanceAccess('production', availableInstances, userPermissions)).not.toThrow();
      expect(() => validateInstanceAccess('staging', availableInstances, userPermissions)).not.toThrow();
    });
  });

  describe('validateOperationPermission', () => {
    it('should allow access when no user permissions are provided (backward compatibility)', () => {
      expect(() => validateOperationPermission(OperationType.READ_WORKFLOW)).not.toThrow();
    });

    it('should allow read operations for READ role', () => {
      const userPermissions: UserPermissions = {
        allowedInstances: ['*'],
        role: PermissionLevel.READ,
        userId: 'read-user'
      };

      expect(() => validateOperationPermission(OperationType.READ_WORKFLOW, userPermissions)).not.toThrow();
      expect(() => validateOperationPermission(OperationType.READ_EXECUTION, userPermissions)).not.toThrow();
    });

    it('should deny write operations for READ role', () => {
      const userPermissions: UserPermissions = {
        allowedInstances: ['*'],
        role: PermissionLevel.READ,
        userId: 'read-user'
      };

      expect(() => validateOperationPermission(OperationType.CREATE_WORKFLOW, userPermissions)).toThrow(
        AuthorizationError
      );
      expect(() => validateOperationPermission(OperationType.DELETE_WORKFLOW, userPermissions)).toThrow(
        AuthorizationError
      );
    });

    it('should allow write operations for WRITE role', () => {
      const userPermissions: UserPermissions = {
        allowedInstances: ['*'],
        role: PermissionLevel.WRITE,
        userId: 'write-user'
      };

      expect(() => validateOperationPermission(OperationType.CREATE_WORKFLOW, userPermissions)).not.toThrow();
      expect(() => validateOperationPermission(OperationType.UPDATE_WORKFLOW, userPermissions)).not.toThrow();
      expect(() => validateOperationPermission(OperationType.EXECUTE_WORKFLOW, userPermissions)).not.toThrow();
    });

    it('should deny admin operations for WRITE role', () => {
      const userPermissions: UserPermissions = {
        allowedInstances: ['*'],
        role: PermissionLevel.WRITE,
        userId: 'write-user'
      };

      expect(() => validateOperationPermission(OperationType.DELETE_WORKFLOW, userPermissions)).toThrow(
        AuthorizationError
      );
      expect(() => validateOperationPermission(OperationType.DELETE_EXECUTION, userPermissions)).toThrow(
        AuthorizationError
      );
    });

    it('should allow all operations for ADMIN role', () => {
      const userPermissions: UserPermissions = {
        allowedInstances: ['*'],
        role: PermissionLevel.ADMIN,
        userId: 'admin-user'
      };

      expect(() => validateOperationPermission(OperationType.READ_WORKFLOW, userPermissions)).not.toThrow();
      expect(() => validateOperationPermission(OperationType.CREATE_WORKFLOW, userPermissions)).not.toThrow();
      expect(() => validateOperationPermission(OperationType.DELETE_WORKFLOW, userPermissions)).not.toThrow();
      expect(() => validateOperationPermission(OperationType.DELETE_EXECUTION, userPermissions)).not.toThrow();
    });
  });

  describe('validateAccess', () => {
    const availableInstances = ['production', 'staging'];

    it('should validate both instance access and operation permission', () => {
      const userPermissions: UserPermissions = {
        allowedInstances: ['production'],
        role: PermissionLevel.WRITE,
        userId: 'test-user'
      };

      // Should succeed - user has access to production and WRITE role for CREATE_WORKFLOW
      expect(() => validateAccess(
        OperationType.CREATE_WORKFLOW,
        'production',
        availableInstances,
        userPermissions
      )).not.toThrow();

      // Should fail - user doesn't have access to staging
      expect(() => validateAccess(
        OperationType.CREATE_WORKFLOW,
        'staging',
        availableInstances,
        userPermissions
      )).toThrow(InstanceAccessError);

      // Should fail - user doesn't have admin permissions for DELETE
      expect(() => validateAccess(
        OperationType.DELETE_WORKFLOW,
        'production',
        availableInstances,
        userPermissions
      )).toThrow(AuthorizationError);
    });
  });

  describe('checkRateLimit', () => {
    beforeEach(() => {
      // Clear rate limit store between tests
      clearRateLimitStore();
      jest.clearAllMocks();
    });

    it('should allow first request', () => {
      const result = checkRateLimit('user1', 5, 60000);
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(4);
    });

    it('should track multiple requests', () => {
      checkRateLimit('user1', 3, 60000);
      checkRateLimit('user1', 3, 60000);
      const result = checkRateLimit('user1', 3, 60000);
      
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(0);
    });

    it('should block requests after limit reached', () => {
      checkRateLimit('user1', 2, 60000);
      checkRateLimit('user1', 2, 60000);
      const result = checkRateLimit('user1', 2, 60000);
      
      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0);
    });

    it('should reset after time window', () => {
      // Mock time to test reset
      const originalNow = Date.now;
      let currentTime = 1000000;
      Date.now = jest.fn(() => currentTime);

      // Use up the limit
      checkRateLimit('user1', 2, 1000);
      checkRateLimit('user1', 2, 1000);
      let result = checkRateLimit('user1', 2, 1000);
      expect(result.allowed).toBe(false);

      // Move forward in time past the window
      currentTime += 2000;
      result = checkRateLimit('user1', 2, 1000);
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(1);

      // Restore original Date.now
      Date.now = originalNow;
    });

    it('should handle different users independently', () => {
      checkRateLimit('user1', 2, 60000);
      checkRateLimit('user1', 2, 60000);
      checkRateLimit('user2', 2, 60000);
      
      const user1Result = checkRateLimit('user1', 2, 60000);
      const user2Result = checkRateLimit('user2', 2, 60000);
      
      expect(user1Result.allowed).toBe(false);
      expect(user2Result.allowed).toBe(true);
    });
  });

  describe('sanitizeUserPermissions', () => {
    it('should redact sensitive user information', () => {
      const userPermissions: UserPermissions = {
        allowedInstances: ['production', 'staging'],
        role: PermissionLevel.ADMIN,
        userId: 'sensitive-user-id-123',
        sessionId: 'secret-session-456'
      };

      const sanitized = sanitizeUserPermissions(userPermissions);

      expect(sanitized.allowedInstances).toEqual(['production', 'staging']);
      expect(sanitized.role).toBe(PermissionLevel.ADMIN);
      expect(sanitized.userId).toBe('[REDACTED_USER_ID]');
      expect(sanitized.sessionId).toBe('[REDACTED_SESSION]');
    });

    it('should handle undefined optional fields', () => {
      const userPermissions: UserPermissions = {
        allowedInstances: ['production'],
        role: PermissionLevel.READ
      };

      const sanitized = sanitizeUserPermissions(userPermissions);

      expect(sanitized.userId).toBeUndefined();
      expect(sanitized.sessionId).toBeUndefined();
    });
  });

  describe('createDefaultAdminUser', () => {
    it('should create admin user in non-production environment', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';

      const adminUser = createDefaultAdminUser();

      expect(adminUser.role).toBe(PermissionLevel.ADMIN);
      expect(adminUser.allowedInstances).toEqual(['*']);
      expect(adminUser.userId).toBe('default-admin');
      expect(adminUser.sessionId).toBe('dev-session');

      process.env.NODE_ENV = originalEnv;
    });

    it('should accept custom allowed instances', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';

      const adminUser = createDefaultAdminUser(['staging', 'development']);

      expect(adminUser.allowedInstances).toEqual(['staging', 'development']);

      process.env.NODE_ENV = originalEnv;
    });

    it('should throw error in production environment', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      expect(() => createDefaultAdminUser()).toThrow(
        'Default admin user creation is not allowed in production'
      );

      process.env.NODE_ENV = originalEnv;
    });
  });

  describe('AuthorizationError', () => {
    it('should create error with proper message', () => {
      const error = new AuthorizationError(
        OperationType.DELETE_WORKFLOW,
        'production',
        PermissionLevel.READ,
        [PermissionLevel.ADMIN]
      );

      expect(error.name).toBe('AuthorizationError');
      expect(error.message).toContain('Access denied');
      expect(error.message).toContain('delete_workflow');
      expect(error.message).toContain('production');
      expect(error.message).toContain('read');
      expect(error.message).toContain('admin');
    });
  });

  describe('InstanceAccessError', () => {
    it('should create error with proper message', () => {
      const error = new InstanceAccessError('forbidden-instance', ['allowed1', 'allowed2']);

      expect(error.name).toBe('InstanceAccessError');
      expect(error.message).toContain('Access denied');
      expect(error.message).toContain('forbidden-instance');
      expect(error.message).toContain('allowed1, allowed2');
    });
  });
});