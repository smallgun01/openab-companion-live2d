import http from 'node:http';
import { pathToFileURL } from 'node:url';

const DEFAULT_CHUNKS = ['Hello', ' from', ' the', ' local', ' mock', ' server.'];

function writeJson(res, statusCode, body) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
  });
  res.end(JSON.stringify(body));
}

export function createMockSseServer({ mode = 'stream', intervalMs = 1000, chunks = DEFAULT_CHUNKS } = {}) {
  const state = { requests: 0, aborted: 0, completed: 0 };
  const server = http.createServer((req, res) => {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
      });
      res.end();
      return;
    }

    if (req.method !== 'POST' || req.url !== '/v1/chat/completions') {
      writeJson(res, 404, { error: 'Use POST /v1/chat/completions' });
      return;
    }

    state.requests += 1;
    if (mode === 'always-429') {
      writeJson(res, 429, { error: { message: 'Mock server busy' } });
      return;
    }

    let closed = false;
    let timer = null;
    const stop = () => {
      if (timer) clearTimeout(timer);
      timer = null;
    };
    req.on('aborted', () => { closed = true; state.aborted += 1; stop(); });
    res.on('close', () => { if (!res.writableEnded && !closed) state.aborted += 1; closed = true; stop(); });

    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'Access-Control-Allow-Origin': '*',
    });
    res.flushHeaders();

    let index = 0;
    const sendNext = () => {
      if (closed) return;
      if (index >= chunks.length) {
        res.write('data: [DONE]\n\n');
        res.end();
        state.completed += 1;
        return;
      }
      const content = chunks[index++];
      res.write(`data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\n`);
      timer = setTimeout(sendNext, intervalMs);
    };
    sendNext();
  });
  return { server, state };
}

async function startCli() {
  const mode = process.argv.includes('--mode=always-429') ? 'always-429' : 'stream';
  const { server, state } = createMockSseServer({ mode });
  await new Promise((resolve) => server.listen(8012, '127.0.0.1', resolve));
  console.log(`Mock endpoint ready: http://127.0.0.1:8012/v1/chat/completions (${mode})`);
  console.log('Press Ctrl+C to stop. Requests and cancelled connections are logged below.');
  const report = () => console.log(`requests=${state.requests} aborted=${state.aborted} completed=${state.completed}`);
  const shutdown = () => server.close(() => process.exit(0));
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
  setInterval(report, 1000).unref();
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) startCli();
