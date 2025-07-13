/**
 * Main N8N Workflow MCP Server orchestrator
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { Request, Response } from 'express';

import { 
  CallToolRequestSchema, 
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
  ListResourceTemplatesRequestSchema,
  ListPromptsRequestSchema
} from '../sdk-schemas';

import { BaseHandler, HandlerContext } from '../handlers/BaseHandler';
import { ToolRegistry } from '../handlers/ToolRegistry';
import { ResourceHandler } from '../handlers/ResourceHandler';
import { PromptHandler } from '../handlers/PromptHandler';
import { HttpServerSetup, HttpServerConfig } from './HttpServerSetup';
import { N8NApiWrapper } from '../services/n8nApiWrapper';
import { createDefaultAdminUser } from '../utils/security';

/**
 * Sanitizes error messages for safe client response
 */
function sanitizeErrorForClient(error: unknown, isProduction: boolean = process.env.NODE_ENV === 'production'): string {
  if (isProduction) {
    return 'An internal server error occurred';
  }
  
  if (error instanceof Error) {
    const message = error.message;
    return message.replace(/[a-zA-Z0-9]{20,}/g, '[REDACTED]');
  }
  
  return 'Unknown error occurred';
}

export class N8NWorkflowServer extends BaseHandler {
  private server: InstanceType<typeof Server>;
  private n8nWrapper: N8NApiWrapper;
  private toolRegistry: ToolRegistry;
  private resourceHandler: ResourceHandler;
  private promptHandler: PromptHandler;
  private httpServerSetup: HttpServerSetup | null = null;

  constructor() {
    const isDebugMode = process.env.DEBUG === 'true';
    super(isDebugMode);
    
    this.n8nWrapper = new N8NApiWrapper();
    this.toolRegistry = new ToolRegistry(this.n8nWrapper, isDebugMode);
    this.resourceHandler = new ResourceHandler(this.n8nWrapper, isDebugMode);
    this.promptHandler = new PromptHandler(isDebugMode);
    
    this.server = new Server(
      { name: 'n8n-workflow-builder', version: '0.9.0' },
      { capabilities: { tools: {}, resources: {}, prompts: {} } }
    );

    this.setupHandlers();
    this.server.onerror = (error: any) => this.log('error', `Server error: ${error.message || error}`);
  }

  private setupHandlers(): void {
    this.setupToolHandlers();
    this.setupResourceHandlers();
    this.setupPromptHandlers();
  }

