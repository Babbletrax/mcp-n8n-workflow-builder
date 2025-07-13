/**
 * Security utilities for access control and authorization
 */

/**
 * User permission levels for different operations
 */
export enum PermissionLevel {
  READ = 'read',
  WRITE = 'write',
  ADMIN = 'admin'
}

/**
 * User permissions interface
 */
export interface UserPermissions {
  allowedInstances: string[];
  role: PermissionLevel;
  userId?: string;
  sessionId?: string;
}

/**
 * Operation types that require permission checks
 */
export enum OperationType {
  READ_WORKFLOW = 'read_workflow',
  CREATE_WORKFLOW = 'create_workflow',
  UPDATE_WORKFLOW = 'update_workflow',
  DELETE_WORKFLOW = 'delete_workflow',
  EXECUTE_WORKFLOW = 'execute_workflow',
  ACTIVATE_WORKFLOW = 'activate_workflow',
  DEACTIVATE_WORKFLOW = 'deactivate_workflow',
  READ_EXECUTION = 'read_execution',
  DELETE_EXECUTION = 'delete_execution',
  MANAGE_TAGS = 'manage_tags'
}

/**
 * Permission requirements for different operations
 */
const OPERATION_PERMISSIONS: Record<OperationType, PermissionLevel[]> = {
  [OperationType.READ_WORKFLOW]: [PermissionLevel.READ, PermissionLevel.WRITE, PermissionLevel.ADMIN],
  [OperationType.CREATE_WORKFLOW]: [PermissionLevel.WRITE, PermissionLevel.ADMIN],
  [OperationType.UPDATE_WORKFLOW]: [PermissionLevel.WRITE, PermissionLevel.ADMIN],
  [OperationType.DELETE_WORKFLOW]: [PermissionLevel.ADMIN],
  [OperationType.EXECUTE_WORKFLOW]: [PermissionLevel.WRITE, PermissionLevel.ADMIN],
  [OperationType.ACTIVATE_WORKFLOW]: [PermissionLevel.WRITE, PermissionLevel.ADMIN],
  [OperationType.DEACTIVATE_WORKFLOW]: [PermissionLevel.WRITE, PermissionLevel.ADMIN],
  [OperationType.READ_EXECUTION]: [PermissionLevel.READ, PermissionLevel.WRITE, PermissionLevel.ADMIN],
  [OperationType.DELETE_EXECUTION]: [PermissionLevel.ADMIN],
  [OperationType.MANAGE_TAGS]: [PermissionLevel.WRITE, PermissionLevel.ADMIN]
};

/**
 * Custom error for authorization failures
 */
export class AuthorizationError extends Error {
  constructor(
    public readonly operation: OperationType,
    public readonly instance: string,
    public readonly userRole: PermissionLevel,
    public readonly requiredRole: PermissionLevel[]
  ) {
    super(
      `Access denied: Operation '${operation}' on instance '${instance}' requires permissions: ${requiredRole.join(' or ')}, but user has: ${userRole}`
    );
    this.name = 'AuthorizationError';
  }
}

/**
 * Custom error for instance access violations
 */
export class InstanceAccessError extends Error {
  constructor(
    public readonly requestedInstance: string,
    public readonly allowedInstances: string[]
  ) {
    super(
      `Access denied: Instance '${requestedInstance}' not allowed. User has access to: ${allowedInstances.join(', ')}`
    );
    this.name = 'InstanceAccessError';
  }
}

/**
 * Validates if a user has permission to perform an operation on a specific instance
 */
