#!/usr/bin/env node
import dotenv from 'dotenv';
// Load environment variables from .env file
dotenv.config();

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import express, { Request, Response, Application } from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import cors from 'cors';
import * as http from 'http';
import { 
  CallToolRequestSchema, 
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
  ListResourceTemplatesRequestSchema,
  ListPromptsRequestSchema
} from './sdk-schemas';
import { N8NApiWrapper } from './services/n8nApiWrapper';
import { WorkflowBuilder } from './services/workflowBuilder';
import { 
  validateWorkflowSpec, 
  validateWorkflowInput, 
  validateInput, 
  validationSchemas,
  createRateLimitMessage 
} from './utils/validation';
import logger, { sanitizeForLogging } from './utils/logger';
import { WorkflowInput, LegacyWorkflowConnection } from './types/workflow';
import * as promptsService from './services/promptsService';
import { Prompt } from './types/prompts';

/**
 * Sanitizes error messages for safe client response
 */
function sanitizeErrorForClient(error: unknown, isProduction: boolean = process.env.NODE_ENV === 'production'): string {
  if (isProduction) {
    // In production, return generic error message
    return 'An internal server error occurred';
  }
  
  if (error instanceof Error) {
    // In development, return the error message but ensure it doesn't contain sensitive info
    const message = error.message;
    // Remove any potential API keys or sensitive data from error messages
    return message.replace(/[a-zA-Z0-9]{20,}/g, '[REDACTED]');
  }
  
  return 'Unknown error occurred';
}

// Definition of type for tool call result
interface ToolCallResult {
  content: Array<{
    type: string;
    text: string;
  }>;
  isError?: boolean;
  [key: string]: unknown;
}

// Schema logs removed

class N8NWorkflowServer {
  private server: InstanceType<typeof Server>;
  private isDebugMode: boolean;
  private n8nWrapper: N8NApiWrapper;

  constructor() {
    this.isDebugMode = process.env.DEBUG === 'true';
    this.n8nWrapper = new N8NApiWrapper();
    
    this.server = new Server(
      { name: 'n8n-workflow-builder', version: '0.3.0' },
      { capabilities: { tools: {}, resources: {}, prompts: {} } }
    );
    this.setupToolHandlers();
    this.setupResourceHandlers();
    this.setupPromptHandlers();
    this.server.onerror = (error: any) => this.log('error', `Server error: ${error.message || error}`);
  }

  private log(level: 'info' | 'error' | 'debug' | 'warn', message: string, ...args: any[]) {
    const timestamp = new Date().toISOString();
    
    // In debug mode, output more information
    if (this.isDebugMode || level !== 'debug') {
      console.error(`${timestamp} [n8n-workflow-builder] [${level}] ${message}`);
      if (args.length > 0) {
        console.error(...args);
      }
    }
  }

