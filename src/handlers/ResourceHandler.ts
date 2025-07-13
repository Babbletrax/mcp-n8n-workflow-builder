/**
 * Handler for MCP resource requests
 */

import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { BaseHandler, ResourceHandler as IResourceHandler, ResourceContent, HandlerContext } from './BaseHandler';
import { N8NApiWrapper } from '../services/n8nApiWrapper';
import logger from '../utils/logger';

export class ResourceHandler extends BaseHandler implements IResourceHandler {
  private n8nWrapper: N8NApiWrapper;

  constructor(n8nWrapper: N8NApiWrapper, isDebugMode: boolean = false) {
    super(isDebugMode);
    this.n8nWrapper = n8nWrapper;
  }

  /**
   * Lists all available resources
   */
  getResourceList(): any[] {
    return [
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
    ];
  }

  /**
   * Lists resource templates
   */
  getResourceTemplates(): any[] {
    return [
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
    ];
  }

  canHandleResource(uri: string): boolean {
    const staticResources = ['/workflows', '/execution-stats'];
    const templatePatterns = [
      /^\/workflows\/(.+)$/,
      /^\/executions\/(.+)$/
    ];

    return staticResources.includes(uri) || 
           templatePatterns.some(pattern => pattern.test(uri));
  }

  async handleResource(uri: string, context: HandlerContext): Promise<ResourceContent> {
    this.log('info', `Handling resource request for: ${uri}`, { 
      context: this.sanitizeParams(context) 
    });

    try {
      // Static resources
      if (uri === '/workflows') {
        return await this.handleWorkflowsList(context);
      }

      if (uri === '/execution-stats') {
        return await this.handleExecutionStats(context);
      }

      // Dynamic resource template matching
      const workflowMatch = uri.match(/^\/workflows\/(.+)$/);
      if (workflowMatch) {
        return await this.handleWorkflowDetails(workflowMatch[1], context);
      }

      const executionMatch = uri.match(/^\/executions\/(.+)$/);
      if (executionMatch) {
        return await this.handleExecutionDetails(executionMatch[1], context);
      }

      throw new McpError(ErrorCode.InvalidParams, `Resource not found: ${uri}`);
    } catch (error) {
      this.log('error', `Error handling resource ${uri}`, error);
      
      if (error instanceof McpError) {
        throw error;
      }
      
      throw new McpError(
        ErrorCode.InternalError, 
        `Failed to handle resource: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  private async handleWorkflowsList(context: HandlerContext): Promise<ResourceContent> {
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

  private async handleExecutionStats(context: HandlerContext): Promise<ResourceContent> {
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
      
      const stats = {
        total,
        succeeded,
        failed,
        waiting,
        avgExecutionTime
      };

      return {
        contents: [{
          type: 'text',
          text: JSON.stringify(stats, null, 2),
          mimeType: 'application/json',
          uri: '/execution-stats'
        }]
      };
    } catch (error) {
      logger.error('Failed to retrieve execution statistics', error);
      
      const errorStats = {
        total: 0,
        succeeded: 0,
        failed: 0,
        waiting: 0,
        avgExecutionTime: '0s',
        error: 'Failed to retrieve execution statistics'
      };

      return {
        contents: [{
          type: 'text',
          text: JSON.stringify(errorStats, null, 2),
          mimeType: 'application/json',
          uri: '/execution-stats'
        }]
      };
    }
  }

  private async handleWorkflowDetails(id: string, context: HandlerContext): Promise<ResourceContent> {
    try {
      const workflow = await this.n8nWrapper.getWorkflow(id);
      
      return {
        contents: [{
          type: 'text',
          text: JSON.stringify(workflow, null, 2),
          mimeType: 'application/json',
          uri: `/workflows/${id}`
        }]
      };
    } catch (error) {
      throw new McpError(ErrorCode.InvalidParams, `Workflow with ID ${id} not found`);
    }
  }

  private async handleExecutionDetails(idStr: string, context: HandlerContext): Promise<ResourceContent> {
    const id = parseInt(idStr, 10);
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
          uri: `/executions/${id}`
        }]
      };
    } catch (error) {
      throw new McpError(ErrorCode.InvalidParams, `Execution with ID ${id} not found`);
    }
  }
}