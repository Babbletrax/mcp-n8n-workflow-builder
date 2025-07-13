/// <reference types="jest" />

/**
 * Unit tests for WorkflowToolHandler class
 */

import { WorkflowToolHandler } from '../WorkflowToolHandler';
import { N8NApiWrapper } from '../../services/n8nApiWrapper';
import { HandlerContext, ToolCallResult } from '../BaseHandler';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { WorkflowInput } from '../../types/workflow';

// Mock the N8NApiWrapper
jest.mock('../../services/n8nApiWrapper');
jest.mock('../../utils/validation');

const mockN8NApiWrapper = N8NApiWrapper as jest.MockedClass<typeof N8NApiWrapper>;

describe('WorkflowToolHandler', () => {
  let handler: WorkflowToolHandler;
  let mockWrapper: jest.Mocked<N8NApiWrapper>;
  let context: HandlerContext;

  beforeEach(() => {
    mockWrapper = new mockN8NApiWrapper() as jest.Mocked<N8NApiWrapper>;
    handler = new WorkflowToolHandler(mockWrapper, false);
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

  describe('getSupportedTools', () => {
    it('should return all supported workflow tools', () => {
      const tools = handler.getSupportedTools();
      expect(tools).toEqual([
        'list_workflows',
        'create_workflow',
        'get_workflow',
        'update_workflow',
        'delete_workflow',
        'activate_workflow',
        'deactivate_workflow',
        'execute_workflow'
      ]);
    });
  });

  describe('handleTool', () => {
    it('should throw error for unsupported tool', async () => {
      await expect(
        handler.handleTool('unsupported_tool', {}, context)
      ).rejects.toThrow(McpError);
    });

    it('should handle errors and return error response', async () => {
      mockWrapper.listWorkflows.mockRejectedValue(new Error('API Error'));
      
      const result = await handler.handleTool('list_workflows', {}, context);
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Error:');
    });
  });

  describe('list_workflows', () => {
    it('should list workflows successfully', async () => {
      const mockWorkflows = [
        { 
          id: '1', 
          name: 'Workflow 1', 
          active: true,
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-01T00:00:00.000Z'
        },
        { 
          id: '2', 
          name: 'Workflow 2', 
          active: false,
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-01T00:00:00.000Z'
        }
      ];
      mockWrapper.listWorkflows.mockResolvedValue(mockWorkflows);

      const result = await handler.handleTool('list_workflows', {}, context);
      
      expect(mockWrapper.listWorkflows).toHaveBeenCalledWith(undefined);
      expect(result.content[0].text).toContain('Workflow 1');
      expect(result.content[0].text).toContain('Workflow 2');
    });

    it('should list workflows with specific instance', async () => {
      const mockWorkflows = [{ 
        id: '1', 
        name: 'Test Workflow', 
        active: true,
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z'
      }];
      mockWrapper.listWorkflows.mockResolvedValue(mockWorkflows);

      await handler.handleTool('list_workflows', { instance: 'production' }, context);
      
      expect(mockWrapper.listWorkflows).toHaveBeenCalledWith('production');
    });

    it('should handle API errors', async () => {
      mockWrapper.listWorkflows.mockRejectedValue(new Error('N8N API Error'));

      await expect(
        handler.handleTool('list_workflows', {}, context)
      ).rejects.toThrow(McpError);
    });
  });

  describe('create_workflow', () => {
    const validWorkflowInput: WorkflowInput = {
      name: 'Test Workflow',
      nodes: [
        {
          name: 'Start',
          type: 'n8n-nodes-base.manualTrigger',
          position: [100, 100],
          parameters: {}
        }
      ],
      connections: []
    };

    it('should create workflow successfully', async () => {
      const mockCreatedWorkflow = { 
        id: '123', 
        name: 'Test Workflow',
        nodes: validWorkflowInput.nodes,
        connections: validWorkflowInput.connections,
        active: true,
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z'
      };
      mockWrapper.createWorkflow.mockResolvedValue(mockCreatedWorkflow);

      // Mock validation to return the input as valid
      const mockValidateWorkflowInput = require('../../utils/validation').validateWorkflowInput;
      mockValidateWorkflowInput.mockReturnValue(validWorkflowInput);

      const result = await handler.handleTool('create_workflow', validWorkflowInput, context);
      
      expect(mockWrapper.createWorkflow).toHaveBeenCalledWith(validWorkflowInput, undefined);
      expect(result.content[0].text).toContain('Test Workflow');
    });

    it('should create workflow with specific instance', async () => {
      const mockCreatedWorkflow = { 
        id: '123', 
        name: 'Test Workflow',
        nodes: validWorkflowInput.nodes,
        connections: validWorkflowInput.connections,
        active: true,
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z'
      };
      mockWrapper.createWorkflow.mockResolvedValue(mockCreatedWorkflow);

      const mockValidateWorkflowInput = require('../../utils/validation').validateWorkflowInput;
      mockValidateWorkflowInput.mockReturnValue(validWorkflowInput);

      await handler.handleTool('create_workflow', { 
        ...validWorkflowInput, 
        instance: 'staging' 
      }, context);
      
      expect(mockWrapper.createWorkflow).toHaveBeenCalledWith(validWorkflowInput, 'staging');
    });

    it('should handle validation errors', async () => {
      const mockValidateWorkflowInput = require('../../utils/validation').validateWorkflowInput;
      mockValidateWorkflowInput.mockImplementation(() => {
        throw new McpError(ErrorCode.InvalidParams, 'Invalid workflow input');
      });

      await expect(
        handler.handleTool('create_workflow', { name: 'Invalid' }, context)
      ).rejects.toThrow(McpError);
    });
  });

  describe('get_workflow', () => {
    it('should get workflow successfully', async () => {
      const mockWorkflow = { 
        id: '123', 
        name: 'Test Workflow', 
        active: true,
        nodes: [],
        connections: {},
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z'
      };
      mockWrapper.getWorkflow.mockResolvedValue(mockWorkflow);

      const mockValidateInput = require('../../utils/validation').validateInput;
      mockValidateInput.mockReturnValue('123');

      const result = await handler.handleTool('get_workflow', { id: '123' }, context);
      
      expect(mockWrapper.getWorkflow).toHaveBeenCalledWith('123', undefined);
      expect(result.content[0].text).toContain('Test Workflow');
    });

    it('should require workflow ID', async () => {
      const result = await handler.handleTool('get_workflow', {}, context);
      expect(result.isError).toBe(true);
    });

    it('should handle workflow not found', async () => {
      mockWrapper.getWorkflow.mockRejectedValue(new Error('Workflow not found'));
      
      const mockValidateInput = require('../../utils/validation').validateInput;
      mockValidateInput.mockReturnValue('999');

      const result = await handler.handleTool('get_workflow', { id: '999' }, context);
      expect(result.isError).toBe(true);
    });
  });

  describe('update_workflow', () => {
    const updateData = {
      id: '123',
      name: 'Updated Workflow',
      nodes: [
        {
          name: 'Start',
          type: 'n8n-nodes-base.manualTrigger',
          position: [100, 100],
          parameters: {}
        }
      ],
      connections: []
    };

    it('should update workflow successfully', async () => {
      const mockUpdatedWorkflow = { 
        ...updateData,
        active: true,
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z'
      };
      mockWrapper.updateWorkflow.mockResolvedValue(mockUpdatedWorkflow);

      const result = await handler.handleTool('update_workflow', updateData, context);
      
      expect(mockWrapper.updateWorkflow).toHaveBeenCalled();
      expect(result.content[0].text).toContain('Updated Workflow');
    });

    it('should handle legacy connection format', async () => {
      const updateDataWithConnections = {
        ...updateData,
        connections: [
          { source: 'Start', target: 'End', sourceOutput: 0, targetInput: 0 }
        ]
      };

      mockWrapper.updateWorkflow.mockResolvedValue({
        ...updateDataWithConnections,
        active: true,
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z'
      });

      const result = await handler.handleTool('update_workflow', updateDataWithConnections, context);
      expect(result.content[0].text).toContain('Updated Workflow');
    });

    it('should require all required fields', async () => {
      const result = await handler.handleTool('update_workflow', { id: '123' }, context);
      expect(result.isError).toBe(true);
    });
  });

  describe('delete_workflow', () => {
    it('should delete workflow successfully', async () => {
      const mockDeleteResult = { success: true, message: 'Workflow deleted' };
      mockWrapper.deleteWorkflow.mockResolvedValue(mockDeleteResult);

      const mockValidateInput = require('../../utils/validation').validateInput;
      mockValidateInput.mockReturnValue('123');

      const result = await handler.handleTool('delete_workflow', { id: '123' }, context);
      
      expect(mockWrapper.deleteWorkflow).toHaveBeenCalledWith('123', undefined);
      expect(result.content[0].text).toContain('success');
    });

    it('should require workflow ID', async () => {
      const result = await handler.handleTool('delete_workflow', {}, context);
      expect(result.isError).toBe(true);
    });
  });

  describe('activate_workflow', () => {
    it('should activate workflow successfully', async () => {
      const mockActivatedWorkflow = { 
        id: '123', 
        name: 'Test Workflow',
        active: true,
        nodes: [],
        connections: {},
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z'
      };
      mockWrapper.activateWorkflow.mockResolvedValue(mockActivatedWorkflow);

      const result = await handler.handleTool('activate_workflow', { id: '123' }, context);
      
      expect(mockWrapper.activateWorkflow).toHaveBeenCalledWith('123', undefined);
      expect(result.content[0].text).toContain('true');
    });

    it('should require workflow ID', async () => {
      const result = await handler.handleTool('activate_workflow', {}, context);
      expect(result.isError).toBe(true);
    });
  });

  describe('deactivate_workflow', () => {
    it('should deactivate workflow successfully', async () => {
      const mockDeactivatedWorkflow = { 
        id: '123',
        name: 'Test Workflow', 
        active: false,
        nodes: [],
        connections: {},
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z'
      };
      mockWrapper.deactivateWorkflow.mockResolvedValue(mockDeactivatedWorkflow);

      const result = await handler.handleTool('deactivate_workflow', { id: '123' }, context);
      
      expect(mockWrapper.deactivateWorkflow).toHaveBeenCalledWith('123', undefined);
      expect(result.content[0].text).toContain('false');
    });

    it('should require workflow ID', async () => {
      const result = await handler.handleTool('deactivate_workflow', {}, context);
      expect(result.isError).toBe(true);
    });
  });

  describe('execute_workflow', () => {
    it('should execute workflow successfully', async () => {
      const mockExecutionResult = { 
        id: 123,
        finished: false,
        mode: 'manual' as const,
        startedAt: new Date().toISOString(),
        stoppedAt: new Date().toISOString(),
        workflowId: 123
      };
      mockWrapper.executeWorkflow.mockResolvedValue(mockExecutionResult);

      const mockValidateInput = require('../../utils/validation').validateInput;
      mockValidateInput.mockReturnValue('123');

      const result = await handler.handleTool('execute_workflow', { 
        id: '123',
        runData: { input: 'test' }
      }, context);
      
      expect(mockWrapper.executeWorkflow).toHaveBeenCalledWith('123', { input: 'test' }, undefined);
      expect(result.content[0].text).toContain('"id": 123');
    });

    it('should execute workflow without runData', async () => {
      const mockExecutionResult = { 
        id: 456,
        finished: false,
        mode: 'manual' as const,
        startedAt: new Date().toISOString(),
        stoppedAt: new Date().toISOString(),
        workflowId: 123
      };
      mockWrapper.executeWorkflow.mockResolvedValue(mockExecutionResult);

      const mockValidateInput = require('../../utils/validation').validateInput;
      mockValidateInput.mockReturnValue('123');

      const result = await handler.handleTool('execute_workflow', { id: '123' }, context);
      
      expect(mockWrapper.executeWorkflow).toHaveBeenCalledWith('123', undefined, undefined);
      expect(result.content[0].text).toContain('"id": 456');
    });

    it('should require workflow ID', async () => {
      const result = await handler.handleTool('execute_workflow', {}, context);
      expect(result.isError).toBe(true);
    });
  });
});