  private setupResourceHandlers() {
    // List available resources
    this.server.setRequestHandler(ListResourcesRequestSchema, async () => {
      this.log('info', 'Initializing resources list');
      return {
        resources: [
          {
            uri: '/workflows',
            name: 'Workflows List',
            description: 'List of all available workflows',
            mimeType: 'application/json'
          },
          {
            uri: '/execution-stats',
            name: 'Execution Statistics',
            description: 'Summary statistics of workflow executions',
            mimeType: 'application/json'
          }
        ]
      };
    });

    // List resource templates
    this.server.setRequestHandler(ListResourceTemplatesRequestSchema, async () => {
      this.log('info', 'Listing resource templates');
      return {
        templates: [
          {
            uriTemplate: '/workflows/{id}',
            name: 'Workflow Details',
            description: 'Details of a specific workflow',
            mimeType: 'application/json',
            parameters: [
              {
                name: 'id',
                description: 'The ID of the workflow',
                required: true
              }
            ]
          },
          {
            uriTemplate: '/executions/{id}',
            name: 'Execution Details',
            description: 'Details of a specific execution',
            mimeType: 'application/json',
            parameters: [
              {
                name: 'id',
                description: 'The ID of the execution',
                required: true
              }
            ]
          }
        ]
      };
    });

    // Read a specific resource
    this.server.setRequestHandler(ReadResourceRequestSchema, async (request: any) => {
      const { uri } = request.params;
      logger.info();
      
      // Static resources
      if (uri === '/workflows') {
        const workflows = await this.n8nWrapper.listWorkflows();
        return {
          contents: [{
            type: 'text',
            text: JSON.stringify(workflows, null, 2),
            mimeType: 'application/json',
            uri: '/workflows'
          }]
        };
      }
      
      if (uri === '/execution-stats') {
        try {
          const executions = await this.n8nWrapper.listExecutions({ limit: 100 });
          
          // Calculate statistics
          const total = executions.data.length;
          const succeeded = executions.data.filter(exec => exec.finished && exec.mode !== 'error').length;
          const failed = executions.data.filter(exec => exec.mode === 'error').length;
          const waiting = executions.data.filter(exec => !exec.finished).length;
          
          // Calculate average execution time for finished executions
          let totalTimeMs = 0;
          let finishedCount = 0;
          for (const exec of executions.data) {
            if (exec.finished && exec.startedAt && exec.stoppedAt) {
              const startTime = new Date(exec.startedAt).getTime();
              const endTime = new Date(exec.stoppedAt).getTime();
              totalTimeMs += (endTime - startTime);
              finishedCount++;
            }
          }
          
          const avgExecutionTimeMs = finishedCount > 0 ? totalTimeMs / finishedCount : 0;
          const avgExecutionTime = `${(avgExecutionTimeMs / 1000).toFixed(2)}s`;
          
          return {
            contents: [{
              type: 'text',
              text: JSON.stringify({
                total,
                succeeded,
                failed,
                waiting,
                avgExecutionTime
              }, null, 2),
              mimeType: 'application/json',
              uri: '/execution-stats'
            }]
          };
        } catch (error) {
          logger.error();
          return {
            contents: [{
              type: 'text',
              text: JSON.stringify({
                total: 0,
                succeeded: 0,
                failed: 0,
                waiting: 0,
                avgExecutionTime: '0s',
                error: 'Failed to retrieve execution statistics'
              }, null, 2),
              mimeType: 'application/json',
              uri: '/execution-stats'
            }]
          };
        }
      }
      
      
      // Dynamic resource template matching
      const workflowMatch = uri.match(/^\/workflows\/(.+)$/);
      if (workflowMatch) {
        const id = workflowMatch[1];
        try {
          const workflow = await this.n8nWrapper.getWorkflow(id);
          return {
            contents: [{
              type: 'text',
              text: JSON.stringify(workflow, null, 2),
              mimeType: 'application/json',
              uri: uri
            }]
          };
        } catch (error) {
          throw new McpError(ErrorCode.InvalidParams, `Workflow with ID ${id} not found`);
        }
      }
      
      const executionMatch = uri.match(/^\/executions\/(.+)$/);
      if (executionMatch) {
        const id = parseInt(executionMatch[1], 10);
        if (isNaN(id)) {
          throw new McpError(ErrorCode.InvalidParams, 'Execution ID must be a number');
        }
        
        try {
          const execution = await this.n8nWrapper.getExecution(id, true);
          return {
            contents: [{
              type: 'text',
              text: JSON.stringify(execution, null, 2),
              mimeType: 'application/json',
              uri: uri
            }]
          };
        } catch (error) {
          throw new McpError(ErrorCode.InvalidParams, `Execution with ID ${id} not found`);
        }
      }
      
      throw new McpError(ErrorCode.InvalidParams, `Resource not found: ${uri}`);
    });
  }

