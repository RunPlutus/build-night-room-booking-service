/**
 * Demo server for the room-booking calendar.
 *
 * Loads the repo's own createApp() TWICE (fresh module copies, nothing shared
 * in memory except the database) to behave like two production replicas:
 *
 *   /a/api/...  -> replica A
 *   /b/api/...  -> replica B
 *   /           -> calendar UI
 *   POST /__demo/reset -> fresh seeded database, fresh replicas
 *
 * Env: DEMO_REPO (default cwd), DEMO_PUBLIC (default <repo>/public), DEMO_PORT (default 4000)
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { runSchedulingContracts } from './scheduling-contracts';

const REPO = path.resolve(process.env.DEMO_REPO ?? process.cwd());
const PUBLIC = path.resolve(process.env.DEMO_PUBLIC ?? path.join(REPO, 'public'));
const PORT = Number(process.env.DEMO_PORT ?? 4000);
const SRC = path.join(REPO, 'src') + path.sep;
const requireFromRepo = createRequire(path.join(REPO, 'package.json'));
process.env.LOG_LEVEL ??= 'error';

type Handler = (req: http.IncomingMessage, res: http.ServerResponse) => void;

function loadReplica(sharedDb?: unknown): { app: Handler; db: unknown } {
  for (const k of Object.keys(requireFromRepo.cache)) if (k.startsWith(SRC)) delete requireFromRepo.cache[k];
  const { createApp } = requireFromRepo(path.join(SRC, 'app'));
  const { createDatabase } = requireFromRepo(path.join(SRC, 'db'));
  const db = sharedDb ?? createDatabase();
  return { app: createApp({ db }), db };
}

let replicas: Record<string, Handler> = {};
function reset(): void {
  const a = loadReplica();
  const b = loadReplica(a.db);
  replicas = { a: a.app, b: b.app };
}
reset();

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
};

const server = http
  .createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const m = /^\/(a|b)(\/.*)$/.exec(url.pathname);
    if (m) {
      req.url = m[2] + url.search;
      return replicas[m[1]](req, res);
    }
    if (url.pathname === '/__demo/reset' && req.method === 'POST') {
      try {
        reset();
        res.writeHead(204).end();
      } catch (err) {
        res.writeHead(500, { 'content-type': 'text/plain' }).end(String(err));
      }
      return;
    }
    if (url.pathname === '/__demo/contracts' && req.method === 'GET') {
      try {
        const engine = {
          ...requireFromRepo(path.join(SRC, 'scheduling/overlap')),
          ...requireFromRepo(path.join(SRC, 'scheduling/recurrence')),
        };
        const checks = runSchedulingContracts(engine);
        res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' }).end(JSON.stringify({ checks }));
      } catch (error) {
        res.writeHead(500, { 'content-type': 'application/json' }).end(JSON.stringify({ error: String(error) }));
      }
      return;
    }
    if (url.pathname === '/__demo/info') {
      res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ repo: path.basename(REPO) }));
      return;
    }
    const rel = url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname).replace(/^\/+/, '');
    const file = path.resolve(PUBLIC, rel);
    if (!file.startsWith(PUBLIC + path.sep) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404, { 'content-type': 'text/plain' }).end('not found');
      return;
    }
    res.writeHead(200, { 'content-type': TYPES[path.extname(file)] ?? 'application/octet-stream', 'cache-control': 'no-store' });
    res.end(fs.readFileSync(file));
  })
  .listen(PORT, () => {
    console.log(`\n  Room booking demo for "${path.basename(REPO)}"`);
    const address = server.address();
    const actualPort = typeof address === 'object' && address ? address.port : PORT;
    console.log(`  http://localhost:${actualPort}   (two replicas, one shared database)\n`);
  });
