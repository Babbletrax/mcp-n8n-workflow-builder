#!/bin/bash
echo "Testing n8n MCP server in Docker..."

# Test health endpoint
echo -e "\n1. Testing health endpoint:"
curl -s http://localhost:3456/health | jq .

# Test MCP POST endpoint
echo -e "\n2. Testing MCP POST endpoint:"
curl -s -X POST http://localhost:3456/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"0.1.0"}},"id":0}' | jq .

# Test SSE endpoint
echo -e "\n3. Testing SSE endpoint:"
curl -s -N -H "Accept: text/event-stream" http://localhost:3456/mcp &
SSE_PID=$!
sleep 2
kill $SSE_PID 2>/dev/null

echo -e "\nTest complete!"