  private setupToolHandlers() {
    // Register available tools using the local schemas and return an array of tool definitions.
    this.server.setRequestHandler(ListToolsRequestSchema, async (req: any) => {
      logger.info();
      return {
        tools: [
          // Workflow Tools
          {
            name: 'list_workflows',
            enabled: true,
            description: 'List all workflows from n8n with essential metadata only (ID, name, status, dates, node count, tags). Optimized for performance to prevent large data transfers.',
            inputSchema: { 
              type: 'object', 
              properties: {
                random_string: {
                  type: 'string',
                  description: 'Dummy parameter for no-parameter tools'
                },
                instance: {
                  type: 'string',
                  description: 'Optional instance name to override automatic instance selection (e.g., \'highway\', \'onvex\')'
                }
              }
            }
          },
          {
            name: 'execute_workflow',
            enabled: true,
            description: 'Manually execute a workflow by ID',
            inputSchema: {
              type: 'object',
              properties: {
                id: { 
                  type: 'string',
                  description: 'The ID of the workflow to execute'
                },
                runData: { 
                  type: 'object',
                  description: 'Optional data to pass to the workflow'
                },
                instance: {
                  type: 'string',
                  description: 'Optional instance name to override automatic instance selection'
                }
              },
              required: ['id']
            }
          },
          {
            name: 'create_workflow',
            enabled: true,
            description: 'Create a new workflow in n8n',
            inputSchema: {
              type: 'object',
              properties: {
                name: { 
                  type: 'string',
                  description: 'The name of the workflow to create'
                },
                nodes: {
                  type: 'array',
                  description: 'Array of workflow nodes to create. Each node must have type and name.',
                  items: {
                    type: 'object',
                    properties: {
                      type: { 
                        type: 'string',
                        description: 'The node type (e.g. "n8n-nodes-base.code", "n8n-nodes-base.httpRequest")'
                      },
                      name: { 
                        type: 'string',
                        description: 'The display name of the node'
                      },
                      parameters: { 
                        type: 'object',
                        description: 'Node-specific configuration parameters'
                      }
                    },
                    required: ['type', 'name']
                  }
                },
                connections: {
                  type: 'array',
                  description: 'Array of connections between nodes. Each connection defines how data flows from source to target node. This field is critical for workflow functionality. Without connections, the workflow nodes will not interact with each other. Example: [{"source":"Node1","target":"Node2"}]',
                  items: {
                    type: 'object',
                    properties: {
                      source: { 
                        type: 'string',
                        description: 'The source node name or ID'
                      },
                      target: { 
                        type: 'string',
                        description: 'The target node name or ID'
                      },
                      sourceOutput: { 
                        type: 'number', 
                        default: 0,
                        description: 'Output index from the source node (default: 0)'
                      },
                      targetInput: { 
                        type: 'number', 
                        default: 0,
                        description: 'Input index of the target node (default: 0)'
                      }
                    },
                    required: ['source', 'target']
                  }
                },
                instance: {
                  type: 'string',
                  description: 'Optional instance name to override automatic instance selection'
                }
              },
              required: ['nodes', 'name', 'connections']
            }
          },
          {
            name: 'get_workflow',
            enabled: true,
            description: 'Get a workflow by ID',
            inputSchema: {
              type: 'object',
              properties: { 
                id: { 
                  type: 'string',
                  description: 'The ID of the workflow to retrieve'
                },
                instance: {
                  type: 'string',
                  description: 'Optional instance name to override automatic instance selection'
                }
              },
              required: ['id']
            }
          },
          {
            name: 'update_workflow',
            enabled: true,
            description: 'Update an existing workflow',
            inputSchema: {
              type: 'object',
              properties: {
                id: { 
                  type: 'string',
                  description: 'The ID of the workflow to update'
                },
                name: { 
                  type: 'string',
                  description: 'The new name for the workflow'
                },
                nodes: { 
                  type: 'array',
                  description: 'Array of workflow nodes. See create_workflow for detailed structure.'
                },
                connections: { 
                  type: 'array',
                  description: 'Array of node connections. See create_workflow for detailed structure.'
                },
                instance: {
                  type: 'string',
                  description: 'Optional instance name to override automatic instance selection'
                }
              },
              required: ['id', 'name', 'nodes']
            }
          },
          {
            name: 'delete_workflow',
            enabled: true,
            description: 'Delete a workflow by ID',
            inputSchema: {
              type: 'object',
              properties: { 
                id: { 
                  type: 'string',
                  description: 'The ID of the workflow to delete'
                },
                instance: {
                  type: 'string',
                  description: 'Optional instance name to override automatic instance selection'
                }
              },
              required: ['id']
            }
          },
          {
            name: 'activate_workflow',
            enabled: true,
            description: 'Activate a workflow by ID',
            inputSchema: {
              type: 'object',
              properties: { 
                id: { 
                  type: 'string',
                  description: 'The ID of the workflow to activate'
                },
                instance: {
                  type: 'string',
                  description: 'Optional instance name to override automatic instance selection'
                }
              },
              required: ['id']
            }
          },
          {
            name: 'deactivate_workflow',
            enabled: true,
            description: 'Deactivate a workflow by ID',
            inputSchema: {
              type: 'object',
              properties: { 
                id: { 
                  type: 'string',
                  description: 'The ID of the workflow to deactivate'
                },
                instance: {
                  type: 'string',
                  description: 'Optional instance name to override automatic instance selection'
                }
              },
              required: ['id']
            }
          },
          
          // Execution Tools
          {
            name: 'list_executions',
            enabled: true,
            description: 'List all executions from n8n with optional filters',
            inputSchema: {
              type: 'object',
              properties: {
                includeData: { 
                  type: 'boolean',
                  description: 'Whether to include execution data in the response'
                },
                status: { 
                  type: 'string',
                  enum: ['error', 'success', 'waiting'],
                  description: 'Filter executions by status (error, success, or waiting)'
                },
                workflowId: { 
                  type: 'string',
                  description: 'Filter executions by workflow ID'
                },
                projectId: { 
                  type: 'string',
                  description: 'Filter executions by project ID'
                },
                limit: { 
                  type: 'number',
                  description: 'Maximum number of executions to return'
                },
                cursor: { 
                  type: 'string',
                  description: 'Cursor for pagination'
                },
                instance: {
                  type: 'string',
                  description: 'Optional instance name to override automatic instance selection'
                }
              }
            }
          },
          {
            name: 'get_execution',
            enabled: true,
            description: 'Get details of a specific execution by ID',
            inputSchema: {
              type: 'object',
              properties: {
                id: { 
                  type: 'number',
                  description: 'The ID of the execution to retrieve'
                },
                includeData: { 
                  type: 'boolean',
                  description: 'Whether to include execution data in the response'
                },
                instance: {
                  type: 'string',
                  description: 'Optional instance name to override automatic instance selection'
                }
              },
              required: ['id']
            }
          },
          {
            name: 'delete_execution',
            enabled: true,
            description: 'Delete an execution by ID',
            inputSchema: {
              type: 'object',
              properties: {
                id: { 
                  type: 'number',
                  description: 'The ID of the execution to delete'
                },
                instance: {
                  type: 'string',
                  description: 'Optional instance name to override automatic instance selection'
                }
              },
              required: ['id']
            }
          },
          // Tag Tools
          {
            name: 'create_tag',
            enabled: true,
            description: 'Create a new tag',
            inputSchema: {
              type: 'object',
              properties: {
                name: {
                  type: 'string',
                  description: 'The name of the tag to create'
                },
                instance: {
                  type: 'string',
                  description: 'Optional instance name to override automatic instance selection'
                }
              },
              required: ['name']
            }
          },
          {
            name: 'get_tags',
            enabled: true,
            description: 'Get all tags',
            inputSchema: {
              type: 'object',
              properties: {
                cursor: {
                  type: 'string',
                  description: 'Cursor for pagination'
                },
                limit: {
                  type: 'number',
                  description: 'Maximum number of tags to return'
                },
                instance: {
                  type: 'string',
                  description: 'Optional instance name to override automatic instance selection'
                }
              }
            }
          },
          {
            name: 'get_tag',
            enabled: true,
            description: 'Get a tag by ID',
            inputSchema: {
              type: 'object',
              properties: {
                id: {
                  type: 'string',
                  description: 'The ID of the tag to retrieve'
                },
                instance: {
                  type: 'string',
                  description: 'Optional instance name to override automatic instance selection'
                }
              },
              required: ['id']
            }
          },
          {
            name: 'update_tag',
            enabled: true,
            description: 'Update a tag',
            inputSchema: {
              type: 'object',
              properties: {
                id: {
                  type: 'string',
                  description: 'The ID of the tag to update'
                },
                name: {
                  type: 'string',
                  description: 'The new name for the tag'
                },
                instance: {
                  type: 'string',
                  description: 'Optional instance name to override automatic instance selection'
                }
              },
              required: ['id', 'name']
            }
          },
          {
            name: 'delete_tag',
            enabled: true,
            description: 'Delete a tag',
            inputSchema: {
              type: 'object',
              properties: {
                id: {
                  type: 'string',
                  description: 'The ID of the tag to delete'
                },
                instance: {
                  type: 'string',
                  description: 'Optional instance name to override automatic instance selection'
                }
              },
              required: ['id']
            }
          }
        ]
      };
    });

    this.server.setRequestHandler(CallToolRequestSchema, async (request: any) => {
      this.log('info', `Message from client: ${JSON.stringify(request)}`);
      
      try {
        const { name, arguments: args } = request.params;
        
        this.log('info', `Tool call: ${name} with arguments: ${JSON.stringify(args)}`);
        
        const handleToolCall = async (toolName: string, args: any): Promise<ToolCallResult> => {
          switch (toolName) {
            case 'list_workflows':
              try {
                const workflows = await this.n8nWrapper.listWorkflows(args.instance);
                return {
                  content: [{ 
                    type: 'text', 
                    text: JSON.stringify(workflows, null, 2) 
                  }]
                };
              } catch (error: any) {
                this.log('error', `Failed to list workflows: ${error.message}`, error);
                throw new McpError(ErrorCode.InternalError, `Failed to list workflows: ${error.message}`);
              }

            case 'execute_workflow':
              // Validate workflow ID
              const validatedId = validateInput(args.id, validationSchemas.workflowId);
              
              // Validate instance if provided
              if (args.instance) {
                validateInput(args.instance, validationSchemas.instanceName);
              }
              
              const executionResult = await this.n8nWrapper.executeWorkflow(validatedId, args.runData, args.instance);
              return {
                content: [{ 
                  type: 'text', 
                  text: JSON.stringify(executionResult, null, 2) 
                }]
              };
            
            case 'create_workflow':
              try {
                // Validate and sanitize input using new validation system
                const parameters = args || {};
                
                // Validate instance parameter if provided
                if (parameters.instance) {
                  validateInput(parameters.instance, validationSchemas.instanceName);
                }
                
                this.log('info', 'Create workflow parameters received');
                
                // Use comprehensive validation
                const workflowInput = validateWorkflowInput(parameters);
                
                this.log('info', 'Workflow input validated successfully');
                
                const createdWorkflow = await this.n8nWrapper.createWorkflow(workflowInput, args.instance);
                
                this.log('info', 'Workflow created successfully');
                
                return {
                  content: [{ 
                    type: 'text', 
                    text: JSON.stringify(createdWorkflow, null, 2) 
                  }]
                };
              } catch (error: any) {
                this.log('error', 'Error creating workflow:', error);
                if (error instanceof McpError) {
                  throw error;
                }
                throw new McpError(ErrorCode.InternalError, `Failed to create workflow: ${error.message}`);
              }
            
            case 'get_workflow':
              // Validate workflow ID
              const getWorkflowId = validateInput(args.id, validationSchemas.workflowId);
              
              // Validate instance if provided
              if (args.instance) {
                validateInput(args.instance, validationSchemas.instanceName);
              }
              
              const workflow = await this.n8nWrapper.getWorkflow(getWorkflowId, args.instance);
              return {
                content: [{ 
                  type: 'text', 
                  text: JSON.stringify(workflow, null, 2) 
                }]
              };
            
            case 'update_workflow':
              if (!args.id) {
                throw new McpError(ErrorCode.InvalidParams, 'Workflow ID is required');
              }
              
              if (!args.nodes) {
                throw new McpError(ErrorCode.InvalidParams, 'Workflow nodes are required');
              }
              
              // Create input data for updating in the required format
              const updateInput: WorkflowInput = {
                name: args.name,
                nodes: args.nodes as any[],
                connections: []
              };
              
              // Transform connections to LegacyWorkflowConnection[] format
              if (args.connections) {
                // Check if the connections object has an object or array structure
                if (Array.isArray(args.connections)) {
                  updateInput.connections = args.connections.map((conn: any) => ({
                    source: conn.source,
                    target: conn.target,
                    sourceOutput: conn.sourceOutput,
                    targetInput: conn.targetInput
                  }));
                } else if (typeof args.connections === 'object') {
                  // n8n API object format, convert it to LegacyWorkflowConnection array
                  const legacyConnections: LegacyWorkflowConnection[] = [];
                  
                  Object.entries(args.connections).forEach(([sourceName, data]: [string, any]) => {
                    if (data.main && Array.isArray(data.main)) {
                      data.main.forEach((connectionGroup: any[], sourceIndex: number) => {
                        if (Array.isArray(connectionGroup)) {
                          connectionGroup.forEach(conn => {
                            legacyConnections.push({
                              source: sourceName,
                              target: conn.node,
                              sourceOutput: sourceIndex,
                              targetInput: conn.index || 0
                            });
                          });
                        }
                      });
                    }
                  });
                  
                  updateInput.connections = legacyConnections;
                } else {
                  throw new McpError(ErrorCode.InvalidParams, 'Connections must be either an array or an object');
                }
              }
              
              this.log('info', `Updating workflow with connections: ${JSON.stringify(updateInput.connections)}`);
              
              try {
                const updatedWorkflow = await this.n8nWrapper.updateWorkflow(args.id, updateInput, args.instance);
                return {
                  content: [{ 
                    type: 'text', 
                    text: JSON.stringify(updatedWorkflow, null, 2) 
                  }]
                };
              } catch (error: any) {
                this.log('error', `Failed to update workflow: ${error.message}`, error);
                throw new McpError(ErrorCode.InternalError, `Failed to update workflow: ${error.message}`);
              }
            
            case 'delete_workflow':
              if (!args.id) {
                throw new McpError(ErrorCode.InvalidParams, 'Workflow ID is required');
              }
              
              const deleteResult = await this.n8nWrapper.deleteWorkflow(args.id, args.instance);
              return {
                content: [{ 
                  type: 'text', 
                  text: JSON.stringify(deleteResult, null, 2) 
                }]
              };
            
            case 'activate_workflow':
              if (!args.id) {
                throw new McpError(ErrorCode.InvalidParams, 'Workflow ID is required');
              }
              
              const activatedWorkflow = await this.n8nWrapper.activateWorkflow(args.id, args.instance);
              return {
                content: [{ 
                  type: 'text', 
                  text: JSON.stringify(activatedWorkflow, null, 2) 
                }]
              };
            
            case 'deactivate_workflow':
              if (!args.id) {
                throw new McpError(ErrorCode.InvalidParams, 'Workflow ID is required');
              }
              
              const deactivatedWorkflow = await this.n8nWrapper.deactivateWorkflow(args.id, args.instance);
              return {
                content: [{ 
                  type: 'text', 
                  text: JSON.stringify(deactivatedWorkflow, null, 2) 
                }]
              };
            
            // Execution Tools
            case 'list_executions':
              const executions = await this.n8nWrapper.listExecutions({
                includeData: args.includeData,
                status: args.status,
                workflowId: args.workflowId,
                projectId: args.projectId,
                limit: args.limit,
                cursor: args.cursor
              }, args.instance);
              return {
                content: [{ 
                  type: 'text', 
                  text: JSON.stringify(executions, null, 2) 
                }]
              };
            
            case 'get_execution':
              // Validate execution ID
              const executionId = validateInput(args.id, validationSchemas.executionId);
              
              // Validate instance if provided
              if (args.instance) {
                validateInput(args.instance, validationSchemas.instanceName);
              }
              
              const execution = await this.n8nWrapper.getExecution(executionId, args.includeData, args.instance);
              return {
                content: [{ 
                  type: 'text', 
                  text: JSON.stringify(execution, null, 2) 
                }]
              };
            
            case 'delete_execution':
              if (!args.id) {
                throw new McpError(ErrorCode.InvalidParams, 'Execution ID is required');
              }
              
              const deletedExecution = await this.n8nWrapper.deleteExecution(args.id, args.instance);
              return {
                content: [{ 
                  type: 'text', 
                  text: JSON.stringify(deletedExecution, null, 2) 
                }]
              };
            
            // Tag Tools
            case 'create_tag':
              if (!args.name) {
                throw new McpError(ErrorCode.InvalidParams, 'Tag name is required');
              }
              
              const createdTag = await this.n8nWrapper.createTag({ name: args.name }, args.instance);
              return {
                content: [{ 
                  type: 'text', 
                  text: JSON.stringify(createdTag, null, 2) 
                }]
              };
            
            case 'get_tags':
              const tagsOptions: { cursor?: string; limit?: number } = {};
              
              if (args.cursor) {
                tagsOptions.cursor = args.cursor;
              }
              
              if (args.limit) {
                tagsOptions.limit = args.limit;
              }
              
              const tags = await this.n8nWrapper.getTags(tagsOptions, args.instance);
              return {
                content: [{ 
                  type: 'text', 
                  text: JSON.stringify(tags, null, 2) 
                }]
              };
            
            case 'get_tag':
              if (!args.id) {
                throw new McpError(ErrorCode.InvalidParams, 'Tag ID is required');
              }
              
              const tag = await this.n8nWrapper.getTag(args.id, args.instance);
              return {
                content: [{ 
                  type: 'text', 
                  text: JSON.stringify(tag, null, 2) 
                }]
              };
            
            case 'update_tag':
              if (!args.id || !args.name) {
                throw new McpError(ErrorCode.InvalidParams, 'Tag ID and name are required');
              }
              
              const updatedTag = await this.n8nWrapper.updateTag(args.id, { name: args.name }, args.instance);
              return {
                content: [{ 
                  type: 'text', 
                  text: JSON.stringify(updatedTag, null, 2) 
                }]
              };
            
            case 'delete_tag':
              if (!args.id) {
                throw new McpError(ErrorCode.InvalidParams, 'Tag ID is required');
              }
              
              const deletedTag = await this.n8nWrapper.deleteTag(args.id, args.instance);
              return {
                content: [{ 
                  type: 'text', 
                  text: JSON.stringify(deletedTag, null, 2) 
                }]
              };
            
            default:
              throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
          }
        };

        return await handleToolCall(name, args);
      } catch (error) {
        logger.error();
        
        if (error instanceof McpError) {
          throw error;
        }
        
        return {
          content: [{ 
            type: 'text', 
            text: `Error: ${sanitizeErrorForClient(error)}`
          }],
          isError: true
        };
      }
    });
  }

