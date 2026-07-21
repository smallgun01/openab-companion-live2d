import { cp, mkdir, rm } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const dist = new URL('../desktop-dist/', import.meta.url);
const assets = ['index.html', 'css', 'js', 'lib', 'models', 'motions'];

await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });

for (const asset of assets) {
  await cp(new URL(asset, root), new URL(asset, dist), { recursive: true });
}

console.log('Built clean desktop assets in desktop-dist/.');
