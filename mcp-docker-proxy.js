#!/usr/bin/env node
const { spawn } = require('child_process');
const readline = require('readline');

// Create interface for reading from stdin
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: false
});

// Spawn docker exec to connect to the running container
const docker = spawn('docker', [
  'exec',
  '-i',
  'n8n-mcp-server',
  'node',
  'build/index.js'
], {
  stdio: ['pipe', 'pipe', 'pipe']
});

// Forward stdin to docker
rl.on('line', (line) => {
  docker.stdin.write(line + '\n');
});

// Forward docker output to stdout
docker.stdout.on('data', (data) => {
  process.stdout.write(data);
});

// Forward docker errors to stderr
docker.stderr.on('data', (data) => {
  process.stderr.write(data);
});

// Handle docker process exit
docker.on('exit', (code) => {
  process.exit(code);
});

// Handle errors
docker.on('error', (err) => {
  console.error('Failed to start docker process:', err);
  process.exit(1);
});

// Clean up on exit
process.on('SIGINT', () => {
  docker.kill();
  process.exit();
});