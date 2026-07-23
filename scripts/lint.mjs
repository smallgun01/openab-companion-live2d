import { readdir } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const run = promisify(execFile);
const jsFiles = (await readdir(new URL('../js/', import.meta.url)))
  .filter((name) => name.endsWith('.js'))
  .map((name) => `js/${name}`);
const files = ['dev-server.mjs', 'electron/main.cjs', 'electron/preload.cjs', ...jsFiles];
for (const file of files) await run(process.execPath, ['--check', file]);
console.log(`Syntax gate passed (${files.length} files).`);