  private setupPromptHandlers() {
    // Handler for prompts/list method
    this.server.setRequestHandler(ListPromptsRequestSchema, async () => {
      this.log('info', 'Listing available prompts');
      
      // Get all available prompts
      const prompts = promptsService.getAllPrompts();
      
      // Transform them to the format expected by MCP
      const mcpPrompts = prompts.map((prompt: Prompt) => ({
        id: prompt.id,
        name: prompt.name,
        description: prompt.description,
        inputSchema: {
          type: 'object',
          properties: prompt.variables.reduce((schema: Record<string, any>, variable) => {
            schema[variable.name] = {
              type: 'string',
              description: variable.description,
              default: variable.defaultValue
            };
            return schema;
          }, {}),
          required: prompt.variables
            .filter(variable => variable.required)
            .map(variable => variable.name)
        }
      }));
      
      return {
        prompts: mcpPrompts
      };
    });

    // For prompts/fill we'll add a handler manually
    // Working around type issues by registering the handler directly in the internal object
    this.server["_requestHandlers"].set('prompts/fill', async (request: any) => {
      const { promptId, variables } = request.params;
      this.log('info', `Filling prompt "${promptId}" with variables`);

      try {
        // Get the prompt by ID and fill it with the provided variables
        const workflowData = promptsService.fillPromptTemplate(promptId, variables);
        
        // Return the result in the format expected by MCP
        return {
          content: [{
            type: 'text',
            text: JSON.stringify(workflowData, null, 2)
          }],
          metadata: {
            promptId,
            timestamp: new Date().toISOString()
          }
        };
      } catch (error) {
        this.log('error', `Error filling prompt: ${sanitizeErrorForClient(error, false)}`); // Always log full error for debugging
        throw new McpError(ErrorCode.InvalidParams, `Error filling prompt: ${sanitizeErrorForClient(error)}`);
      }
    });
  }

