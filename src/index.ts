#!/usr/bin/env node
/**
 * Main entry point for N8N Workflow MCP Server
 * Refactored modular architecture
 */

import dotenv from 'dotenv';
// Load environment variables from .env file
dotenv.config();

import { N8NWorkflowServer } from './server/N8NWorkflowServer';

// Start the server
const server = new N8NWorkflowServer();
server.run().catch((error) => {
  console.error(`Fatal error starting server: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});