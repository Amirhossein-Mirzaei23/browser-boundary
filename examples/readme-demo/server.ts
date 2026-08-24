import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Localhost-only static server for the deterministic README demo target.
 *
 * Serves exactly one page with no external requests. `startDemoServer(0)`
 * binds an ephemeral port for tests and capture scripts; both get a
 * `close()` that stops accepting and ends open sockets.
 */

const PAGE_PATH = path.join(path.dirname(fileURLToPath(import.meta.url)), 'index.html');

export interface DemoServer {
  readonly port: number;
  close(): Promise<void>;
}

export async function startDemoServer(port = 4317, host = '127.0.0.1'): Promise<DemoServer> {
  const html = await readFile(PAGE_PATH, 'utf8');

  const server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', `http://${host}`);
    if (url.pathname !== '/') {
      res.writeHead(404, { 'content-type': 'text/plain' });
      res.end('not found');
      return;
    }
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
    res.end(html);
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, resolve);
  });

  const bound = server.address();
  const actualPort = typeof bound === 'object' && bound ? bound.port : port;

  const demo = server as unknown as DemoServer;
  Object.defineProperty(demo, 'port', { value: actualPort });
  const originalClose = server.close.bind(server);
  demo.close = () =>
    new Promise<void>((resolve, reject) => originalClose((err) => (err ? reject(err) : resolve())));
  return demo;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.DEMO_PORT ?? 4317);
  const server = await startDemoServer(port);
  console.log(`readme demo target: http://127.0.0.1:${server.port}/ (Ctrl+C to stop)`);
}
