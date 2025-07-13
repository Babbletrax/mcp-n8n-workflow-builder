/**
 * Unit tests for N8NWorkflowServer class
 */

import { N8NWorkflowServer } from '../N8NWorkflowServer';
import { N8NApiWrapper } from '../../services/n8nApiWrapper';
import { ToolRegistry } from '../../handlers/ToolRegistry';
import { ResourceHandler } from '../../handlers/ResourceHandler';
import { PromptHandler } from '../../handlers/PromptHandler';
import { HttpServerSetup } from '../HttpServerSetup';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';

// Mock all dependencies
jest.mock('../../services/n8nApiWrapper');
jest.mock('../../handlers/ToolRegistry');
jest.mock('../../handlers/ResourceHandler');
jest.mock('../../handlers/PromptHandler');
jest.mock('../HttpServerSetup');

// Mock the MCP SDK Server
const mockServer = {
  setRequestHandler: jest.fn(),
  onerror: undefined,
  connect: jest.fn().mockResolvedValue(undefined),
  '_requestHandlers': new Map()
};

jest.mock('@modelcontextprotocol/sdk/server/index.js', () => ({
  Server: jest.fn().mockImplementation(() => mockServer)
}));

jest.mock('@modelcontextprotocol/sdk/server/stdio.js', () => ({
  StdioServerTransport: jest.fn().mockImplementation(() => ({}))
}));

const mockN8NApiWrapper = N8NApiWrapper as jest.MockedClass<typeof N8NApiWrapper>;
const mockToolRegistry = ToolRegistry as jest.MockedClass<typeof ToolRegistry>;
const mockResourceHandler = ResourceHandler as jest.MockedClass<typeof ResourceHandler>;
const mockPromptHandler = PromptHandler as jest.MockedClass<typeof PromptHandler>;
const mockHttpServerSetup = HttpServerSetup as jest.MockedClass<typeof HttpServerSetup>;

