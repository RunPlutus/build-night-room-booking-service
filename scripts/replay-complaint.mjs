import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../public/scenarios.js', import.meta.url), 'utf8');
const { makeApi, SCENARIOS } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
const child = spawn(process.execPath, ['--import', 'tsx', 'scripts/demo-server.ts'], {
  cwd: new URL('..', import.meta.url),
  env: { ...process.env, DEMO_PORT: '0', NODE_ENV: 'test', LOG_LEVEL: 'error' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let output = '';
try {
  const base = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Demo did not become ready')), 15000);
    child.on('error', (error) => { clearTimeout(timer); reject(error); });
    child.on('exit', (code) => { clearTimeout(timer); reject(new Error(`Demo exited ${code}: ${output}`)); });
    child.stderr.on('data', (chunk) => { output += chunk; });
    child.stdout.on('data', (chunk) => {
      output += chunk;
      const match = output.match(/http:\/\/localhost:(\d+)/);
      if (match) { clearTimeout(timer); resolve(match[0]); }
    });
  });
  const api = makeApi(base);
  const checks = [];
  for (const scenario of SCENARIOS) {
    await api.reset();
    checks.push(...await scenario.run(api));
  }
  for (const check of checks) console.log(`${check.ok ? 'PASS' : 'FAIL'} ${check.label} | expected: ${check.expected} | actual: ${check.actual}`);
  console.log(`\n${checks.filter((c) => c.ok).length}/${checks.length} complaint checks passed`);
  process.exitCode = checks.every((c) => c.ok) ? 0 : 1;
} finally {
  if (child.exitCode === null) { const done = once(child, 'exit'); child.kill(); await done; }
}
