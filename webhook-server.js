#!/usr/bin/env node

const http = require('http');
const { spawn } = require('child_process');

const PORT = process.env.WEBHOOK_PORT || 3001;
const SYNC_TOKEN = process.env.SYNC_TOKEN;

console.log(`Starting webhook server on port ${PORT}`);
console.log(`Sync token configured: ${SYNC_TOKEN ? 'Yes' : 'No'}`);

const server = http.createServer(async (req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  if (req.method === 'POST' && req.url === '/webhook/sync') {
    try {
      // Check authorization
      const authHeader = req.headers.authorization;
      if (SYNC_TOKEN && (!authHeader || !authHeader.includes(SYNC_TOKEN))) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Unauthorized' }));
        return;
      }

      // Parse request body
      let body = '';
      req.on('data', chunk => {
        body += chunk.toString();
      });

      req.on('end', () => {
        try {
          const data = JSON.parse(body);
          console.log(`Webhook triggered by ${data.trigger} at ${data.timestamp}`);
          
          // Run sync script
          console.log('Starting vault sync...');
          const syncProcess = spawn('npm', ['run', 'sync:prod'], {
            cwd: __dirname,
            stdio: 'inherit',
            env: { ...process.env }
          });

          syncProcess.on('close', (code) => {
            if (code === 0) {
              console.log('Sync completed successfully');
            } else {
              console.error(`Sync failed with code ${code}`);
            }
          });

          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ 
            message: 'Sync triggered successfully',
            timestamp: new Date().toISOString()
          }));

        } catch (error) {
          console.error('Error parsing webhook body:', error);
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Invalid JSON' }));
        }
      });

    } catch (error) {
      console.error('Webhook error:', error);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Internal server error' }));
    }
  } else if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ 
      status: 'healthy',
      timestamp: new Date().toISOString(),
      port: PORT
    }));
  } else {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
  }
});

server.listen(PORT, () => {
  console.log(`Webhook server listening on http://localhost:${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
  console.log(`Webhook endpoint: http://localhost:${PORT}/webhook/sync`);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\nShutting down webhook server...');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});