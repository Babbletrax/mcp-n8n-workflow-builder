import Joi from 'joi';
import { Config, MultiInstanceConfig, N8NInstance } from '../types/config';

// Configuration validation schemas
export const configValidationSchemas = {
  // N8N Instance validation
  n8nInstance: Joi.object({
    n8n_host: Joi.string()
      .uri({ scheme: ['http', 'https'] })
      .required()
      .messages({
        'string.uri': 'n8n_host must be a valid HTTP/HTTPS URL',
        'any.required': 'n8n_host is required'
      }),
    n8n_api_key: Joi.string()
      .min(10)
      .max(500)
      .pattern(/^[a-zA-Z0-9_\-]+$/)
      .required()
      .messages({
        'string.min': 'n8n_api_key must be at least 10 characters long',
        'string.max': 'n8n_api_key must not exceed 500 characters',
        'string.pattern.base': 'n8n_api_key can only contain alphanumeric characters, hyphens, and underscores',
        'any.required': 'n8n_api_key is required'
      })
  }),

  // Environment name validation
  environmentName: Joi.string()
    .min(1)
    .max(50)
    .pattern(/^[a-zA-Z0-9_\-]+$/)
    .required()
    .messages({
      'string.min': 'Environment name must be at least 1 character long',
      'string.max': 'Environment name must not exceed 50 characters',
      'string.pattern.base': 'Environment name can only contain alphanumeric characters, hyphens, and underscores'
    }),

  // Multi-instance configuration validation
  multiInstanceConfig: Joi.object({
    environments: Joi.object()
      .min(1)
      .max(10)
      .pattern(
        Joi.string().pattern(/^[a-zA-Z0-9_\-]+$/),
        Joi.object({
          n8n_host: Joi.string()
            .uri({ scheme: ['http', 'https'] })
            .required(),
          n8n_api_key: Joi.string()
            .min(10)
            .max(500)
            .pattern(/^[a-zA-Z0-9_\-]+$/)
            .required()
        })
      )
      .required()
      .messages({
        'object.min': 'At least one environment must be configured',
        'object.max': 'Maximum 10 environments allowed'
      }),
    defaultEnv: Joi.string()
      .pattern(/^[a-zA-Z0-9_\-]+$/)
      .required()
      .messages({
        'string.pattern.base': 'Default environment name can only contain alphanumeric characters, hyphens, and underscores'
      })
  }),

  // Single instance configuration validation (for backward compatibility)
  singleInstanceConfig: Joi.object({
    n8n_host: Joi.string()
      .uri({ scheme: ['http', 'https'] })
      .required(),
    n8n_api_key: Joi.string()
      .min(10)
      .max(500)
      .pattern(/^[a-zA-Z0-9_\-]+$/)
      .required()
  })
};

/**
 * Validate N8N instance configuration
 */
export function validateN8NInstance(instance: any): N8NInstance {
  const { error, value } = configValidationSchemas.n8nInstance.validate(instance, {
    abortEarly: false,
    stripUnknown: true
  });

  if (error) {
    const errorMessage = error.details.map(detail => detail.message).join('; ');
    throw new Error(`Invalid N8N instance configuration: ${errorMessage}`);
  }

  return value;
}

/**
 * Validate multi-instance configuration
 */
export function validateMultiInstanceConfig(config: any): MultiInstanceConfig {
  // First validate the structure
  const { error, value } = configValidationSchemas.multiInstanceConfig.validate(config, {
    abortEarly: false,
    stripUnknown: true
  });

  if (error) {
    const errorMessage = error.details.map(detail => detail.message).join('; ');
    throw new Error(`Invalid multi-instance configuration: ${errorMessage}`);
  }

  // Additional validation: check that default environment exists
  if (!value.environments[value.defaultEnv]) {
    throw new Error(`Default environment '${value.defaultEnv}' not found in environments`);
  }

  // Validate each environment configuration
  for (const [envName, envConfig] of Object.entries(value.environments)) {
    try {
      validateN8NInstance(envConfig);
    } catch (envError) {
      throw new Error(`Environment '${envName}': ${envError instanceof Error ? envError.message : String(envError)}`);
    }
  }

  return value;
}

/**
 * Validate single instance configuration
 */
export function validateSingleInstanceConfig(config: any): N8NInstance {
  const { error, value } = configValidationSchemas.singleInstanceConfig.validate(config, {
    abortEarly: false,
    stripUnknown: true
  });

  if (error) {
    const errorMessage = error.details.map(detail => detail.message).join('; ');
    throw new Error(`Invalid single instance configuration: ${errorMessage}`);
  }

  return value;
}

/**
 * Validate any configuration format (auto-detect)
 */
export function validateConfig(config: any): MultiInstanceConfig {
  try {
    // Try multi-instance format first
    if (config.environments && config.defaultEnv) {
      return validateMultiInstanceConfig(config);
    }
    
    // Try single instance format
    if (config.n8n_host && config.n8n_api_key) {
      const validatedSingle = validateSingleInstanceConfig(config);
      // Convert to multi-instance format
      return {
        environments: {
          'default': validatedSingle
        },
        defaultEnv: 'default'
      };
    }
    
    throw new Error('Configuration must contain either multi-instance format (environments + defaultEnv) or single instance format (n8n_host + n8n_api_key)');
  } catch (error) {
    throw new Error(`Configuration validation failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Validate environment variable configuration
 */
export function validateEnvironmentVariables(): { n8nHost: string; n8nApiKey: string } {
  const n8nHost = process.env.N8N_HOST;
  const n8nApiKey = process.env.N8N_API_KEY;

  if (!n8nHost || !n8nApiKey) {
    throw new Error('Missing required environment variables: N8N_HOST and N8N_API_KEY must be set');
  }

  // Validate format
  const { error, value } = configValidationSchemas.singleInstanceConfig.validate({
    n8n_host: n8nHost,
    n8n_api_key: n8nApiKey
  });

  if (error) {
    const errorMessage = error.details.map(detail => detail.message).join('; ');
    throw new Error(`Invalid environment variables: ${errorMessage}`);
  }

  return {
    n8nHost: value.n8n_host,
    n8nApiKey: value.n8n_api_key
  };
}

/**
 * Sanitize configuration for logging (remove sensitive data)
 */
export function sanitizeConfigForLogging(config: MultiInstanceConfig): any {
  const sanitized = {
    environments: {} as Record<string, any>,
    defaultEnv: config.defaultEnv
  };

  for (const [envName, envConfig] of Object.entries(config.environments)) {
    sanitized.environments[envName] = {
      n8n_host: envConfig.n8n_host,
      n8n_api_key: '[REDACTED]'
    };
  }

  return sanitized;
}