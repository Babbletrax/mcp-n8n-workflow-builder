/**
 * Jest setup file for common test configurations
 */
export {}; // Make this file a module

// Mock console methods to reduce noise in tests
const originalConsoleError = console.error;
const originalConsoleWarn = console.warn;
const originalConsoleLog = console.log;

beforeEach(() => {
  // Suppress console output during tests unless explicitly needed
  jest.spyOn(console, 'error').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => {
  // Restore console methods after each test
  jest.restoreAllMocks();
});

// Declare global test utilities
declare global {
  var testUtils: {
    enableConsole: () => void;
    suppressConsole: () => void;
  };
}

// Global test utilities
(global as any).testUtils = {
  enableConsole: () => {
    console.error = originalConsoleError;
    console.warn = originalConsoleWarn;
    console.log = originalConsoleLog;
  },
  
  suppressConsole: () => {
    console.error = jest.fn();
    console.warn = jest.fn();
    console.log = jest.fn();
  }
};

// Mock environment variables for consistent testing
process.env.NODE_ENV = 'test';
process.env.DEBUG = 'false';

// Mock process.exit to prevent tests from exiting
jest.spyOn(process, 'exit').mockImplementation((code?: string | number | null | undefined) => {
  throw new Error(`Process exit called with code: ${code}`);
});