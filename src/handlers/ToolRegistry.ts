/**
 * Central registry for all MCP tool handlers
 */

import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { BaseHandler, ToolHandler, ToolCallResult, HandlerContext } from './BaseHandler';
import { WorkflowToolHandler } from './WorkflowToolHandler';
import { ExecutionToolHandler } from './ExecutionToolHandler';
import { TagToolHandler } from './TagToolHandler';
import { N8NApiWrapper } from '../services/n8nApiWrapper';

export class ToolRegistry extends BaseHandler {
  private handlers: Map<string, ToolHandler> = new Map();
  private toolToHandlerMap: Map<string, string> = new Map();

  constructor(n8nWrapper: N8NApiWrapper, isDebugMode: boolean = false) {
    super(isDebugMode);
    this.registerHandlers(n8nWrapper);
  }

  private registerHandlers(n8nWrapper: N8NApiWrapper): void {
    const workflowHandler = new WorkflowToolHandler(n8nWrapper, this.isDebugMode);
    const executionHandler = new ExecutionToolHandler(n8nWrapper, this.isDebugMode);
    const tagHandler = new TagToolHandler(n8nWrapper, this.isDebugMode);

    // Register handlers
    this.handlers.set('workflow', workflowHandler);
    this.handlers.set('execution', executionHandler);
    this.handlers.set('tag', tagHandler);

    // Map tools to handlers
    workflowHandler.getSupportedTools().forEach(tool => {
      this.toolToHandlerMap.set(tool, 'workflow');
    });

    executionHandler.getSupportedTools().forEach(tool => {
      this.toolToHandlerMap.set(tool, 'execution');
    });

    tagHandler.getSupportedTools().forEach(tool => {
      this.toolToHandlerMap.set(tool, 'tag');
    });

    this.log('info', 'Registered tool handlers', {
      handlers: Array.from(this.handlers.keys()),
      tools: Array.from(this.toolToHandlerMap.keys())
    });
  }

  /**
   * Gets all available tools from all handlers
   */
  getAllTools(): Array<{ name: string; handler: string; description?: string }> {
    const allTools: Array<{ name: string; handler: string; description?: string }> = [];

    for (const [handlerName, handler] of this.handlers) {
      handler.getSupportedTools().forEach(toolName => {
        allTools.push({
          name: toolName,
          handler: handlerName,
          description: this.getToolDescription(toolName)
        });
      });
    }

    return allTools;
  }

  /**
   * Gets tool definitions for MCP server registration
   */
  getToolDefinitions(): any[] {
    return [
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
    ];
  }

  /**
   * Handles a tool call by routing to the appropriate handler
   */
  async handleToolCall(toolName: string, args: any, context: HandlerContext): Promise<ToolCallResult> {
    const handlerName = this.toolToHandlerMap.get(toolName);

    if (!handlerName) {
      throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${toolName}`);
    }

    const handler = this.handlers.get(handlerName);
    if (!handler) {
      throw new McpError(ErrorCode.InternalError, `Handler not found for tool: ${toolName}`);
    }

    this.log('info', `Routing tool call`, { toolName, handlerName, context: this.sanitizeParams(context) });

    try {
      return await handler.handleTool(toolName, args, context);
    } catch (error) {
      this.log('error', `Tool call failed`, { toolName, handlerName, error });
      throw error;
    }
  }

  /**
   * Gets description for a specific tool
   */
  private getToolDescription(toolName: string): string {
    const descriptions: Record<string, string> = {
      // Workflow tools
      'list_workflows': 'List all workflows with metadata',
      'create_workflow': 'Create a new workflow',
      'get_workflow': 'Get workflow by ID',
      'update_workflow': 'Update existing workflow',
      'delete_workflow': 'Delete workflow by ID',
      'activate_workflow': 'Activate workflow',
      'deactivate_workflow': 'Deactivate workflow',
      'execute_workflow': 'Execute workflow manually',
      
      // Execution tools
      'list_executions': 'List workflow executions',
      'get_execution': 'Get execution by ID',
      'delete_execution': 'Delete execution by ID',
      
      // Tag tools
      'create_tag': 'Create new tag',
      'get_tags': 'List all tags',
      'get_tag': 'Get tag by ID',
      'update_tag': 'Update tag',
      'delete_tag': 'Delete tag'
    };

    return descriptions[toolName] || 'No description available';
  }
}