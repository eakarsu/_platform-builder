import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { setTimeout as delay } from 'node:timers/promises';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const run = promisify(execFile);
const modules = JSON.parse(await readFile(new URL('../config/modules.json', import.meta.url), 'utf8'));

export function selectedPorts(args, env = process.env) {
  if (!args.length) return [Number(env.HUB_PORT || 43100)];
  if (args[0] !== 'start') return [];
  const id = args[1] || 'all';
  const selected = id === 'all' ? modules : modules.filter(module => module.id === id);
  if (!selected.length) throw new Error(`Unknown module: ${id}`);
  return selected.flatMap(module => module.services.map(service => service.port));
}

async function listeners(port) {
  try {
    const { stdout } = await run('lsof', ['-nP', '-t', `-iTCP:${port}`, '-sTCP:LISTEN']);
    return [...new Set(stdout.trim().split(/\s+/).filter(Boolean).map(Number))];
  } catch (error) {
    if (error.code === 1 && !error.stdout?.trim() && !error.stderr?.trim()) return [];
    throw new Error(`Cannot inspect port ${port}: ${error.code === 'ENOENT' ? 'lsof is required' : error.message}`);
  }
}

function signal(pid, name) {
  if (!Number.isInteger(pid) || pid <= 1 || pid === process.pid || pid === process.ppid) {
    throw new Error(`Refusing to stop launcher/system process ${pid}.`);
  }
  try { process.kill(pid, name); }
  catch (error) { if (error.code !== 'ESRCH') throw error; }
}

export async function clearPorts(ports, { graceMs = 3000 } = {}) {
  // Validate the entire selection before stopping any process.
  if (ports.some(port => !Number.isInteger(port) || port < 1024 || port > 65535)) {
    throw new Error('Startup ports must be integers between 1024 and 65535.');
  }
  for (const port of new Set(ports)) {
    const original = await listeners(port);
    if (!original.length) continue;
    console.log(`Clearing port ${port}: stopping PID ${original.join(', ')}.`);
    for (const pid of original) signal(pid, 'SIGTERM');
    const deadline = Date.now() + graceMs;
    let remaining;
    do {
      remaining = await listeners(port);
      if (!remaining.length) break;
      await delay(100);
    } while (Date.now() < deadline);
    // Escalate only for the original processes still holding this port.
    for (const pid of remaining) if (original.includes(pid)) signal(pid, 'SIGKILL');
    for (let attempt = 0; attempt < 20; attempt++) {
      if (!(await listeners(port)).length) { console.log(`Port ${port} is clear.`); break; }
      if (attempt === 19) throw new Error(`Port ${port} is still occupied; another process may be restarting it.`);
      await delay(100);
    }
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { await clearPorts(selectedPorts(process.argv.slice(2))); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
