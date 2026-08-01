import { cp, mkdir, rm } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const root = new URL('../', import.meta.url);
const dist = new URL('../desktop-dist/', import.meta.url);
const assets = ['index.html', 'history.html', 'css', 'js', 'lib', 'models', 'motions', 'profiles'];

await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });

for (const asset of assets) {
  await cp(new URL(asset, root), new URL(asset, dist), { recursive: true });
}

await promisify(execFile)(process.execPath, ['scripts/check-assets.mjs', 'desktop-dist'], { cwd: new URL('../', import.meta.url).pathname });

console.log('Built clean desktop assets in desktop-dist/.');
