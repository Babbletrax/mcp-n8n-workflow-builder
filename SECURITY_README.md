# Security Implementation Guide

## Overview

This document provides guidance on using the enhanced security features implemented in n8n-workflow-mcp v0.9.0.

## 🔒 Security Features

### 1. Credential Sanitization
All logs automatically redact sensitive information including API keys, tokens, and passwords.

**Automatically Protected Fields:**
- `api_key`, `password`, `token`, `secret`, `credential`
- `auth`, `bearer`, `x-api-key`, `authorization`
- Long strings without spaces (potential secrets)

### 2. Role-Based Access Control (RBAC)

#### Permission Levels
- **READ**: Can view workflows and executions
- **WRITE**: Can create, update, execute workflows
- **ADMIN**: Full access including deletions

#### Usage Example
```typescript
import { UserPermissions, PermissionLevel } from './src/utils/security';

const userPermissions: UserPermissions = {
  allowedInstances: ['production', 'staging'],
  role: PermissionLevel.WRITE,
  userId: 'user-123',
  sessionId: 'session-abc'
};

// Pass to API methods
await n8nWrapper.createWorkflow(workflowData, 'production', userPermissions);
```

### 3. Configuration Encryption

#### Encrypting Configuration Files
```bash
# Build the project first
npm run build

# Encrypt your config file
CONFIG_ENCRYPTION_PASSWORD=your-secure-password npm run encrypt-config .config.json

# Or specify password as argument (less secure)
npm run encrypt-config .config.json your-password
```

#### Environment Setup
```bash
# Set encryption password (required for production)
export CONFIG_ENCRYPTION_PASSWORD=your-secure-password

# Start the server
npm start
```

### 4. Enhanced CORS Security

#### Production Configuration
```bash
# Set allowed origins for production
export CORS_ALLOWED_ORIGINS=https://your-app.com,https://another-app.com

# Development origins (optional)
export CORS_DEV_ORIGINS=http://localhost:3000,http://localhost:8080
```

### 5. Rate Limiting

Default limits:
- **Production**: 100 requests per 15 minutes per user
- **Development**: 1000 requests per 15 minutes per user

## 🚀 Quick Setup

### Development Environment
```bash
# 1. Copy example config
cp .config.json.example .config.json

# 2. Edit with your n8n instances
nano .config.json

# 3. Start development server
npm run dev
```

### Production Deployment
```bash
# 1. Encrypt configuration
CONFIG_ENCRYPTION_PASSWORD=your-secure-password npm run encrypt-config .config.json

# 2. Set environment variables
export NODE_ENV=production
export CONFIG_ENCRYPTION_PASSWORD=your-secure-password
export CORS_ALLOWED_ORIGINS=https://your-domain.com

# 3. Start production server
npm start
```

## 🔧 Configuration Examples

### Multi-Instance Configuration
```json
{
  "environments": {
    "production": {
      "n8n_host": "https://n8n-prod.company.com/api/v1/",
      "n8n_api_key": "prod-api-key-here"
    },
    "staging": {
      "n8n_host": "https://n8n-staging.company.com/api/v1/",
      "n8n_api_key": "staging-api-key-here"
    }
  },
  "defaultEnv": "staging"
}
```

### User Permissions Setup
```typescript
// Read-only user for monitoring
const monitorUser: UserPermissions = {
  allowedInstances: ['production'],
  role: PermissionLevel.READ,
  userId: 'monitor-service'
};

// Developer with staging access
const developer: UserPermissions = {
  allowedInstances: ['staging', 'development'],
  role: PermissionLevel.WRITE,
  userId: 'dev-123'
};

// Admin with full access
const admin: UserPermissions = {
  allowedInstances: ['*'], // Wildcard for all instances
  role: PermissionLevel.ADMIN,
  userId: 'admin-456'
};
```

## 🧪 Testing Security

### Run Security Tests
```bash
# Install test dependencies (if not already installed)
npm install --save-dev jest @types/jest

# Run security-specific tests
npm test -- --testPathPattern=security
npm test -- --testPathPattern=logger
```

### Manual Security Testing

#### Test Credential Sanitization
```typescript
import { sanitizeForLogging } from './src/utils/logger';

const sensitiveData = {
  api_key: 'secret-key-123',
  user: 'john',
  config: {
    password: 'mypassword'
  }
};

console.log(sanitizeForLogging(sensitiveData));
// Output: { api_key: '[REDACTED]', user: 'john', config: { password: '[REDACTED]' } }
```

#### Test Access Control
```typescript
import { validateAccess, OperationType, PermissionLevel } from './src/utils/security';

const user: UserPermissions = {
  allowedInstances: ['staging'],
  role: PermissionLevel.READ
};

try {
  validateAccess(OperationType.DELETE_WORKFLOW, 'production', ['production', 'staging'], user);
} catch (error) {
  console.log('Access denied:', error.message);
  // Should deny because user doesn't have admin role and production access
}
```

## 🔍 Monitoring & Auditing

### Security Logs
The system logs security events including:
- Access denied attempts
- Rate limit violations
- CORS policy violations
- Configuration decryption attempts

### Log Examples
```
2025-01-13T12:00:00.000Z [n8n-workflow-builder] [warn] Access denied {"operation":"DELETE_WORKFLOW","instance":"production","error":"Access denied: Instance 'production' not allowed. User has access to: staging","userPermissions":{"role":"read","allowedInstances":["staging"],"userId":"[REDACTED_USER_ID]"}}

2025-01-13T12:01:00.000Z [n8n-workflow-builder] [warn] CORS blocked request from unauthorized origin {"origin":"https://malicious-site.com","allowedOrigins":["https://claude.ai","https://www.cursor.com"]}
```

## ⚠️ Security Considerations

### Encryption Password Security
- **Never commit** the encryption password to version control
- Use environment variables in production
- Consider using a key management service (AWS KMS, Azure Key Vault)
- Rotate encryption passwords periodically

### Instance Access Control
- Regularly review user permissions
- Use principle of least privilege
- Monitor for suspicious access patterns
- Implement session timeouts

### Network Security
- Use HTTPS in production
- Implement proper firewall rules
- Consider IP whitelisting for admin operations
- Monitor for unusual traffic patterns

## 🆘 Troubleshooting

### Common Issues

#### "Configuration decryption failed"
- Check `CONFIG_ENCRYPTION_PASSWORD` environment variable
- Verify the config file isn't corrupted
- Ensure password matches the one used for encryption

#### "Access denied" errors
- Verify user permissions are correctly set
- Check if user has access to the specified instance
- Confirm operation is allowed for user's role

#### CORS errors in browser
- Check `CORS_ALLOWED_ORIGINS` environment variable
- Verify the origin is included in allowed origins
- Ensure the domain matches exactly (no trailing slashes)

### Debug Mode
```bash
# Enable debug logging
DEBUG=true npm start

# Check logs for detailed information
tail -f logs/security.log  # If file logging is enabled
```

## 📚 Additional Resources

- [Security Changelog](./SECURITY_CHANGELOG.md) - Detailed security improvements
- [API Documentation](./docs/) - Complete API reference
- [Configuration Guide](./README.md) - General configuration help

## 🔐 Security Reporting

If you discover a security vulnerability, please report it privately to the maintainers rather than opening a public issue.