  // Starting MCP server
  async run() {
    // IMPORTANT: Do not add console output here, as it interferes with JSON-RPC operation via stdin/stdout
    try {
      // Check if we're running as an MCP subprocess (stdin is a TTY) or standalone
      const isStandaloneMode = process.env.MCP_STANDALONE === 'true' || process.stdin.isTTY;
      
      if (isStandaloneMode) {
        // Standalone mode - only run HTTP server
        const port = process.env.MCP_PORT ? parseInt(process.env.MCP_PORT, 10) : 3456;
        await this.startHttpServer(port);
        this.log('info', `MCP server running in standalone mode on port ${port}`);
        
        // Keep the process alive
        process.on('SIGINT', () => {
          this.log('info', 'Received SIGINT, shutting down gracefully');
          process.exit(0);
        });
      } else {
        // MCP subprocess mode - use stdin/stdout transport
        const transport = new StdioServerTransport();
        
        // Also start HTTP server for debugging
        const port = process.env.MCP_PORT ? parseInt(process.env.MCP_PORT, 10) : 3456;
        this.startHttpServer(port).catch(error => {
          // Don't fail if HTTP server can't start in MCP mode
          this.log('warn', `HTTP server failed to start: ${error.message}`);
        });
        
        // Connect to MCP transport
        await this.server.connect(transport);
      }
    } catch (error) {
      // Log error to file
      this.log('error', `Failed to start MCP server: ${error instanceof Error ? error.message : String(error)}`);
      process.exit(1);
    }
  }
  
