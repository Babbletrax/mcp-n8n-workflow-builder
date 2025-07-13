import Joi from 'joi';
import { WorkflowSpec, WorkflowInput, LegacyWorkflowConnection } from '../types/workflow';
import logger from './logger';

// Security validation schemas
export const validationSchemas = {
  // Workflow creation validation
  createWorkflow: Joi.object({
    name: Joi.string()
      .min(1)
      .max(255)
      .pattern(/^[a-zA-Z0-9\s\-_]+$/)
      .required()
      .messages({
        'string.pattern.base': 'Workflow name can only contain alphanumeric characters, spaces, hyphens, and underscores'
      }),
    
    nodes: Joi.array()
      .min(1)
      .max(100)
      .items(
        Joi.object({
          type: Joi.string()
            .pattern(/^[a-zA-Z0-9\-\.]+$/)
            .required()
            .messages({
              'string.pattern.base': 'Node type must be a valid n8n node type identifier'
            }),
          name: Joi.string()
            .min(1)
            .max(100)
            .pattern(/^[a-zA-Z0-9\s\-_]+$/)
            .required()
            .messages({
              'string.pattern.base': 'Node name can only contain alphanumeric characters, spaces, hyphens, and underscores'
            }),
          parameters: Joi.object().default({}),
          id: Joi.string().optional(),
          position: Joi.array().items(Joi.number()).length(2).optional()
        })
      )
      .required(),
    
    connections: Joi.array()
      .min(0)
      .max(1000)
      .items(
        Joi.object({
          source: Joi.string()
            .min(1)
            .max(100)
            .pattern(/^[a-zA-Z0-9\s\-_]+$/)
            .required(),
          target: Joi.string()
            .min(1)
            .max(100)
            .pattern(/^[a-zA-Z0-9\s\-_]+$/)
            .required(),
          sourceOutput: Joi.number().integer().min(0).max(10).default(0),
          targetInput: Joi.number().integer().min(0).max(10).default(0)
        })
      )
      .required(),
    
    instance: Joi.string()
      .pattern(/^[a-zA-Z0-9\-_]+$/)
      .optional()
      .messages({
        'string.pattern.base': 'Instance name can only contain alphanumeric characters, hyphens, and underscores'
      })
  }),

  // Workflow ID validation
  workflowId: Joi.string()
    .pattern(/^[a-zA-Z0-9\-]+$/)
    .required()
    .messages({
      'string.pattern.base': 'Workflow ID must be a valid identifier'
    }),

  // Execution ID validation
  executionId: Joi.number()
    .integer()
    .positive()
    .required(),

  // Tag validation
  tagData: Joi.object({
    name: Joi.string()
      .min(1)
      .max(50)
      .pattern(/^[a-zA-Z0-9\s\-_]+$/)
      .required()
      .messages({
        'string.pattern.base': 'Tag name can only contain alphanumeric characters, spaces, hyphens, and underscores'
      })
  }),

  // Instance name validation
  instanceName: Joi.string()
    .pattern(/^[a-zA-Z0-9\-_]+$/)
    .optional()
    .messages({
      'string.pattern.base': 'Instance name can only contain alphanumeric characters, hyphens, and underscores'
    }),

  // Pagination validation
  pagination: Joi.object({
    limit: Joi.number().integer().min(1).max(1000).optional(),
    cursor: Joi.string().max(1000).optional(),
    includeData: Joi.boolean().optional(),
    status: Joi.string().valid('error', 'success', 'waiting').optional(),
    workflowId: Joi.string().pattern(/^[a-zA-Z0-9\-]+$/).optional(),
    projectId: Joi.string().pattern(/^[a-zA-Z0-9\-]+$/).optional()
  })
};

/**
 * Validate input data against a schema
 */
export function validateInput<T>(data: any, schema: Joi.Schema): T {
  const { error, value } = schema.validate(data, {
    abortEarly: false,
    stripUnknown: true,
    convert: true
  });

  if (error) {
    const errorMessage = error.details.map(detail => detail.message).join('; ');
    logger.warn(`Input validation failed: ${errorMessage}`);
    throw new Error(`Invalid input: ${errorMessage}`);
  }

  return value;
}

/**
 * Sanitize string input to prevent injection attacks
 */
export function sanitizeString(input: string): string {
  if (typeof input !== 'string') {
    throw new Error('Input must be a string');
  }
  
  // Remove potentially dangerous characters
  return input
    .replace(/[<>'"&]/g, '') // Remove HTML/XML special characters
    .replace(/[`${}]/g, '') // Remove template literal and object notation characters
    .replace(/[\x00-\x1F\x7F]/g, '') // Remove control characters
    .trim();
}

/**
 * Validate and sanitize workflow input
 */
export function validateWorkflowInput(input: any): WorkflowInput {
  // First validate structure
  const validated = validateInput<WorkflowInput>(input, validationSchemas.createWorkflow);
  
  // Additional security checks
  if (validated.nodes) {
    validated.nodes.forEach((node, index) => {
      // Sanitize node names
      node.name = sanitizeString(node.name);
      
      // Validate node type against known patterns
      if (!node.type.startsWith('n8n-nodes-') && !node.type.includes('.')) {
        throw new Error(`Invalid node type at index ${index}: ${node.type}`);
      }
      
      // Deep sanitize parameters if they contain strings
      if (node.parameters && typeof node.parameters === 'object') {
        node.parameters = sanitizeObjectStrings(node.parameters);
      }
    });
  }
  
  return validated;
}

/**
 * Recursively sanitize string values in an object
 */
function sanitizeObjectStrings(obj: any): any {
  if (typeof obj === 'string') {
    return sanitizeString(obj);
  }
  
  if (Array.isArray(obj)) {
    return obj.map(item => sanitizeObjectStrings(item));
  }
  
  if (obj && typeof obj === 'object') {
    const sanitized: any = {};
    for (const [key, value] of Object.entries(obj)) {
      // Sanitize the key as well
      const sanitizedKey = sanitizeString(key);
      sanitized[sanitizedKey] = sanitizeObjectStrings(value);
    }
    return sanitized;
  }
  
  return obj;
}

/**
 * Legacy function for backward compatibility
 */
export function validateWorkflowSpec(spec: any): WorkflowSpec {
  // Convert legacy input to new format if needed
  if (spec.connections && Array.isArray(spec.connections)) {
    spec.connections = transformConnectionsToArray(spec.connections);
  }
  
  // Basic validation for now - this function was already in use
  if (!spec.name || !spec.nodes) {
    throw new Error('Workflow must have a name and nodes');
  }
  
  return spec as WorkflowSpec;
}

/**
 * Transform legacy connections array to n8n format
 */
export function transformConnectionsToArray(connections: LegacyWorkflowConnection[]): any {
  const connectionMap: any = {};
  
  connections.forEach(conn => {
    if (!connectionMap[conn.source]) {
      connectionMap[conn.source] = { main: [] };
    }
    
    const sourceOutput = conn.sourceOutput || 0;
    
    // Ensure the output array exists
    while (connectionMap[conn.source].main.length <= sourceOutput) {
      connectionMap[conn.source].main.push([]);
    }
    
    // Add the connection
    connectionMap[conn.source].main[sourceOutput].push({
      node: conn.target,
      type: 'main',
      index: conn.targetInput || 0
    });
  });
  
  return connectionMap;
}

/**
 * Rate limiting helper
 */
export function createRateLimitMessage(retryAfter?: number): string {
  const baseMessage = 'Too many requests. Please try again later.';
  if (retryAfter) {
    return `${baseMessage} Retry after ${retryAfter} seconds.`;
  }
  return baseMessage;
}