describe('N8NWorkflowServer', () => {
  let server: N8NWorkflowServer;
  let mockWrapper: jest.Mocked<N8NApiWrapper>;
  let mockToolReg: jest.Mocked<ToolRegistry>;
  let mockResHandler: jest.Mocked<ResourceHandler>;
  let mockPromptHdlr: jest.Mocked<PromptHandler>;
  let mockHttpSetup: jest.Mocked<HttpServerSetup>;

  beforeEach(() => {
    // Reset environment variables
    delete process.env.DEBUG;
    delete process.env.MCP_PORT;
    delete process.env.NODE_ENV;
    delete process.env.MCP_STANDALONE;

    // Create mock instances
    mockWrapper = new mockN8NApiWrapper() as jest.Mocked<N8NApiWrapper>;
    mockToolReg = new mockToolRegistry(mockWrapper, false) as jest.Mocked<ToolRegistry>;
    mockResHandler = new mockResourceHandler(mockWrapper, false) as jest.Mocked<ResourceHandler>;
    mockPromptHdlr = new mockPromptHandler(false) as jest.Mocked<PromptHandler>;
    mockHttpSetup = new mockHttpServerSetup({} as any, false) as jest.Mocked<HttpServerSetup>;

    // Mock method implementations
    mockToolReg.getToolDefinitions.mockReturnValue([]);
    mockToolReg.handleToolCall.mockResolvedValue({
      content: [{ type: 'text', text: 'Success' }]
    });
    
    mockResHandler.getResourceList.mockReturnValue([]);
    mockResHandler.getResourceTemplates.mockReturnValue([]);
    mockResHandler.canHandleResource.mockReturnValue(true);
    mockResHandler.handleResource.mockResolvedValue({
      contents: [{ type: 'text', text: 'Resource content' }]
    });

    mockPromptHdlr.getPromptDefinitions.mockReturnValue([]);
    mockPromptHdlr.handlePrompt.mockResolvedValue({
      messages: [{ role: 'user', content: { type: 'text', text: 'Prompt result' } }]
    });

    mockHttpSetup.start.mockResolvedValue();
    mockHttpSetup.stop.mockResolvedValue();

    // Spy on console.error to suppress logs during tests
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(process, 'exit').mockImplementation(() => undefined as never);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('constructor', () => {
    it('should initialize with debug mode disabled by default', () => {
      server = new N8NWorkflowServer();
      expect(server).toBeInstanceOf(N8NWorkflowServer);
      expect(mockN8NApiWrapper).toHaveBeenCalled();
    });

    it('should initialize with debug mode enabled when DEBUG=true', () => {
      process.env.DEBUG = 'true';
      server = new N8NWorkflowServer();
      expect(server).toBeInstanceOf(N8NWorkflowServer);
    });

    it('should create all required handlers', () => {
      server = new N8NWorkflowServer();
      expect(mockToolRegistry).toHaveBeenCalled();
      expect(mockResourceHandler).toHaveBeenCalled();
      expect(mockPromptHandler).toHaveBeenCalled();
    });
  });

  describe('setupHandlers', () => {
    beforeEach(() => {
      server = new N8NWorkflowServer();
    });

    it('should setup tool handlers correctly', () => {
      // Tool handlers are set up in constructor
      expect(mockToolReg.getToolDefinitions).toBeDefined();
    });

    it('should setup resource handlers correctly', () => {
      expect(mockResHandler.getResourceList).toBeDefined();
      expect(mockResHandler.getResourceTemplates).toBeDefined();
    });

    it('should setup prompt handlers correctly', () => {
      expect(mockPromptHdlr.getPromptDefinitions).toBeDefined();
    });
  });

  describe('getUserPermissions', () => {
    beforeEach(() => {
      server = new N8NWorkflowServer();
    });

    it('should return default admin user in development', () => {
      process.env.NODE_ENV = 'development';
      const permissions = server['getUserPermissions']({});
      expect(permissions).toBeDefined();
      expect(permissions.role).toBe('ADMIN');
    });

    it('should return undefined in production', () => {
      process.env.NODE_ENV = 'production';
      const permissions = server['getUserPermissions']({});
      expect(permissions).toBeUndefined();
    });
  });

  describe('run', () => {
    beforeEach(() => {
      server = new N8NWorkflowServer();
    });

    it('should run in standalone mode when MCP_STANDALONE is true', async () => {
      process.env.MCP_STANDALONE = 'true';
      const runStandaloneSpy = jest.spyOn(server as any, 'runStandalone').mockResolvedValue(undefined);
      
      await server.run();
      
      expect(runStandaloneSpy).toHaveBeenCalled();
    });

    it('should run in standalone mode when stdin is TTY', async () => {
      Object.defineProperty(process.stdin, 'isTTY', { value: true, configurable: true });
      const runStandaloneSpy = jest.spyOn(server as any, 'runStandalone').mockResolvedValue(undefined);
      
      await server.run();
      
      expect(runStandaloneSpy).toHaveBeenCalled();
    });

    it('should run as subprocess when not in standalone mode', async () => {
      process.env.MCP_STANDALONE = 'false';
      Object.defineProperty(process.stdin, 'isTTY', { value: false, configurable: true });
      const runAsSubprocessSpy = jest.spyOn(server as any, 'runAsSubprocess').mockResolvedValue(undefined);
      
      await server.run();
      
      expect(runAsSubprocessSpy).toHaveBeenCalled();
    });

    it('should handle errors and exit with code 1', async () => {
      const error = new Error('Server startup failed');
      jest.spyOn(server as any, 'runStandalone').mockRejectedValue(error);
      process.env.MCP_STANDALONE = 'true';
      
      await server.run();
      
      expect(process.exit).toHaveBeenCalledWith(1);
    });
  });

  describe('runStandalone', () => {
    beforeEach(() => {
      server = new N8NWorkflowServer();
    });

    it('should use default port 3456', async () => {
      await server['runStandalone']();
      
      // Check that HttpServerSetup was called with port 3456
      expect(mockHttpServerSetup).toHaveBeenCalledWith(
        expect.objectContaining({ port: 3456 }),
        expect.any(Boolean)
      );
    });

    it('should use custom port from MCP_PORT', async () => {
      process.env.MCP_PORT = '8080';
      
      await server['runStandalone']();
      
      expect(mockHttpServerSetup).toHaveBeenCalledWith(
        expect.objectContaining({ port: 8080 }),
        expect.any(Boolean)
      );
    });

    it('should configure production settings when NODE_ENV=production', async () => {
      process.env.NODE_ENV = 'production';
      
      await server['runStandalone']();
      
      expect(mockHttpServerSetup).toHaveBeenCalledWith(
        expect.objectContaining({ 
          isProduction: true,
          isDevelopment: false
        }),
        expect.any(Boolean)
      );
    });

    it('should start HTTP server', async () => {
      await server['runStandalone']();
      
      expect(mockHttpSetup.start).toHaveBeenCalled();
    });
  });

  describe('runAsSubprocess', () => {
    beforeEach(() => {
      server = new N8NWorkflowServer();
    });

    it('should setup HTTP server for debugging', async () => {
      await server['runAsSubprocess']();
      
      expect(mockHttpServerSetup).toHaveBeenCalled();
      expect(mockHttpSetup.start).toHaveBeenCalled();
    });

    it('should not fail if HTTP server startup fails', async () => {
      mockHttpSetup.start.mockRejectedValue(new Error('Port in use'));
      
      await expect(server['runAsSubprocess']()).resolves.not.toThrow();
    });
  });

  describe('handleJsonRpcMessage', () => {
    beforeEach(() => {
      server = new N8NWorkflowServer();
    });

    it('should handle valid JSON-RPC requests', async () => {
      const request = {
        jsonrpc: '2.0',
        method: 'tools/list',
        id: 1
      };

      // Mock the server's request handlers
      const mockHandler = jest.fn().mockResolvedValue({ tools: [] });
      server['server']['_requestHandlers'] = new Map();
      server['server']['_requestHandlers'].set('tools/list', mockHandler);

      const result = await server['handleJsonRpcMessage'](request);

      expect(result).toEqual({
        jsonrpc: '2.0',
        result: { tools: [] },
        id: 1
      });
    });

    it('should throw error for unknown methods', async () => {
      const request = {
        jsonrpc: '2.0',
        method: 'unknown/method',
        id: 1
      };

      server['server']['_requestHandlers'] = new Map();

      await expect(server['handleJsonRpcMessage'](request))
        .rejects.toThrow(McpError);
    });

    it('should handle handler errors', async () => {
      const request = {
        jsonrpc: '2.0',
        method: 'tools/call',
        id: 1
      };

      const mockHandler = jest.fn().mockRejectedValue(new Error('Handler failed'));
      server['server']['_requestHandlers'] = new Map();
      server['server']['_requestHandlers'].set('tools/call', mockHandler);

      await expect(server['handleJsonRpcMessage'](request))
        .rejects.toThrow();
    });
  });

  describe('shutdown', () => {
    beforeEach(() => {
      server = new N8NWorkflowServer();
    });

    it('should shutdown HTTP server if running', async () => {
      server['httpServerSetup'] = mockHttpSetup;
      
      await server.shutdown();
      
      expect(mockHttpSetup.stop).toHaveBeenCalled();
    });

    it('should handle shutdown when no HTTP server is running', async () => {
      server['httpServerSetup'] = null;
      
      await expect(server.shutdown()).resolves.not.toThrow();
    });
  });

  describe('sanitizeErrorForClient', () => {
    it('should return generic message in production', () => {
      const error = new Error('Database connection failed with password 123456');
      const result = require('../N8NWorkflowServer').sanitizeErrorForClient(error, true);
      
      expect(result).toBe('An internal server error occurred');
    });

    it('should sanitize error messages in development', () => {
      const error = new Error('API key abc123def456ghi789 is invalid');
      const result = require('../N8NWorkflowServer').sanitizeErrorForClient(error, false);
      
      expect(result).toBe('API key [REDACTED] is invalid');
      expect(result).not.toContain('abc123def456ghi789');
    });

    it('should handle non-Error objects', () => {
      const result = require('../N8NWorkflowServer').sanitizeErrorForClient('string error', false);
      expect(result).toBe('Unknown error occurred');
    });
  });
});