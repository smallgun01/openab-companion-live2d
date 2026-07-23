import { access, stat } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(process.argv[2] || '.');
const required = [
  'index.html',
  'lib/CubismSdkForWeb-5-r.1/Core/live2dcubismcore.min.js',
  'models/jellyfish-girl/jellyfishgirl.model3.json',
  'models/jellyfish-girl/jellyfishgirl.moc3',
  'models/jellyfish-girl/jellyfishgirl.8192/texture_00.png',
];

const missing = [];
for (const relative of required) {
  try {
    const info = await stat(path.join(root, relative));
    if (!info.isFile() || info.size === 0) missing.push(relative);
  } catch { missing.push(relative); }
}
if (missing.length) {
  console.error(`Missing required Live2D runtime assets:\n${missing.map((item) => `  - ${item}`).join('\n')}`);
  console.error('Install the licensed Cubism Core and JellyFish Girl model as documented in README before building.');
  process.exit(1);
}
console.log(`Asset gate passed (${root}).`);
