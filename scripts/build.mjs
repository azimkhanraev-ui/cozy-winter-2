// Сборка: main (node/cjs), preload (cjs), рендереры (iife для браузера).
import { build } from 'esbuild';

const prod = process.argv.includes('--prod');
const common = { bundle: true, sourcemap: prod ? false : 'inline', minify: prod, logLevel: 'warning', target: 'es2022' };

await Promise.all([
  build({ ...common, entryPoints: ['src/main/main.ts'], outfile: 'dist/main.js', platform: 'node', format: 'cjs', external: ['electron'] }),
  build({ ...common, entryPoints: ['src/main/preload.ts'], outfile: 'dist/preload.js', platform: 'node', format: 'cjs', external: ['electron'] }),
  build({ ...common, entryPoints: ['src/ui/overlay.ts'], outfile: 'dist/overlay.js', platform: 'browser', format: 'iife' }),
  build({ ...common, entryPoints: ['src/ui/settings.ts'], outfile: 'dist/settings.js', platform: 'browser', format: 'iife' }),
]);
console.log('build ok' + (prod ? ' (prod)' : ''));