export function validateInstanceAccess(
  instance: string | undefined,
  availableInstances: string[],
  userPermissions?: UserPermissions
): void {
  // If no specific instance requested, use default (allowed)
  if (!instance) {
    return;
  }

  // Check if instance exists
  if (!availableInstances.includes(instance)) {
    throw new Error(`Instance '${instance}' not found. Available instances: ${availableInstances.join(', ')}`);
  }

  // If no user permissions provided, allow access (backward compatibility)
  // In production, this should be removed and permissions should always be required
  if (!userPermissions) {
    return;
  }

  // Check if user has access to the requested instance
  if (!userPermissions.allowedInstances.includes(instance) && !userPermissions.allowedInstances.includes('*')) {
    throw new InstanceAccessError(instance, userPermissions.allowedInstances);
  }
}

/**
 * Validates if a user has permission to perform a specific operation
 */
export function validateOperationPermission(
  operation: OperationType,
  userPermissions?: UserPermissions
): void {
  // If no user permissions provided, allow access (backward compatibility)
  // In production, this should be removed and permissions should always be required
  if (!userPermissions) {
    return;
  }

  const requiredPermissions = OPERATION_PERMISSIONS[operation];
  if (!requiredPermissions.includes(userPermissions.role)) {
    throw new AuthorizationError(operation, 'unknown', userPermissions.role, requiredPermissions);
  }
}

/**
 * Combined validation for both instance access and operation permission
 */
export function validateAccess(
  operation: OperationType,
  instance: string | undefined,
  availableInstances: string[],
  userPermissions?: UserPermissions
): void {
  validateInstanceAccess(instance, availableInstances, userPermissions);
  validateOperationPermission(operation, userPermissions);
}

/**
 * Creates a default admin user for development/testing
 * WARNING: This should not be used in production
 */
export function createDefaultAdminUser(allowedInstances: string[] = ['*']): UserPermissions {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Default admin user creation is not allowed in production');
  }
  
  return {
    allowedInstances,
    role: PermissionLevel.ADMIN,
    userId: 'default-admin',
    sessionId: 'dev-session'
  };
}

/**
 * Sanitizes user permissions for logging
 */
export function sanitizeUserPermissions(permissions: UserPermissions): any {
  return {
    role: permissions.role,
    allowedInstances: permissions.allowedInstances,
    userId: permissions.userId ? '[REDACTED_USER_ID]' : undefined,
    sessionId: permissions.sessionId ? '[REDACTED_SESSION]' : undefined
  };
}

/**
 * Rate limiting per user/session
 */
interface RateLimitEntry {
  count: number;
  resetTime: number;
}

const rateLimitStore = new Map<string, RateLimitEntry>();

/**
 * Clears the rate limit store (for testing purposes)
 */
export function clearRateLimitStore(): void {
  rateLimitStore.clear();
}

/**
 * Checks if a user/session has exceeded rate limits
 */
export function checkRateLimit(
  identifier: string,
  maxRequests = 100,
  windowMs = 15 * 60 * 1000 // 15 minutes
): { allowed: boolean; remaining: number; resetTime: number } {
  const now = Date.now();
  const entry = rateLimitStore.get(identifier);

  if (!entry || now > entry.resetTime) {
    // Create new entry or reset expired entry
    const newEntry = {
      count: 1,
      resetTime: now + windowMs
    };
    rateLimitStore.set(identifier, newEntry);
    
    return {
      allowed: true,
      remaining: maxRequests - 1,
      resetTime: newEntry.resetTime
    };
  }

  if (entry.count >= maxRequests) {
    return {
      allowed: false,
      remaining: 0,
      resetTime: entry.resetTime
    };
  }

  entry.count++;
  rateLimitStore.set(identifier, entry);

  return {
    allowed: true,
    remaining: maxRequests - entry.count,
    resetTime: entry.resetTime
  };
}

/**
 * Cleans up expired rate limit entries
 */
export function cleanupRateLimitStore(): void {
  const now = Date.now();
  for (const [key, entry] of rateLimitStore.entries()) {
    if (now > entry.resetTime) {
      rateLimitStore.delete(key);
    }
  }
}

// Clean up rate limit store every 30 minutes
setInterval(cleanupRateLimitStore, 30 * 60 * 1000);