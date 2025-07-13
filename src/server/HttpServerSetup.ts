/**
 * HTTP Server setup and middleware configuration
 */

import express, { Request, Response, Application } from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import cors from 'cors';
import * as http from 'http';
import { BaseHandler } from '../handlers/BaseHandler';
import { createRateLimitMessage } from '../utils/validation';
import { sanitizeForLogging } from '../utils/logger';

export interface HttpServerConfig {
  port: number;
  isProduction: boolean;
  isDevelopment: boolean;
  corsAllowedOrigins?: string[];
  corsDevOrigins?: string[];
  rateLimitMax?: number;
  rateLimitWindowMs?: number;
}

export class HttpServerSetup extends BaseHandler {
  private app: Application;
  private httpServer: http.Server | null = null;
  private config: HttpServerConfig;

  constructor(config: HttpServerConfig, isDebugMode: boolean = false) {
    super(isDebugMode);
    this.config = config;
    this.app = express();
    this.setupMiddleware();
    this.setupRoutes();
  }

  private setupMiddleware(): void {
    // Security headers
    this.app.use(helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", "data:", "https:"],
        },
      },
      hsts: {
        maxAge: 31536000,
        includeSubDomains: true,
        preload: true
      }
    }));

    // Rate limiting
    const limiter = rateLimit({
      windowMs: this.config.rateLimitWindowMs || 15 * 60 * 1000, // 15 minutes
      max: this.config.rateLimitMax || (this.config.isProduction ? 100 : 1000),
      message: createRateLimitMessage(),
      standardHeaders: true,
      legacyHeaders: false,
      handler: (req, res) => {
        this.log('warn', `Rate limit exceeded for IP: ${req.ip}`);
        res.status(429).json({
          error: 'Too Many Requests',
          message: createRateLimitMessage(Math.ceil((this.config.rateLimitWindowMs || 15 * 60 * 1000) / 1000)),
          retryAfter: Math.ceil((this.config.rateLimitWindowMs || 15 * 60 * 1000) / 1000)
        });
      }
    });
    this.app.use(limiter);

    // Enhanced CORS configuration with security controls
    const allowedOrigins = this.config.isProduction
      ? [
          'https://claude.ai',
          'https://www.cursor.com',
          ...(this.config.corsAllowedOrigins || [])
        ]
      : [
          'http://localhost:3000',
          'http://localhost:3001',
          'http://127.0.0.1:3000',
          'http://127.0.0.1:3001',
          ...(this.config.corsDevOrigins || [])
        ];

    this.app.use(cors({
      origin: (origin, callback) => {
        // Allow requests with no origin (like mobile apps or curl requests) in development
        if (!origin && !this.config.isProduction) {
          return callback(null, true);
        }
        
        if (!origin || allowedOrigins.includes(origin)) {
          callback(null, true);
        } else {
          this.log('warn', 'CORS blocked request from unauthorized origin', { 
            origin, 
            allowedOrigins: sanitizeForLogging(allowedOrigins),
            userAgent: 'request-header-hidden-for-security'
          });
          callback(new Error('Not allowed by CORS policy'));
        }
      },
      credentials: false, // Keep disabled for security
      optionsSuccessStatus: 200,
      maxAge: 86400, // Cache preflight for 24 hours
      allowedHeaders: [
        'Content-Type',
        'Authorization',
        'X-Requested-With',
        'Accept',
        'Cache-Control'
      ],
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      exposedHeaders: ['X-RateLimit-Remaining', 'X-RateLimit-Reset']
    }));

    // Body parsing with size limits
    this.app.use(express.json({ 
      limit: '10mb', // Reduced from 50mb for security
      strict: true
    }));
  }

  private setupRoutes(): void {
    // Health check endpoint
    this.app.get('/health', (req: Request, res: Response) => {
      res.json({ 
        status: 'ok', 
        message: 'MCP server is running',
        version: '0.9.0',
        timestamp: new Date().toISOString(),
        endpoints: {
          http: '/mcp (POST)',
          sse: '/mcp (GET)',
          health: '/health (GET)'
        }
      });
    });

    // Test SSE endpoint
    this.app.get('/sse-test', (req: Request, res: Response) => {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('Access-Control-Allow-Origin', '*');

      res.write('event: test\n');
      res.write('data: {"message": "SSE endpoint is working", "timestamp": "' + new Date().toISOString() + '"}\n\n');

      setTimeout(() => {
        res.write('event: test\n');
        res.write('data: {"message": "Second test message", "timestamp": "' + new Date().toISOString() + '"}\n\n');
        res.end();
      }, 1000);
    });
  }

  /**
   * Adds MCP request handler
   */
  addMcpHandler(handler: (req: Request, res: Response) => void): void {
    this.app.post('/mcp', handler);
  }

  /**
   * Adds SSE endpoint for MCP
   */
  addMcpSseHandler(handler: (req: Request, res: Response) => void): void {
    this.app.get('/mcp', (req: Request, res: Response) => {
      // Set SSE headers
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Headers', 'Cache-Control');

      // Send initial connection event
      res.write('event: connected\n');
      res.write('data: {"type":"connected"}\n\n');

      // Handle incoming SSE requests
      handler(req, res);

      // Handle client disconnect
      req.on('close', () => {
        this.log('debug', 'SSE client disconnected');
        res.end();
      });

      req.on('aborted', () => {
        this.log('debug', 'SSE connection aborted');
        res.end();
      });
    });
  }

  /**
   * Starts the HTTP server
   */
  async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.httpServer = http.createServer(this.app);

        this.httpServer.on('error', (error: NodeJS.ErrnoException) => {
          if (error.code === 'EADDRINUSE') {
            this.log('info', `Port ${this.config.port} is already in use. Assuming another instance is already running.`);
            // Resolve for graceful handling
            resolve();
          } else {
            this.log('error', `HTTP server error: ${error.message}`);
            reject(error);
          }
        });

        this.httpServer.listen(this.config.port, () => {
          this.log('info', `MCP HTTP server listening on port ${this.config.port}`);
          resolve();
        });
      } catch (error) {
        this.log('error', `Failed to start HTTP server: ${error instanceof Error ? error.message : String(error)}`);
        reject(error);
      }
    });
  }

  /**
   * Stops the HTTP server
   */
  async stop(): Promise<void> {
    if (this.httpServer) {
      return new Promise((resolve) => {
        this.httpServer!.close(() => {
          this.log('info', 'HTTP server stopped');
          resolve();
        });
      });
    }
  }

  /**
   * Gets the Express app instance for additional configuration
   */
  getApp(): Application {
    return this.app;
  }
}