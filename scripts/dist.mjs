// Сборка установщика (NSIS) и portable .exe через API electron-builder
// (без разбора командной строки — так сборка работает и под Node, встроенным в другие Electron-программы).
//   node scripts/dist.mjs              → release/
//   node scripts/dist.mjs --out=D:\x   → в другую папку (например, если на диске C: мало места)
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';

const outArg = process.argv.find((a) => a.startsWith('--out='));
execFileSync(process.execPath, ['scripts/build.mjs', '--prod'], { stdio: 'inherit' });
execFileSync(process.execPath, ['scripts/make-icon.mjs'], { stdio: 'inherit' });
const { build, Platform } = createRequire(import.meta.url)('electron-builder');
const files = await build({
  targets: Platform.WINDOWS.createTarget(['nsis', 'portable']),
  publish: 'never',
  config: outArg ? { directories: { output: outArg.slice(6) } } : undefined,
});
console.log('\nГотово:\n' + files.filter((f) => f.endsWith('.exe')).map((f) => '  ' + f).join('\n'));