  private async startHttpServer(port: number): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        const app = express();
        
        // Security headers
        app.use(helmet({
          contentSecurityPolicy: {
            directives: {
              defaultSrc: ["'self'"],
              scriptSrc: ["'self'"],
              styleSrc: ["'self'", "'unsafe-inline'"],
              imgSrc: ["'self'", "data:", "https:"],
            },
          },
          hsts: {
            maxAge: 31536000,
            includeSubDomains: true,
            preload: true
          }
        }));
        
        // Rate limiting
        const limiter = rateLimit({
          windowMs: 15 * 60 * 1000, // 15 minutes
          max: process.env.NODE_ENV === 'production' ? 100 : 1000, // Limit each IP to 100 requests per windowMs in production
          message: createRateLimitMessage(),
          standardHeaders: true,
          legacyHeaders: false,
          handler: (req, res) => {
            this.log('warn', `Rate limit exceeded for IP: ${req.ip}`);
            res.status(429).json({
              error: 'Too Many Requests',
              message: createRateLimitMessage(Math.ceil(limiter.windowMs / 1000)),
              retryAfter: Math.ceil(limiter.windowMs / 1000)
            });
          }
        });
        app.use(limiter);
        
        // Enhanced CORS configuration with security controls
        const allowedOrigins = process.env.NODE_ENV === 'production'
          ? [
              'https://claude.ai',
              'https://www.cursor.com',
              // Add additional production origins from environment variable
              ...(process.env.CORS_ALLOWED_ORIGINS?.split(',').map(origin => origin.trim()) || [])
            ]
          : [
              'http://localhost:3000',
              'http://localhost:3001',
              'http://127.0.0.1:3000',
              'http://127.0.0.1:3001',
              // Allow additional development origins but with explicit whitelist
              ...(process.env.CORS_DEV_ORIGINS?.split(',').map(origin => origin.trim()) || [])
            ];

