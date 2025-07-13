/**
 * Handler for tag-related MCP tools
 */

import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { BaseHandler, ToolHandler, ToolCallResult, HandlerContext } from './BaseHandler';
import { N8NApiWrapper } from '../services/n8nApiWrapper';

export class TagToolHandler extends BaseHandler implements ToolHandler {
  private n8nWrapper: N8NApiWrapper;

  constructor(n8nWrapper: N8NApiWrapper, isDebugMode: boolean = false) {
    super(isDebugMode);
    this.n8nWrapper = n8nWrapper;
  }

  getSupportedTools(): string[] {
    return [
      'create_tag',
      'get_tags',
      'get_tag',
      'update_tag',
      'delete_tag'
    ];
  }

  async handleTool(toolName: string, args: any, context: HandlerContext): Promise<ToolCallResult> {
    this.log('info', `Handling tag tool: ${toolName}`, { 
      args: this.sanitizeParams(args),
      context: this.sanitizeParams(context)
    });

    try {
      switch (toolName) {
        case 'create_tag':
          return await this.handleCreateTag(args, context);
        case 'get_tags':
          return await this.handleGetTags(args, context);
        case 'get_tag':
          return await this.handleGetTag(args, context);
        case 'update_tag':
          return await this.handleUpdateTag(args, context);
        case 'delete_tag':
          return await this.handleDeleteTag(args, context);
        default:
          throw new McpError(ErrorCode.MethodNotFound, `Unsupported tag tool: ${toolName}`);
      }
    } catch (error) {
      this.log('error', `Error handling ${toolName}`, error);
      
      if (error instanceof McpError) {
        throw error;
      }
      
      return this.createErrorResponse(error instanceof Error ? error.message : String(error));
    }
  }

  private async handleCreateTag(args: any, context: HandlerContext): Promise<ToolCallResult> {
    this.validateRequired(args, ['name']);

    const createdTag = await this.n8nWrapper.createTag(
      { name: args.name }, 
      args.instance, 
      context.userPermissions
    );
    return this.createSuccessResponse(createdTag);
  }

  private async handleGetTags(args: any, context: HandlerContext): Promise<ToolCallResult> {
    const tagsOptions: { cursor?: string; limit?: number } = {};

    if (args.cursor) {
      tagsOptions.cursor = args.cursor;
    }

    if (args.limit) {
      tagsOptions.limit = args.limit;
    }

    const tags = await this.n8nWrapper.getTags(
      tagsOptions, 
      args.instance, 
      context.userPermissions
    );
    return this.createSuccessResponse(tags);
  }

  private async handleGetTag(args: any, context: HandlerContext): Promise<ToolCallResult> {
    this.validateRequired(args, ['id']);

    const tag = await this.n8nWrapper.getTag(
      args.id, 
      args.instance, 
      context.userPermissions
    );
    return this.createSuccessResponse(tag);
  }

  private async handleUpdateTag(args: any, context: HandlerContext): Promise<ToolCallResult> {
    this.validateRequired(args, ['id', 'name']);

    const updatedTag = await this.n8nWrapper.updateTag(
      args.id, 
      { name: args.name }, 
      args.instance, 
      context.userPermissions
    );
    return this.createSuccessResponse(updatedTag);
  }

  private async handleDeleteTag(args: any, context: HandlerContext): Promise<ToolCallResult> {
    this.validateRequired(args, ['id']);

    const deletedTag = await this.n8nWrapper.deleteTag(
      args.id, 
      args.instance, 
      context.userPermissions
    );
    return this.createSuccessResponse(deletedTag);
  }
}