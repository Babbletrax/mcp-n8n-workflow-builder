/**
 * Handler for execution-related MCP tools
 */

import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { BaseHandler, ToolHandler, ToolCallResult, HandlerContext } from './BaseHandler';
import { N8NApiWrapper } from '../services/n8nApiWrapper';
import { ExecutionListOptions } from '../types/execution';
import { validateInput, validationSchemas } from '../utils/validation';

export class ExecutionToolHandler extends BaseHandler implements ToolHandler {
  private n8nWrapper: N8NApiWrapper;

  constructor(n8nWrapper: N8NApiWrapper, isDebugMode: boolean = false) {
    super(isDebugMode);
    this.n8nWrapper = n8nWrapper;
  }

  getSupportedTools(): string[] {
    return [
      'list_executions',
      'get_execution',
      'delete_execution'
    ];
  }

  async handleTool(toolName: string, args: any, context: HandlerContext): Promise<ToolCallResult> {
    this.log('info', `Handling execution tool: ${toolName}`, { 
      args: this.sanitizeParams(args),
      context: this.sanitizeParams(context)
    });

    try {
      switch (toolName) {
        case 'list_executions':
          return await this.handleListExecutions(args, context);
        case 'get_execution':
          return await this.handleGetExecution(args, context);
        case 'delete_execution':
          return await this.handleDeleteExecution(args, context);
        default:
          throw new McpError(ErrorCode.MethodNotFound, `Unsupported execution tool: ${toolName}`);
      }
    } catch (error) {
      this.log('error', `Error handling ${toolName}`, error);
      
      if (error instanceof McpError) {
        throw error;
      }
      
      return this.createErrorResponse(error instanceof Error ? error.message : String(error));
    }
  }

  private async handleListExecutions(args: any, context: HandlerContext): Promise<ToolCallResult> {
    const options: ExecutionListOptions = {};

    // Build options from args
    if (args.includeData !== undefined) options.includeData = args.includeData;
    if (args.status) options.status = args.status;
    if (args.workflowId) options.workflowId = args.workflowId;
    if (args.projectId) options.projectId = args.projectId;
    if (args.limit) options.limit = args.limit;
    if (args.cursor) options.cursor = args.cursor;

    const executions = await this.n8nWrapper.listExecutions(
      options, 
      args.instance, 
      context.userPermissions
    );
    return this.createSuccessResponse(executions);
  }

  private async handleGetExecution(args: any, context: HandlerContext): Promise<ToolCallResult> {
    this.validateRequired(args, ['id']);

    // Validate execution ID
    const executionId = validateInput(args.id, validationSchemas.executionId) as number;

    // Validate instance if provided
    if (args.instance) {
      validateInput(args.instance, validationSchemas.instanceName);
    }

    const execution = await this.n8nWrapper.getExecution(
      executionId, 
      args.includeData, 
      args.instance
    );
    return this.createSuccessResponse(execution);
  }

  private async handleDeleteExecution(args: any, context: HandlerContext): Promise<ToolCallResult> {
    this.validateRequired(args, ['id']);

    // Validate execution ID
    const executionId = validateInput(args.id, validationSchemas.executionId) as number;

    const deletedExecution = await this.n8nWrapper.deleteExecution(
      executionId, 
      args.instance
    );
    return this.createSuccessResponse(deletedExecution);
  }
}