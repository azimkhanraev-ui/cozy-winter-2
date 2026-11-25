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

/** Тест реальным вводом мыши (sendInputEvent): возвращает JSON-итог и путь к снимку. */
function inputTest(name) {
  rmSync(PROFILE, { recursive: true, force: true });
  const r = spawnSync(electron, ['.', `--user-data=${PROFILE}`, '--windowed', `--input-test=${name}`], { env, encoding: 'utf8', timeout: 240000 });
  const out = (r.stdout ?? '') + (r.stderr ?? '');
  const m = out.match(new RegExp(String.raw`\[input-test\] ` + name + String.raw` (\{.*\})`));
  const shot = out.match(/\[shot\] (.+?\.png)/);
  return { info: m ? JSON.parse(m[1]) : null, shot: shot?.[1], out, code: r.status };
}

const results = [];
const check = (name, ok, detail) => {
  results.push(ok);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
};
const tail = (s) => s.out.slice(-500).replace(/\s+/g, ' ');

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

// ---------- этап 3: уборка снега ----------
{
  const s = scenario('shovel');
  const i = s.info;
  check('лопата убирает полосу, объём сохраняется, валик без стенок', !!i && Math.abs(i.volumeDelta) < 0.01 && i.stripMax < 5 && i.slopeViolation < 0.1, i ? `Δобъёма=${(i.volumeDelta * 100).toFixed(2)}% снег в полосе ≤ ${i.stripMax}px, превышение откоса ${i.slopeViolation} → ${s.shot}` : tail(s));
}
{
  const s = inputTest('tools');
  const i = s.info;
  check('мышью через док: лопата, ластик, снегодув, тепло, насыпать', !!i && Math.abs(i.shovelVolumeDelta) < 0.01, i ? `Δобъёма лопаты=${(i.shovelVolumeDelta * 100).toFixed(2)}% → ${s.shot}` : tail(s));
}
{
  const s = inputTest('undo');
  const i = s.info;
  check('Undo/Redo: 22 шага', !!i && i.undoRestored && i.redoRestored && i.v1 < i.v0 * 0.9, i ? `объём ${Math.round(i.v0)} → ${Math.round(i.v1)} → undo ${Math.round(i.v2)} → redo ${Math.round(i.v3)}` : tail(s));
}
{
  const s = inputTest('escape');
  const i = s.info;
  check('ПКМ по пустому месту → пассивный режим', !!i && i.interactiveAfterPick === true && i.interactiveAfterRmb === false, i ? JSON.stringify({ a: i.interactiveAfterPick, b: i.interactiveAfterRmb }) : tail(s));
}

// ---------- этап 4: снежные шары ----------
{
  const s = scenario('balls');
  const i = s.info;
  check('шары S/M/L/XL лежат, стопка из трёх устойчива, ком катается с сохранением объёма', !!i && i.allSleeping && i.stackOrdered && i.rollVolumeErr < 1 && i.rollR > 20, i ? `шаров ${i.balls}, все спят=${i.allSleeping}, стопка=${i.stackOrdered}, ком r=${i.rollR}, ошибка объёма ${i.rollVolumeErr}px² → ${s.shot}` : tail(s));
}
{
  const s = inputTest('balls');
  const i = s.info;
  const sizes = i?.radiiBeforeMelt ?? [];
  const ok = !!i && [14, 26, 42, 60].every((r) => sizes.includes(r)) && sizes.some((r) => r > 20 && ![14, 26, 42, 60].includes(r)) && i.balls === i.ballsBeforeMelt - 1;
  check('мышью: шары S/M/L/XL, бросок, «Катать», ПКМ растапливает', ok, i ? `радиусы ${JSON.stringify(sizes)}, шаров до/после ПКМ ${i.ballsBeforeMelt}/${i.balls} → ${s.shot}` : tail(s));
}

rmSync(PROFILE, { recursive: true, force: true });
const ok = results.every(Boolean);
console.log(`\n${ok ? 'ALL PASS' : 'SOME FAILED'} (${results.filter(Boolean).length}/${results.length})`);
process.exit(ok ? 0 : 1);