        app.use(cors({
          origin: (origin, callback) => {
            // Allow requests with no origin (like mobile apps or curl requests) in development
            if (!origin && process.env.NODE_ENV !== 'production') {
              return callback(null, true);
            }
            
            if (!origin || allowedOrigins.includes(origin)) {
              callback(null, true);
            } else {
              logger.warn('CORS blocked request from unauthorized origin', { 
                origin, 
                allowedOrigins: sanitizeForLogging(allowedOrigins),
                userAgent: 'request-header-hidden-for-security'
              });
              callback(new Error('Not allowed by CORS policy'));
            }
          },
          credentials: false, // Keep disabled for security
          optionsSuccessStatus: 200,
          maxAge: 86400, // Cache preflight for 24 hours
          allowedHeaders: [
            'Content-Type',
            'Authorization',
            'X-Requested-With',
            'Accept',
            'Cache-Control'
          ],
          methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
          exposedHeaders: ['X-RateLimit-Remaining', 'X-RateLimit-Reset']
        }));
        
        // Body parsing with size limits
        app.use(express.json({ 
          limit: '10mb', // Reduced from 50mb for security
          strict: true
        }));
        
        // Endpoint for checking server operation
        app.get('/health', (req: Request, res: Response) => {
          res.json({ 
            status: 'ok', 
            message: 'MCP server is running',
            version: '0.3.0'
          });
        });
        
