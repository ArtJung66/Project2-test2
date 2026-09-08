import { spawn } from 'node:child_process';
import { once } from 'node:events';
import path from 'node:path';

const env = { ...process.env };
if (process.platform === 'win32' && env.Path && env.PATH) {
  delete env.PATH;
}

const viteBin = path.join(process.cwd(), 'node_modules', 'vite', 'bin', 'vite.js');

async function isDiscoveryBackendRunning() {
  try {
    const response = await fetch('http://localhost:4000/health');
    return response.ok;
  } catch {
    return false;
  }
}

async function isFrontendRunning() {
  try {
    const response = await fetch('http://127.0.0.1:5173');
    return response.ok;
  } catch {
    return false;
  }
}

const processes = [];

if (await isDiscoveryBackendRunning()) {
  console.log('Host discovery backend already running on http://localhost:4000');
} else {
  processes.push(spawn(process.execPath, ['backend/host-discovery-server.mjs'], {
    stdio: 'inherit',
    env,
  }));
}

if (await isFrontendRunning()) {
  console.log('Frontend already running on http://127.0.0.1:5173');
} else {
  processes.push(spawn(process.execPath, [viteBin, '--host', '127.0.0.1'], {
    stdio: 'inherit',
    env,
  }));
}

if (processes.length === 0) {
  console.log('Frontend and backend are ready.');
  process.exit(0);
}

let shuttingDown = false;

function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of processes) {
    if (!child.killed) child.kill();
  }
  process.exit(code);
}

for (const child of processes) {
  child.once('exit', (code) => {
    if (!shuttingDown && code && code !== 0) shutdown(code);
  });
}

process.once('SIGINT', () => shutdown(0));
process.once('SIGTERM', () => shutdown(0));

await Promise.race(processes.map((child) => once(child, 'exit')));
