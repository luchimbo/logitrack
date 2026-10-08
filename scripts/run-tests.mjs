import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
const files = readdirSync(new URL('../tests/', import.meta.url))
  .filter(name => /\.test\.(js|mjs)$/.test(name)).map(name => `tests/${name}`);
const flags = Number(process.versions.node.split('.')[0]) < 25 ? ['--experimental-default-type=module'] : [];
const result = spawnSync(process.execPath, [...flags, '--test', ...files], { stdio: 'inherit' });
process.exit(result.status ?? 1);
