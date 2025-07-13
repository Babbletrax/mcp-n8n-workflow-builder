/**
 * Unit tests for ToolRegistry class
 */

import { ToolRegistry } from '../ToolRegistry';
import { N8NApiWrapper } from '../../services/n8nApiWrapper';
import { WorkflowToolHandler } from '../WorkflowToolHandler';
import { ExecutionToolHandler } from '../ExecutionToolHandler';
import { TagToolHandler } from '../TagToolHandler';
import { HandlerContext } from '../BaseHandler';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';

// Mock all dependencies
jest.mock('../../services/n8nApiWrapper');
jest.mock('../WorkflowToolHandler');
jest.mock('../ExecutionToolHandler');
jest.mock('../TagToolHandler');

const mockN8NApiWrapper = N8NApiWrapper as jest.MockedClass<typeof N8NApiWrapper>;
const mockWorkflowToolHandler = WorkflowToolHandler as jest.MockedClass<typeof WorkflowToolHandler>;
const mockExecutionToolHandler = ExecutionToolHandler as jest.MockedClass<typeof ExecutionToolHandler>;
const mockTagToolHandler = TagToolHandler as jest.MockedClass<typeof TagToolHandler>;

describe('ToolRegistry', () => {
  let registry: ToolRegistry;
  let mockWrapper: jest.Mocked<N8NApiWrapper>;
  let mockWorkflowHandler: jest.Mocked<WorkflowToolHandler>;
  let mockExecutionHandler: jest.Mocked<ExecutionToolHandler>;
  let mockTagHandler: jest.Mocked<TagToolHandler>;
  let context: HandlerContext;

  beforeEach(() => {
    mockWrapper = new mockN8NApiWrapper() as jest.Mocked<N8NApiWrapper>;
    
    // Mock the constructors to return objects with the required methods
    mockWorkflowToolHandler.mockImplementation(() => ({
      getSupportedTools: jest.fn().mockReturnValue([
        'list_workflows', 'create_workflow', 'get_workflow', 'update_workflow',
        'delete_workflow', 'activate_workflow', 'deactivate_workflow', 'execute_workflow'
      ]),
      handleTool: jest.fn().mockResolvedValue({ content: [{ type: 'text', text: 'Success' }] })
    }));

    mockExecutionToolHandler.mockImplementation(() => ({
      getSupportedTools: jest.fn().mockReturnValue([
        'list_executions', 'get_execution', 'delete_execution'
      ]),
      handleTool: jest.fn().mockResolvedValue({ content: [{ type: 'text', text: 'Success' }] })
    }));

    mockTagToolHandler.mockImplementation(() => ({
      getSupportedTools: jest.fn().mockReturnValue([
        'create_tag', 'get_tags', 'get_tag', 'update_tag', 'delete_tag'
      ]),
      handleTool: jest.fn().mockResolvedValue({ content: [{ type: 'text', text: 'Success' }] })
    }));

    registry = new ToolRegistry(mockWrapper, false);
    
    context = {
      userPermissions: undefined,
      isDebugMode: false,
      requestId: 'test-request-123'
    };

    // Spy on console.error to suppress logs during tests
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('constructor', () => {
    it('should initialize with all handlers', () => {
      expect(registry).toBeInstanceOf(ToolRegistry);
      // The constructor should have created handler instances
      expect(mockWorkflowToolHandler).toHaveBeenCalledWith(mockWrapper, false);
      expect(mockExecutionToolHandler).toHaveBeenCalledWith(mockWrapper, false);
      expect(mockTagToolHandler).toHaveBeenCalledWith(mockWrapper, false);
    });
  });

  describe('getToolDefinitions', () => {
    it('should return all tool definitions from all handlers', () => {
      const definitions = registry.getToolDefinitions();
      
      // Should include tools from all handlers
      expect(definitions.length).toBeGreaterThan(0);
      
      // Check that it includes workflow tools
      const workflowTools = definitions.filter(def => 
        ['list_workflows', 'create_workflow', 'get_workflow'].includes(def.name)
      );
      expect(workflowTools.length).toBeGreaterThan(0);

      // Check that it includes execution tools
      const executionTools = definitions.filter(def => 
        ['list_executions', 'get_execution'].includes(def.name)
      );
      expect(executionTools.length).toBeGreaterThan(0);

      // Check that it includes tag tools
      const tagTools = definitions.filter(def => 
        ['create_tag', 'get_tags'].includes(def.name)
      );
      expect(tagTools.length).toBeGreaterThan(0);
    });

    it('should include proper tool schema properties', () => {
      const definitions = registry.getToolDefinitions();
      
      definitions.forEach(def => {
        expect(def).toHaveProperty('name');
        expect(def).toHaveProperty('description');
        expect(def).toHaveProperty('inputSchema');
        expect(typeof def.name).toBe('string');
        expect(typeof def.description).toBe('string');
        expect(typeof def.inputSchema).toBe('object');
      });
    });
  });

  describe('handleToolCall', () => {
    it('should route workflow tools to WorkflowToolHandler', async () => {
      const mockResponse = {
        content: [{ type: 'text', text: 'Success' }]
      };
      mockWorkflowHandler.handleTool.mockResolvedValue(mockResponse);

      const result = await registry.handleToolCall('list_workflows', {}, context);
      
      expect(mockWorkflowHandler.handleTool).toHaveBeenCalledWith('list_workflows', {}, context);
      expect(result).toBe(mockResponse);
    });

    it('should route execution tools to ExecutionToolHandler', async () => {
      const mockResponse = {
        content: [{ type: 'text', text: 'Execution data' }]
      };
      mockExecutionHandler.handleTool.mockResolvedValue(mockResponse);

      const result = await registry.handleToolCall('list_executions', {}, context);
      
      expect(mockExecutionHandler.handleTool).toHaveBeenCalledWith('list_executions', {}, context);
      expect(result).toBe(mockResponse);
    });

    it('should route tag tools to TagToolHandler', async () => {
      const mockResponse = {
        content: [{ type: 'text', text: 'Tag data' }]
      };
      mockTagHandler.handleTool.mockResolvedValue(mockResponse);

      const result = await registry.handleToolCall('create_tag', { name: 'test' }, context);
      
      expect(mockTagHandler.handleTool).toHaveBeenCalledWith('create_tag', { name: 'test' }, context);
      expect(result).toBe(mockResponse);
    });

    it('should throw error for unsupported tools', async () => {
      await expect(
        registry.handleToolCall('unsupported_tool', {}, context)
      ).rejects.toThrow(McpError);
    });

    it('should handle handler errors gracefully', async () => {
      mockWorkflowHandler.handleTool.mockRejectedValue(new Error('Handler error'));

      const result = await registry.handleToolCall('list_workflows', {}, context);
      
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Error:');
    });

    it('should preserve McpError instances', async () => {
      const mcpError = new McpError(ErrorCode.InvalidParams, 'Invalid parameters');
      mockWorkflowHandler.handleTool.mockRejectedValue(mcpError);

      await expect(
        registry.handleToolCall('create_workflow', {}, context)
      ).rejects.toThrow(McpError);
    });

    it('should handle tools with complex arguments', async () => {
      const complexArgs = {
        name: 'Test Workflow',
        nodes: [
          {
            name: 'Start',
            type: 'n8n-nodes-base.manualTrigger',
            position: [100, 100],
            parameters: {}
          }
        ],
        connections: [],
        instance: 'production'
      };

      const mockResponse = {
        content: [{ type: 'text', text: 'Workflow created' }]
      };
      mockWorkflowHandler.handleTool.mockResolvedValue(mockResponse);

      const result = await registry.handleToolCall('create_workflow', complexArgs, context);
      
      expect(mockWorkflowHandler.handleTool).toHaveBeenCalledWith('create_workflow', complexArgs, context);
      expect(result).toBe(mockResponse);
    });
  });

  describe('getAllTools', () => {
    it('should return all supported tool names', () => {
      const allTools = registry.getAllTools();
      const toolNames = allTools.map(tool => tool.name);
      
      // Should include tools from all handlers
      expect(toolNames).toContain('list_workflows');
      expect(toolNames).toContain('create_workflow');
      expect(toolNames).toContain('list_executions');
      expect(toolNames).toContain('get_execution');
      expect(toolNames).toContain('create_tag');
      expect(toolNames).toContain('get_tags');
    });

    it('should not have duplicate tool names', () => {
      const allTools = registry.getAllTools();
      const toolNames = allTools.map(tool => tool.name);
      const uniqueTools = [...new Set(toolNames)];
      
      expect(toolNames.length).toBe(uniqueTools.length);
    });

    it('should include handler information', () => {
      const allTools = registry.getAllTools();
      
      allTools.forEach(tool => {
        expect(tool).toHaveProperty('name');
        expect(tool).toHaveProperty('handler');
        expect(typeof tool.name).toBe('string');
        expect(typeof tool.handler).toBe('string');
      });
    });
  });
});