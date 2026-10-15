#!/usr/bin/env node
// jsonlink-mcp
//   stdio (default):  JSONLINK_API_KEY=pk_... npx -y jsonlink-mcp
//   remote HTTP:      jsonlink-mcp --http [--port 3100]   (POST /mcp, key per request)

import { createServer as createHttpServer, type IncomingMessage } from 'node:http';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createServer } from './server.js';
import { VERSION } from './client.js';

const args = process.argv.slice(2);

async function runStdio() {
  const apiKey = process.env.JSONLINK_API_KEY;
  if (!apiKey) {
    console.error('JSONLINK_API_KEY is not set. Get a free key at https://jsonlink.io/signup');
    process.exit(1);
  }
  await createServer(apiKey).connect(new StdioServerTransport());
  console.error(`jsonlink-mcp ${VERSION} running on stdio`);
}

// The key can come as "Authorization: Bearer <key>", "X-API-Key: <key>"
// or ?api_key=<key> (for clients that only accept a URL).
function apiKeyFrom(req: IncomingMessage, url: URL) {
  const auth = req.headers.authorization || '';
  if (/^Bearer\s+/i.test(auth)) return auth.replace(/^Bearer\s+/i, '').trim();
  const header = req.headers['x-api-key'];
  if (typeof header === 'string' && header) return header.trim();
  return url.searchParams.get('api_key') || '';
}

function runHttp() {
  const portArg = args.indexOf('--port');
  const port = Number(portArg >= 0 ? args[portArg + 1] : process.env.PORT || 3100);

  const http = createHttpServer(async (req, res) => {
    const url = new URL(req.url || '/', 'http://localhost');
    const json = (status: number, body: object) => {
      res.writeHead(status, { 'Content-Type': 'application/json' }).end(JSON.stringify(body));
    };

    if (url.pathname === '/health') return json(200, { ok: true, version: VERSION });
    if (url.pathname !== '/mcp') return json(404, { error: 'Not found' });

    // Stateless server: one MCP server per request, no sessions to keep.
    if (req.method !== 'POST') {
      return json(405, { jsonrpc: '2.0', error: { code: -32000, message: 'Method not allowed.' }, id: null });
    }

    const apiKey = apiKeyFrom(req, url);
    if (!apiKey) {
      return json(401, {
        jsonrpc: '2.0',
        error: { code: -32001, message: 'Missing JsonLink API key. Send "Authorization: Bearer <key>". Get one at https://jsonlink.io/signup' },
        id: null,
      });
    }

    const server = createServer(apiKey);
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    res.on('close', () => {
      transport.close();
      server.close();
    });

    try {
      await server.connect(transport);
      await transport.handleRequest(req, res);
    } catch (err) {
      console.error('MCP request failed:', err);
      if (!res.headersSent) json(500, { jsonrpc: '2.0', error: { code: -32603, message: 'Internal server error' }, id: null });
    }
  });

  http.listen(port, '127.0.0.1', () => console.error(`jsonlink-mcp ${VERSION} listening on http://127.0.0.1:${port}/mcp`));
}

if (args.includes('--http')) {
  runHttp();
} else {
  runStdio().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
