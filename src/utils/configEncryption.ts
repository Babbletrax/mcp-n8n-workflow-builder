/**
 * Configuration encryption utilities for protecting API keys at rest
 */

import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const TAG_LENGTH = 16;
const KEY_LENGTH = 32;

/**
 * Derives encryption key from password using PBKDF2
 */
function deriveKey(password: string, salt: Buffer): Buffer {
  return crypto.pbkdf2Sync(password, salt, 100000, KEY_LENGTH, 'sha256');
}

/**
 * Encrypts a configuration object
 */
export function encryptConfig(config: any, password: string): string {
  try {
    const salt = crypto.randomBytes(16);
    const iv = crypto.randomBytes(IV_LENGTH);
    const key = deriveKey(password, salt);
    
    const cipher = crypto.createCipher(ALGORITHM, key);
    cipher.setAAD(salt); // Additional authenticated data
    
    const plaintext = JSON.stringify(config);
    let encrypted = cipher.update(plaintext, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    const tag = cipher.getAuthTag();
    
    // Combine salt + iv + tag + encrypted data
    const result = {
      salt: salt.toString('hex'),
      iv: iv.toString('hex'),
      tag: tag.toString('hex'),
      data: encrypted
    };
    
    return JSON.stringify(result);
  } catch (error) {
    throw new Error(`Configuration encryption failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Decrypts a configuration object
 */
export function decryptConfig(encryptedConfig: string, password: string): any {
  try {
    const parsed = JSON.parse(encryptedConfig);
    const { salt, iv, tag, data } = parsed;
    
    const saltBuffer = Buffer.from(salt, 'hex');
    const ivBuffer = Buffer.from(iv, 'hex');
    const tagBuffer = Buffer.from(tag, 'hex');
    const key = deriveKey(password, saltBuffer);
    
    const decipher = crypto.createDecipher(ALGORITHM, key);
    decipher.setAAD(saltBuffer);
    decipher.setAuthTag(tagBuffer);
    
    let decrypted = decipher.update(data, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return JSON.parse(decrypted);
  } catch (error) {
    throw new Error(`Configuration decryption failed: ${error instanceof Error ? error.message : 'Invalid password or corrupted data'}`);
  }
}

/**
 * Encrypts a configuration file
 */
export function encryptConfigFile(inputPath: string, outputPath: string, password: string): void {
  try {
    if (!fs.existsSync(inputPath)) {
      throw new Error(`Input file does not exist: ${inputPath}`);
    }
    
    const configData = fs.readFileSync(inputPath, 'utf8');
    const config = JSON.parse(configData);
    
    const encrypted = encryptConfig(config, password);
    
    // Ensure output directory exists
    const outputDir = path.dirname(outputPath);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    
    fs.writeFileSync(outputPath, encrypted, 'utf8');
    
    // Set restrictive permissions (600 = rw-------)
    fs.chmodSync(outputPath, 0o600);
    
    console.log(`Configuration encrypted and saved to: ${outputPath}`);
  } catch (error) {
    throw new Error(`Failed to encrypt config file: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Decrypts a configuration file
 */
export function decryptConfigFile(inputPath: string, password: string): any {
  try {
    if (!fs.existsSync(inputPath)) {
      throw new Error(`Encrypted config file does not exist: ${inputPath}`);
    }
    
    const encryptedData = fs.readFileSync(inputPath, 'utf8');
    return decryptConfig(encryptedData, password);
  } catch (error) {
    throw new Error(`Failed to decrypt config file: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Checks if a file appears to be encrypted
 */
export function isConfigEncrypted(configPath: string): boolean {
  try {
    if (!fs.existsSync(configPath)) {
      return false;
    }
    
    const content = fs.readFileSync(configPath, 'utf8');
    const parsed = JSON.parse(content);
    
    // Check if it has the structure of an encrypted config
    return !!(parsed.salt && parsed.iv && parsed.tag && parsed.data);
  } catch {
    return false;
  }
}

/**
 * Gets encryption password from environment variable or prompts user
 */
export function getEncryptionPassword(): string {
  const envPassword = process.env.CONFIG_ENCRYPTION_PASSWORD;
  
  if (envPassword) {
    return envPassword;
  }
  
  if (process.env.NODE_ENV === 'production') {
    throw new Error('CONFIG_ENCRYPTION_PASSWORD environment variable must be set in production');
  }
  
  // In development, return a default password (not secure, but for development only)
  console.warn('WARNING: Using default encryption password for development. Set CONFIG_ENCRYPTION_PASSWORD in production.');
  return 'dev-default-password-change-in-production';
}

/**
 * Migrates an existing plaintext config to encrypted format
 */
export function migrateToEncryptedConfig(configPath: string, password?: string): void {
  try {
    if (!fs.existsSync(configPath)) {
      throw new Error(`Config file does not exist: ${configPath}`);
    }
    
    if (isConfigEncrypted(configPath)) {
      console.log('Configuration is already encrypted.');
      return;
    }
    
    const encryptionPassword = password || getEncryptionPassword();
    const backupPath = `${configPath}.backup`;
    
    // Create backup
    fs.copyFileSync(configPath, backupPath);
    console.log(`Backup created: ${backupPath}`);
    
    // Encrypt the config
    const encryptedPath = `${configPath}.encrypted`;
    encryptConfigFile(configPath, encryptedPath, encryptionPassword);
    
    // Replace original with encrypted version
    fs.renameSync(encryptedPath, configPath);
    
    console.log('Configuration successfully encrypted. Original backed up.');
    console.log('IMPORTANT: Store the encryption password securely and set CONFIG_ENCRYPTION_PASSWORD environment variable.');
  } catch (error) {
    throw new Error(`Migration failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * CLI helper for encryption operations
 */
export function runEncryptionCLI(): void {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.log(`
Usage:
  npm run encrypt-config <config-path> [password]
  
  CONFIG_ENCRYPTION_PASSWORD=your-password npm run encrypt-config <config-path>
  
Examples:
  npm run encrypt-config .config.json
  CONFIG_ENCRYPTION_PASSWORD=mysecret npm run encrypt-config .config.json
    `);
    return;
  }
  
  const configPath = args[0];
  const password = args[1] || getEncryptionPassword();
  
  try {
    migrateToEncryptedConfig(configPath, password);
  } catch (error) {
    console.error('Encryption failed:', error instanceof Error ? error.message : 'Unknown error');
    process.exit(1);
  }
}

// Run CLI if this file is executed directly
if (require.main === module) {
  runEncryptionCLI();
}