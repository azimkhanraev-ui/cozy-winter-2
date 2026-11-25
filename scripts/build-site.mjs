// Сборка сайта: живое демо (та же симуляция, что в приложении) → website/demo.js, иконка → website/icon.png.
import { build } from 'esbuild';
import { copyFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

await build({ entryPoints: ['src/web/demo.ts'], outfile: 'website/demo.js', bundle: true, minify: true, format: 'iife', platform: 'browser', target: 'es2022', logLevel: 'warning' });
if (!existsSync('build/icon.png')) execFileSync(process.execPath, ['scripts/make-icon.mjs'], { stdio: 'inherit' });
copyFileSync('build/icon.png', 'website/icon.png');
console.log('website/ собран: откройте website/index.html');
