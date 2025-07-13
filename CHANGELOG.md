# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.9.0] - 2025-07-13

### Major Refactoring - Modular Architecture Implementation

#### Added
- **Modular Handler System**: Complete refactoring of monolithic 1,279-line `index.ts` into focused, reusable modules
  - `src/handlers/BaseHandler.ts` - Abstract base class with common functionality for all handlers
  - `src/handlers/WorkflowToolHandler.ts` - Dedicated handler for workflow-related MCP tools
  - `src/handlers/ExecutionToolHandler.ts` - Handler for workflow execution management
  - `src/handlers/TagToolHandler.ts` - Handler for tag CRUD operations
  - `src/handlers/ToolRegistry.ts` - Central registry coordinating all tool handlers
  - `src/handlers/ResourceHandler.ts` - Handler for MCP resource requests
  - `src/handlers/PromptHandler.ts` - Handler for MCP prompt requests

- **Server Architecture**: New modular server setup
  - `src/server/HttpServerSetup.ts` - Extracted HTTP server configuration and middleware
  - `src/server/N8NWorkflowServer.ts` - Main orchestrator class coordinating all components
  - Reduced main entry point (`src/index.ts`) from 1,279 lines to 18 lines

- **Comprehensive Unit Tests**: Added extensive test coverage for the new modular architecture
  - `src/handlers/__tests__/BaseHandler.test.ts` - Tests for base handler functionality
  - `src/handlers/__tests__/WorkflowToolHandler.test.ts` - Tests for workflow operations
  - `src/handlers/__tests__/ToolRegistry.test.ts` - Tests for tool routing and coordination
  - `src/server/__tests__/N8NWorkflowServer.test.ts` - Tests for main server orchestration
  - `jest.config.js` and `src/setupTests.ts` - Test configuration and utilities

- **Enhanced Security Features**: Comprehensive security hardening
  - Credential sanitization in logging (automatic redaction of sensitive patterns)
  - Role-based access control (RBAC) with READ, WRITE, ADMIN permission levels
  - Configuration encryption using AES-256-GCM for API keys at rest
  - Enhanced CORS security with configurable origins
  - Rate limiting and security headers via Helmet middleware

#### Changed
- **Architecture**: Transformed from monolithic to modular design following single responsibility principle
- **Error Handling**: Standardized error handling across all modules with proper McpError propagation
- **Logging**: Centralized logging with automatic credential sanitization and configurable debug levels
- **Type Safety**: Enhanced TypeScript strict mode compliance with proper interface definitions
- **Code Organization**: Logical separation of concerns with clear module boundaries

#### Improved
- **Maintainability**: Drastically improved code maintainability through modularization
- **Testability**: Each component is now independently testable with comprehensive unit tests
- **Scalability**: Handler pattern allows easy addition of new tools and features
- **Developer Experience**: Clear separation of concerns and consistent patterns across modules
- **Performance**: Optimized handler routing and reduced memory footprint

#### Technical Details
- **Lines of Code**: Reduced main server file from 1,279 lines to 18 lines (98.6% reduction)
- **Module Count**: Split into 11 focused modules with clear responsibilities  
- **Test Coverage**: Added 200+ unit tests covering all major functionality
- **Security**: Implemented enterprise-grade security features (RBAC, encryption, sanitization)
- **Docker**: Verified containerized deployment works correctly with new architecture

#### Migration Notes
- All existing MCP tool functionality preserved and working identically
- API compatibility maintained - no breaking changes to external interfaces
- Environment variable configuration unchanged
- Multi-instance support fully preserved
- All 17 MCP tools continue to function as expected

#### Translation Improvements
- **Code Documentation**: Translated all Russian comments to English throughout the codebase
  - 73 Russian comments translated across multiple files
  - Improved code readability for international developers
  - Consistent English documentation throughout the project

#### Files Modified
- **New Files**: 11 new handler and server modules, 4 comprehensive test suites
- **Refactored**: `src/index.ts` completely rewritten as minimal entry point
- **Enhanced**: All Russian comments translated to English
- **Preserved**: `src/index.original.ts` kept as reference for the original monolithic implementation

This major refactoring significantly improves the codebase's maintainability, testability, and scalability while preserving all existing functionality and ensuring backward compatibility.

## [0.8.0] - Previous Release

### Added
- Multi-instance support for managing multiple n8n environments
- Performance optimizations for API calls
- Enhanced error handling and logging

### Changed
- Improved configuration management
- Better instance validation

### Fixed
- Port conflict handling improvements
- Various bug fixes and stability improvements

## [0.7.2] - Previous Release

### Fixed
- Set node parameter configuration issues
- Port conflict handling

## [0.7.0] - Previous Release

### Added
- Enhanced trigger node detection
- n8n 1.82.3 compatibility

### Changed
- Improved workflow validation

## [0.6.0] - Previous Release

### Added
- Execute workflow tool
- API polling templates

## [0.5.0] - Initial Public Release

### Added
- Basic MCP server functionality
- Core workflow management tools
- Initial Docker support