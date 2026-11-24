// npm start [-- --windowed ...] : собрать и запустить Electron, пробросив аргументы.
import { spawn, execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';

execFileSync(process.execPath, ['scripts/build.mjs'], { stdio: 'inherit' });
const require = createRequire(import.meta.url);
const electron = require('electron'); // путь к electron.exe
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE; // иначе Electron запустится как Node
const child = spawn(electron, ['.', ...process.argv.slice(2)], { stdio: 'inherit', env });
child.on('exit', (code) => process.exit(code ?? 0));
