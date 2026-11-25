// Сборка установщика (NSIS) и portable .exe в release/ через API electron-builder
// (без разбора командной строки — так сборка работает и под Node, встроенным в другие Electron-программы).
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';

execFileSync(process.execPath, ['scripts/build.mjs', '--prod'], { stdio: 'inherit' });
execFileSync(process.execPath, ['scripts/make-icon.mjs'], { stdio: 'inherit' });
const { build, Platform } = createRequire(import.meta.url)('electron-builder');
const files = await build({ targets: Platform.WINDOWS.createTarget(['nsis', 'portable']), publish: 'never' });
console.log('\nГотово:\n' + files.filter((f) => f.endsWith('.exe')).map((f) => '  ' + f).join('\n'));
