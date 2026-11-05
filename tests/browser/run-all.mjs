// Runs every scripted browser check in this folder against a local copy of the app.
//   node tests/browser/run-all.mjs [name ...]      (names are file names without .mjs; none = all)
// It starts scripts/devserver.py itself (port 8804, or PORT=...), runs each check in turn, and stops the server.
// Needs Playwright and a Chromium: see tests/browser/README.md. Not run by the GitHub Action.
import { spawn } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..');
const port = process.env.PORT || '8804';
const base = `http://localhost:${port}/`;

const wanted = process.argv.slice(2);
const checks = readdirSync(here)
  .filter((f) => f.endsWith('.mjs') && !['lib.mjs', 'run-all.mjs'].includes(f))
  .map((f) => f.replace(/\.mjs$/, ''))
  .filter((name) => !wanted.length || wanted.includes(name))
  .sort();
if (!checks.length) { console.error('No matching checks.'); process.exit(2); }

const server = spawn('python3', [join(root, 'scripts', 'devserver.py'), port], { stdio: 'ignore' });
const stop = () => { try { server.kill(); } catch { /* already gone */ } };
process.on('exit', stop);
process.on('SIGINT', () => { stop(); process.exit(130); });

async function waitForServer() {
  for (let i = 0; i < 50; i++) {
    try { if ((await fetch(base)).ok) return; } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`The local server did not start on port ${port}.`);
}

const run = (name) => new Promise((resolve) => {
  console.log(`\n=== ${name} ===`);
  const child = spawn('node', [join(here, `${name}.mjs`)], { stdio: 'inherit', env: { ...process.env, BASE_URL: base } });
  child.on('exit', (code) => resolve(code === 0));
});

await waitForServer();
const failed = [];
for (const name of checks) if (!(await run(name))) failed.push(name);
stop();
console.log(failed.length ? `\nFAILED: ${failed.join(', ')}` : '\nAll browser checks passed.');
process.exit(failed.length ? 1 : 0);
