/**
 * Handler for workflow-related MCP tools
 */

import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { BaseHandler, ToolHandler, ToolCallResult, HandlerContext } from './BaseHandler';
import { N8NApiWrapper } from '../services/n8nApiWrapper';
import { WorkflowInput, LegacyWorkflowConnection } from '../types/workflow';
import { validateWorkflowInput, validateInput, validationSchemas } from '../utils/validation';
import { OperationType, UserPermissions } from '../utils/security';

export class WorkflowToolHandler extends BaseHandler implements ToolHandler {
  private n8nWrapper: N8NApiWrapper;

  constructor(n8nWrapper: N8NApiWrapper, isDebugMode: boolean = false) {
    super(isDebugMode);
    this.n8nWrapper = n8nWrapper;
  }

  getSupportedTools(): string[] {
    return [
      'list_workflows',
      'create_workflow',
      'get_workflow',
      'update_workflow',
      'delete_workflow',
      'activate_workflow',
      'deactivate_workflow',
      'execute_workflow'
    ];
  }

  async handleTool(toolName: string, args: any, context: HandlerContext): Promise<ToolCallResult> {
    this.log('info', `Handling workflow tool: ${toolName}`, { 
      args: this.sanitizeParams(args),
      context: this.sanitizeParams(context)
    });

    try {
      switch (toolName) {
        case 'list_workflows':
          return await this.handleListWorkflows(args, context);
        case 'create_workflow':
          return await this.handleCreateWorkflow(args, context);
        case 'get_workflow':
          return await this.handleGetWorkflow(args, context);
        case 'update_workflow':
          return await this.handleUpdateWorkflow(args, context);
        case 'delete_workflow':
          return await this.handleDeleteWorkflow(args, context);
        case 'activate_workflow':
          return await this.handleActivateWorkflow(args, context);
        case 'deactivate_workflow':
          return await this.handleDeactivateWorkflow(args, context);
        case 'execute_workflow':
          return await this.handleExecuteWorkflow(args, context);
        default:
          throw new McpError(ErrorCode.MethodNotFound, `Unsupported workflow tool: ${toolName}`);
      }
    } catch (error) {
      this.log('error', `Error handling ${toolName}`, error);
      
      if (error instanceof McpError) {
        throw error;
      }
      
      return this.createErrorResponse(error instanceof Error ? error.message : String(error));
    }
  }

  private async handleListWorkflows(args: any, context: HandlerContext): Promise<ToolCallResult> {
    try {
      // Validate instance if provided
      if (args.instance) {
        validateInput(args.instance, validationSchemas.instanceName);
      }

      const workflows = await this.n8nWrapper.listWorkflows(args.instance);
      return this.createSuccessResponse(workflows);
    } catch (error) {
      this.log('error', `Failed to list workflows: ${error instanceof Error ? error.message : String(error)}`, error);
      throw new McpError(ErrorCode.InternalError, `Failed to list workflows: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private async handleCreateWorkflow(args: any, context: HandlerContext): Promise<ToolCallResult> {
    try {
      // Validate instance parameter if provided
      if (args.instance) {
        validateInput(args.instance, validationSchemas.instanceName);
      }

      this.log('info', 'Creating workflow with validated parameters');

      // Use comprehensive validation
      const workflowInput = validateWorkflowInput(args);
      
      this.log('info', 'Workflow input validated successfully');

      const createdWorkflow = await this.n8nWrapper.createWorkflow(
        workflowInput, 
        args.instance
      );

      this.log('info', 'Workflow created successfully');

      return this.createSuccessResponse(createdWorkflow);
    } catch (error) {
      this.log('error', 'Error creating workflow:', error);
      if (error instanceof McpError) {
        throw error;
      }
      throw new McpError(ErrorCode.InternalError, `Failed to create workflow: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private async handleGetWorkflow(args: any, context: HandlerContext): Promise<ToolCallResult> {
    this.validateRequired(args, ['id']);

    // Validate workflow ID
    const workflowId = validateInput(args.id, validationSchemas.workflowId) as string;

    // Validate instance if provided
    if (args.instance) {
      validateInput(args.instance, validationSchemas.instanceName);
    }

    const workflow = await this.n8nWrapper.getWorkflow(workflowId, args.instance);
    return this.createSuccessResponse(workflow);
  }

  private async handleUpdateWorkflow(args: any, context: HandlerContext): Promise<ToolCallResult> {
    this.validateRequired(args, ['id', 'name', 'nodes']);

    // Create input data for updating in the required format
    const updateInput: WorkflowInput = {
      name: args.name,
      nodes: args.nodes as any[],
      connections: []
    };

    // Transform connections to LegacyWorkflowConnection[] format
    if (args.connections) {
      if (Array.isArray(args.connections)) {
        updateInput.connections = args.connections.map((conn: any) => ({
          source: conn.source,
          target: conn.target,
          sourceOutput: conn.sourceOutput,
          targetInput: conn.targetInput
        }));
      } else if (typeof args.connections === 'object') {
        // N8N API format, transform to legacy format
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

    this.log('info', `Updating workflow with connections`, { 
      connections: this.sanitizeParams(updateInput.connections) 
    });

    try {
      const updatedWorkflow = await this.n8nWrapper.updateWorkflow(
        args.id, 
        updateInput, 
        args.instance
      );
      return this.createSuccessResponse(updatedWorkflow);
    } catch (error) {
      this.log('error', `Failed to update workflow: ${error instanceof Error ? error.message : String(error)}`, error);
      throw new McpError(ErrorCode.InternalError, `Failed to update workflow: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private async handleDeleteWorkflow(args: any, context: HandlerContext): Promise<ToolCallResult> {
    this.validateRequired(args, ['id']);

    // Validate workflow ID
    const workflowId = validateInput(args.id, validationSchemas.workflowId) as string;

    const deleteResult = await this.n8nWrapper.deleteWorkflow(workflowId, args.instance);
    return this.createSuccessResponse(deleteResult);
  }

  private async handleActivateWorkflow(args: any, context: HandlerContext): Promise<ToolCallResult> {
    this.validateRequired(args, ['id']);

    const activatedWorkflow = await this.n8nWrapper.activateWorkflow(args.id, args.instance);
    return this.createSuccessResponse(activatedWorkflow);
  }

  private async handleDeactivateWorkflow(args: any, context: HandlerContext): Promise<ToolCallResult> {
    this.validateRequired(args, ['id']);

    const deactivatedWorkflow = await this.n8nWrapper.deactivateWorkflow(args.id, args.instance);
    return this.createSuccessResponse(deactivatedWorkflow);
  }

  private async handleExecuteWorkflow(args: any, context: HandlerContext): Promise<ToolCallResult> {
    this.validateRequired(args, ['id']);

    // Validate workflow ID
    const validatedId = validateInput(args.id, validationSchemas.workflowId) as string;

    // Validate instance if provided
    if (args.instance) {
      validateInput(args.instance, validationSchemas.instanceName);
    }

    const executionResult = await this.n8nWrapper.executeWorkflow(
      validatedId, 
      args.runData, 
      args.instance
    );
    return this.createSuccessResponse(executionResult);
  }
}