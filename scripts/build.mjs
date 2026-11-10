import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { readAssets } from './assets.mjs';

const output = new URL('../dist/', import.meta.url);
for (const folder of ['server/', '.openai/']) {
  mkdirSync(new URL(folder, output), { recursive: true });
}
const app = readFileSync(new URL('../server/app.mjs', import.meta.url), 'utf8');
writeFileSync(new URL('server/index.js', output), [
  app,
  'const assets = ' + JSON.stringify(readAssets()) + ';',
  'const handle = createApp(assets);',
  'export default { fetch(request, env) { return handle(request, env.DB); } };',
].join('\n'));
const manifest = '.openai/hosting.json';
copyFileSync(new URL('../' + manifest, import.meta.url), new URL(manifest, output));
