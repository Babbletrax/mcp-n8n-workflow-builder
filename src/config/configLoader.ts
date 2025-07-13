import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { Config, MultiInstanceConfig, N8NInstance } from '../types/config';
import { validateConfig, validateEnvironmentVariables, sanitizeConfigForLogging } from '../utils/configValidation';
import { isConfigEncrypted, decryptConfig, getEncryptionPassword } from '../utils/configEncryption';

export class ConfigLoader {
  private static instance: ConfigLoader;
  private config: MultiInstanceConfig | null = null;

  private constructor() {}

  public static getInstance(): ConfigLoader {
    if (!ConfigLoader.instance) {
      ConfigLoader.instance = new ConfigLoader();
    }
    return ConfigLoader.instance;
  }

  /**
   * Load configuration from .config.json or .env (fallback)
   */
  public loadConfig(): MultiInstanceConfig {
    if (this.config) {
      return this.config;
    }

    // Use stderr for debug logging to avoid interfering with MCP JSON-RPC protocol
    if (process.env.DEBUG === 'true') {
      console.error(`[ConfigLoader] Current working directory: ${process.cwd()}`);
      console.error(`[ConfigLoader] Script directory: ${__dirname}`);
    }

    // Try to load .config.json first
    // Look in both current working directory and project root (relative to this file)
    const configPaths = [
      path.join(process.cwd(), '.config.json'),
      path.join(__dirname, '../../.config.json'), // Relative to build/config/configLoader.js
      path.join(__dirname, '../../../.config.json') // In case of different build structure
    ];
    
    for (const configJsonPath of configPaths) {
      if (process.env.DEBUG === 'true') {
        console.error(`[ConfigLoader] Checking for config at: ${configJsonPath}`);
      }
      if (fs.existsSync(configJsonPath)) {
        if (process.env.DEBUG === 'true') {
          console.error(`[ConfigLoader] Loading config from: ${configJsonPath}`);
        }
        this.config = this.loadFromJson(configJsonPath);
        return this.config;
      }
    }

    // Fallback to .env for backward compatibility
    if (process.env.DEBUG === 'true') {
      console.error(`[ConfigLoader] No .config.json found, falling back to .env`);
    }
    this.config = this.loadFromEnv();
    return this.config;
  }

  /**
   * Load configuration from .config.json (supports encrypted configs)
   */
  private loadFromJson(configPath: string): MultiInstanceConfig {
    try {
      // Check file permissions and size
      const stats = fs.statSync(configPath);
      if (stats.size > 1024 * 1024) { // 1MB limit
        throw new Error('Configuration file is too large (max 1MB)');
      }

      const configData = fs.readFileSync(configPath, 'utf8');
      let parsedConfig: Config;

      // Check if config is encrypted
      if (isConfigEncrypted(configPath)) {
        if (process.env.DEBUG === 'true') {
          console.error(`[ConfigLoader] Decrypting encrypted configuration from: ${configPath}`);
        }
        
        const encryptionPassword = getEncryptionPassword();
        parsedConfig = decryptConfig(configData, encryptionPassword);
        
        if (process.env.DEBUG === 'true') {
          console.error(`[ConfigLoader] Successfully decrypted configuration`);
        }
      } else {
        // Plaintext configuration
        parsedConfig = JSON.parse(configData);
        
        if (process.env.NODE_ENV === 'production') {
          console.warn(`[ConfigLoader] WARNING: Configuration file is not encrypted in production environment`);
        }
      }

      // Use comprehensive validation
      const validatedConfig = validateConfig(parsedConfig);

      if (process.env.NODE_ENV === 'development' && process.env.DEBUG === 'true') {
        console.error(`[ConfigLoader] Loaded and validated config: ${JSON.stringify(sanitizeConfigForLogging(validatedConfig), null, 2)}`);
      }

      return validatedConfig;
    } catch (error) {
      if (error instanceof SyntaxError) {
        throw new Error(`Invalid JSON format in .config.json: ${error.message}`);
      }
      if (error instanceof Error && error.message?.includes('decryption failed')) {
        throw new Error(`Configuration decryption failed. Please check CONFIG_ENCRYPTION_PASSWORD environment variable.`);
      }
      throw new Error(`Configuration error: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Load configuration from .env (backward compatibility)
   */
  private loadFromEnv(): MultiInstanceConfig {
    // Load .env file from multiple possible locations
    const envPaths = [
      path.join(process.cwd(), '.env'),
      path.join(__dirname, '../../.env'), // Relative to build/config/configLoader.js
    ];
    
    for (const envPath of envPaths) {
      if (fs.existsSync(envPath)) {
        // Check file size for security
        const stats = fs.statSync(envPath);
        if (stats.size > 1024 * 1024) { // 1MB limit
          throw new Error('.env file is too large (max 1MB)');
        }
        
        if (process.env.NODE_ENV === 'development' && process.env.DEBUG === 'true') {
          console.error(`Loading .env from: ${envPath}`);
        }
        dotenv.config({ path: envPath });
        break;
      }
    }

    // Validate environment variables
    const { n8nHost, n8nApiKey } = validateEnvironmentVariables();

    // Create single instance configuration for backward compatibility
    const config: MultiInstanceConfig = {
      environments: {
        'default': {
          n8n_host: n8nHost,
          n8n_api_key: n8nApiKey
        }
      },
      defaultEnv: 'default'
    };

    if (process.env.NODE_ENV === 'development' && process.env.DEBUG === 'true') {
      console.error(`[ConfigLoader] Loaded and validated .env config: ${JSON.stringify(sanitizeConfigForLogging(config), null, 2)}`);
    }

    return config;
  }

  /**
   * Get configuration for a specific environment
   */
  public getEnvironmentConfig(instanceSlug?: string): N8NInstance {
    const config = this.loadConfig();
    const targetEnv = instanceSlug || config.defaultEnv;

    if (!config.environments[targetEnv]) {
      throw new Error(`Environment '${targetEnv}' not found. Available environments: ${Object.keys(config.environments).join(', ')}`);
    }

    return config.environments[targetEnv];
  }

  /**
   * Get list of available environments
   */
  public getAvailableEnvironments(): string[] {
    const config = this.loadConfig();
    return Object.keys(config.environments);
  }

  /**
   * Get default environment name
   */
  public getDefaultEnvironment(): string {
    const config = this.loadConfig();
    return config.defaultEnv;
  }
}