  private setupToolHandlers(): void {
    // List available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async (req: any) => {
      this.log('info', 'Listing available tools');
      return {
        tools: this.toolRegistry.getToolDefinitions()
      };
    });

    // Handle tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request: any) => {
      this.log('info', `Tool call request received`, { 
        method: request.params?.name,
        args: request.params?.arguments ? 'present' : 'none'
      });
      
      try {
        const { name, arguments: args } = request.params;
        
        const context: HandlerContext = {
          userPermissions: this.getUserPermissions(request),
          isDebugMode: this.isDebugMode,
          requestId: request.id
        };

        return await this.toolRegistry.handleToolCall(name, args, context);
      } catch (error) {
        this.log('error', 'Tool call failed', error);
        
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

  private setupResourceHandlers(): void {
    // List available resources
    this.server.setRequestHandler(ListResourcesRequestSchema, async () => {
      this.log('info', 'Listing available resources');
      return {
        resources: this.resourceHandler.getResourceList()
      };
    });

    // List resource templates
    this.server.setRequestHandler(ListResourceTemplatesRequestSchema, async () => {
      this.log('info', 'Listing resource templates');
      return {
        templates: this.resourceHandler.getResourceTemplates()
      };
    });

    // Read a specific resource
    this.server.setRequestHandler(ReadResourceRequestSchema, async (request: any) => {
      const { uri } = request.params;
      this.log('info', `Reading resource: ${uri}`);
      
      const context: HandlerContext = {
        userPermissions: this.getUserPermissions(request),
        isDebugMode: this.isDebugMode,
        requestId: request.id
      };

      if (!this.resourceHandler.canHandleResource(uri)) {
        throw new McpError(ErrorCode.InvalidParams, `Resource not found: ${uri}`);
      }

      return await this.resourceHandler.handleResource(uri, context);
    });
  }

  private setupPromptHandlers(): void {
    // List available prompts
    this.server.setRequestHandler(ListPromptsRequestSchema, async () => {
      this.log('info', 'Listing available prompts');
      return {
        prompts: this.promptHandler.getPromptDefinitions()
      };
    });

    // Handle prompt fill requests
    this.server["_requestHandlers"].set('prompts/fill', async (request: any) => {
      const { promptId, variables } = request.params;
      this.log('info', `Filling prompt "${promptId}" with variables`);

      try {
        const context: HandlerContext = {
          userPermissions: this.getUserPermissions(request),
          isDebugMode: this.isDebugMode,
          requestId: request.id
        };

        return await this.promptHandler.handlePrompt(promptId, variables, context);
      } catch (error) {
        this.log('error', `Error filling prompt: ${sanitizeErrorForClient(error, false)}`);
        throw new McpError(ErrorCode.InvalidParams, `Error filling prompt: ${sanitizeErrorForClient(error)}`);
      }
    });
  }

  private getUserPermissions(request: any): any {
    // In development, create a default admin user
    // In production, this should extract permissions from the request
    if (process.env.NODE_ENV !== 'production') {
      return createDefaultAdminUser();
    }
    
    // TODO: Extract user permissions from request headers/authentication
    // For now, return undefined to maintain backward compatibility
    return undefined;
  }

  /**
   * Starts the MCP server
   */
  async run(): Promise<void> {
    try {
      // Check if we're running as an MCP subprocess or standalone
      const isStandaloneMode = process.env.MCP_STANDALONE === 'true' || process.stdin.isTTY;
      
      if (isStandaloneMode) {
        await this.runStandalone();
      } else {
        await this.runAsSubprocess();
      }
    } catch (error) {
      this.log('error', `Failed to start MCP server: ${error instanceof Error ? error.message : String(error)}`);
      process.exit(1);
    }
  }

  private async runStandalone(): Promise<void> {
    const port = process.env.MCP_PORT ? parseInt(process.env.MCP_PORT, 10) : 3456;
    
    const httpConfig: HttpServerConfig = {
      port,
      isProduction: process.env.NODE_ENV === 'production',
      isDevelopment: process.env.NODE_ENV !== 'production',
      corsAllowedOrigins: process.env.CORS_ALLOWED_ORIGINS?.split(',').map(origin => origin.trim()),
      corsDevOrigins: process.env.CORS_DEV_ORIGINS?.split(',').map(origin => origin.trim())
    };

    this.httpServerSetup = new HttpServerSetup(httpConfig, this.isDebugMode);
    
    // Add MCP request handler
    this.httpServerSetup.addMcpHandler((req: Request, res: Response) => {
      try {
        if (this.isDebugMode) {
          this.log('debug', 'Received MCP request');
        }
        
        this.handleJsonRpcMessage(req.body).then(result => {
          if (this.isDebugMode) {
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

    // Add SSE endpoint for MCP
    this.httpServerSetup.addMcpSseHandler((req: Request, res: Response) => {
      try {
        if (this.isDebugMode) {
          this.log('debug', 'SSE connection established');
        }

        // Handle SSE-based MCP communication
        this.handleSseConnection(req, res);
      } catch (error) {
        this.log('error', 'Error handling SSE connection', error);
        res.write('event: error\n');
        res.write(`data: ${JSON.stringify({
          type: 'error',
          error: sanitizeErrorForClient(error)
        })}\n\n`);
        res.end();
      }
    });

    await this.httpServerSetup.start();
    this.log('info', `MCP server running in standalone mode on port ${port}`);
    
    // Keep the process alive
    process.on('SIGINT', () => {
      this.log('info', 'Received SIGINT, shutting down gracefully');
      this.shutdown().then(() => process.exit(0));
    });
  }

  private async runAsSubprocess(): Promise<void> {
    // MCP subprocess mode - use stdin/stdout transport
    const transport = new StdioServerTransport();
    
    // Also start HTTP server for debugging
    const port = process.env.MCP_PORT ? parseInt(process.env.MCP_PORT, 10) : 3456;
    
    const httpConfig: HttpServerConfig = {
      port,
      isProduction: process.env.NODE_ENV === 'production',
      isDevelopment: process.env.NODE_ENV !== 'production'
    };

    this.httpServerSetup = new HttpServerSetup(httpConfig, this.isDebugMode);
    this.httpServerSetup.start().catch(error => {
      // Don't fail if HTTP server can't start in MCP mode
      this.log('warn', `HTTP server failed to start: ${error.message}`);
    });
    
    // Connect to MCP transport
    await this.server.connect(transport);
  }

  private async handleJsonRpcMessage(request: any): Promise<any> {
    const { method, params, id } = request;
    
    const handler = this.server['_requestHandlers'].get(method);
    
    if (!handler) {
      throw new McpError(ErrorCode.MethodNotFound, `Method '${method}' not found`);
    }
    
    try {
      const result = await handler(request);
      
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

  private handleSseConnection(req: Request, res: Response): void {
    // Send available methods
    const availableMethods = Array.from(this.server['_requestHandlers'].keys());
    res.write('event: methods\n');
    res.write(`data: ${JSON.stringify({
      type: 'methods',
      methods: availableMethods
    })}\n\n`);

    // Keep connection alive with periodic pings
    const pingInterval = setInterval(() => {
      if (!res.destroyed) {
        res.write('event: ping\n');
        res.write('data: {"type":"ping"}\n\n');
      } else {
        clearInterval(pingInterval);
      }
    }, 30000); // Ping every 30 seconds

    // Handle incoming data for SSE (though typically SSE is one-way)
    // For MCP over SSE, we might need to implement a different mechanism
    // This is a basic implementation that sends server info
    
    res.write('event: server_info\n');
    res.write(`data: ${JSON.stringify({
      type: 'server_info',
      name: 'n8n-workflow-builder',
      version: '0.9.0',
      capabilities: {
        tools: true,
        resources: true,
        prompts: true
      }
    })}\n\n`);

    // Clean up on disconnect
    req.on('close', () => {
      clearInterval(pingInterval);
    });
  }

  /**
   * Gracefully shuts down the server
   */
  async shutdown(): Promise<void> {
    this.log('info', 'Shutting down N8N Workflow Server');
    
    if (this.httpServerSetup) {
      await this.httpServerSetup.stop();
    }
    
    // Additional cleanup can be added here
  }
}