import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { sandboxEnvironment } from './sandbox-config.mjs';

let env;
try { env = sandboxEnvironment(); } catch (error) { console.error(error.message); process.exit(1); }
mkdirSync(resolve('.sandbox'), { recursive: true });
const child = spawn(process.execPath, [resolve('node_modules/next/dist/bin/next'), 'dev', '--hostname', 'localhost'], { env, stdio: 'inherit' });
child.on('error', (error) => { console.error(error.message); process.exitCode = 1; });
child.on('exit', (code, signal) => { process.exitCode = code ?? (signal ? 1 : 0); });
