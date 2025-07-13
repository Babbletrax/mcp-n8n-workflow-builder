/**
 * Handler for MCP prompt requests
 */

import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { BaseHandler, PromptHandler as IPromptHandler, HandlerContext } from './BaseHandler';
import * as promptsService from '../services/promptsService';
import { Prompt } from '../types/prompts';

export class PromptHandler extends BaseHandler implements IPromptHandler {
  constructor(isDebugMode: boolean = false) {
    super(isDebugMode);
  }

  /**
   * Gets all available prompts
   */
  getAllPrompts(): any[] {
    const prompts = promptsService.getAllPrompts();
    
    // Transform them to the format expected by MCP
    return prompts.map((prompt: Prompt) => ({
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
  }

  canHandlePrompt(promptId: string): boolean {
    const prompts = promptsService.getAllPrompts();
    return prompts.some(prompt => prompt.id === promptId);
  }

  async handlePrompt(promptId: string, variables: Record<string, string>, context: HandlerContext): Promise<any> {
    this.log('info', `Filling prompt "${promptId}" with variables`, { 
      promptId,
      variables: this.sanitizeParams(variables),
      context: this.sanitizeParams(context)
    });

    try {
      if (!this.canHandlePrompt(promptId)) {
        throw new McpError(ErrorCode.InvalidParams, `Unknown prompt: ${promptId}`);
      }

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
      this.log('error', `Error filling prompt: ${error instanceof Error ? error.message : String(error)}`);
      throw new McpError(
        ErrorCode.InvalidParams, 
        `Error filling prompt: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Gets available prompt definitions for MCP server registration
   */
  getPromptDefinitions(): any[] {
    return this.getAllPrompts();
  }
}