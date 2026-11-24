// npm run selftest — запускает приложение в тестовом режиме, прогоняет сценарии, сохраняет PNG
// в tests/shots/ и печатает PASS/FAIL. Отдельный временный профиль: настройки пользователя не трогаются.
import { spawnSync, execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { rmSync } from 'node:fs';

execFileSync(process.execPath, ['scripts/build.mjs'], { stdio: 'inherit' });
const electron = createRequire(import.meta.url)('electron');
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
const PROFILE = 'tests/tmp-selftest';

function run(args) {
  rmSync(PROFILE, { recursive: true, force: true });
  const r = spawnSync(electron, ['.', `--user-data=${PROFILE}`, '--exit', ...args], { env, encoding: 'utf8', timeout: 180000 });
  return { code: r.status, out: (r.stdout ?? '') + (r.stderr ?? '') };
}
function scenario(name, mode = '--windowed') {
  const r = run([mode, `--scenario=${name}`]);
  const m = r.out.match(new RegExp(String.raw`\[scenario\] ` + name + String.raw`-\S+ (\{.*\})`));
  const shot = r.out.match(/\[shot\] (.+?\.png)/);
  return { info: m ? JSON.parse(m[1]) : null, shot: shot?.[1], out: r.out };
}

const results = [];
const check = (name, ok, detail) => {
  results.push(ok);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
};

// 1. Трей: реальные пункты меню
{
  const r = run(['--tray-check']);
  const fails = (r.out.match(/\[tray-check\] FAIL.*/g) ?? []);
  const passes = (r.out.match(/\[tray-check\] PASS/g) ?? []).length;
  check('трей: пауза, настройки, смена режима', r.code === 0 && fails.length === 0 && passes > 0, fails.join('; ') || `${passes} проверок`);
}
// 2. Снег 60 с на ускорении (×20 = 20 мин снегопада)
{
  const s = scenario('snow60');
  const i = s.info;
  const ok = !!i && i.mean > 5 && i.max - i.min > 20 && i.slopeViolation < 0.05;
  check('снег падает 60 с на ускорении: неровные сугробы', ok, i ? `mean=${i.mean} min=${i.min} max=${i.max} откос=${i.slopeViolation} → ${s.shot}` : s.out.slice(-400));
}
// 3. Присыпать сразу
{
  const s = scenario('dustnow');
  const i = s.info;
  check('«Присыпать сразу» на пустой земле', !!i && i.mean > 3 && i.slopeViolation < 0.05, i ? `mean=${i.mean} max=${i.max} → ${s.shot}` : s.out.slice(-400));
}
// 4. Оверлей: окно создаётся и рисует снег (прозрачный режим)
{
  const s = scenario('snow60', '--overlay');
  check('оверлей поверх рабочего стола', !!s.info && !!s.shot, s.shot ?? s.out.slice(-400));
}

rmSync(PROFILE, { recursive: true, force: true });
const ok = results.every(Boolean);
console.log(`\n${ok ? 'ALL PASS' : 'SOME FAILED'} (${results.filter(Boolean).length}/${results.length})`);
process.exit(ok ? 0 : 1);