        // Handler for MCP requests
        app.post('/mcp', (req: Request, res: Response) => {
          try {
            if (process.env.NODE_ENV === 'development') {
              this.log('debug', 'Received MCP request');
            }
            
            // Processing MCP request
            this.handleJsonRpcMessage(req.body).then(result => {
              if (process.env.NODE_ENV === 'development') {
                this.log('debug', 'Sending MCP response');
              }
              res.json(result);
            }).catch((error: Error) => {
              this.log('error', 'Error handling MCP request', error);
              res.status(500).json({
                jsonrpc: '2.0',
                error: {
                  code: -32603,
                  message: 'Internal server error',
                  data: sanitizeErrorForClient(error)
                },
                id: req.body?.id || null
              });
            });
          } catch (error) {
            this.log('error', 'Error processing MCP request', error);
            res.status(500).json({
              jsonrpc: '2.0',
              error: {
                code: -32603,
                message: 'Internal server error',
                data: sanitizeErrorForClient(error)
              },
              id: req.body?.id || null
            });
          }
        });
        
        // Starting HTTP server
        const httpServer = http.createServer(app);

        httpServer.on('error', (error: NodeJS.ErrnoException) => {
          if (error.code === 'EADDRINUSE') {
            this.log('info', `Port ${port} is already in use. Assuming another instance is already running.`);
            // Resolve promise for graceful handling
            resolve();
          } else {
            this.log('error', `HTTP server error: ${error.message}`);
            reject(error);
          }
        });

        httpServer.listen(port, () => {
          this.log('info', `MCP HTTP server listening on port ${port}`);
          resolve();
        });
      } catch (error) {
        this.log('error', `Failed to start HTTP server: ${error instanceof Error ? error.message : String(error)}`);
        reject(error);
      }
    });
  }
  
  private async handleJsonRpcMessage(request: any): Promise<any> {
    const { method, params, id } = request;
    
    // Find the corresponding handler for the method
    const handler = this.server['_requestHandlers'].get(method);
    
    if (!handler) {
      throw new McpError(ErrorCode.MethodNotFound, `Method '${method}' not found`);
    }
    
    try {
      // Call the corresponding handler with parameters
      const result = await handler(request);
      
      // Return result in JSON-RPC format
      return {
        jsonrpc: '2.0',
        result,
        id
      };
    } catch (error) {
      this.log('error', `Handler error: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }
}

// Starting server with error handling
const server = new N8NWorkflowServer();
server.run().catch((error) => {
  console.error(`Fatal error starting server: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});