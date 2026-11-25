// npm run selftest — запускает приложение в тестовом режиме, прогоняет сценарии, сохраняет PNG
// в tests/shots/ и печатает PASS/FAIL. Отдельный временный профиль: настройки пользователя не трогаются.
import { spawnSync, execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { rmSync, readdirSync, existsSync } from 'node:fs';

execFileSync(process.execPath, ['scripts/build.mjs'], { stdio: 'inherit' });
const electron = createRequire(import.meta.url)('electron');
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
const PROFILE = 'tests/tmp-selftest';

function run(args) {
  rmSync(PROFILE, { recursive: true, force: true });
  const r = spawnSync(electron, ['.', `--user-data=${PROFILE}`, '--exit', ...args], { env, encoding: 'utf8', timeout: 360000 });
  return { code: r.status, out: (r.stdout ?? '') + (r.stderr ?? '') + (r.error ? `
[selftest] ${r.error.message}` : '') };
}
function scenario(name, mode = '--windowed') {
  let r = run([mode, `--scenario=${name}`]);
  // Если запуск вообще ничего не вернул (бывает под тяжёлой нагрузкой машины) — один повтор, с пометкой.
  let retried = false;
  if (!new RegExp(String.raw`\[scenario\] ` + name + '-').test(r.out)) {
    retried = true;
    r = run([mode, `--scenario=${name}`]);
  }
  const m = r.out.match(new RegExp(String.raw`\[scenario\] ` + name + String.raw`-\S+ (\{.*\})`));
  const shot = r.out.match(/\[shot\] (.+?\.png)/);
  return { info: m ? JSON.parse(m[1]) : null, shot: (shot?.[1] ?? '') + (retried ? ' (повтор)' : ''), out: r.out };
}

/** Тест реальным вводом мыши (sendInputEvent): возвращает JSON-итог и путь к снимку. */
function inputTest(name, extra = []) {
  rmSync(PROFILE, { recursive: true, force: true });
  const r = spawnSync(electron, ['.', `--user-data=${PROFILE}`, '--windowed', `--input-test=${name}`, ...extra], { env, encoding: 'utf8', timeout: 360000 });
  const out = (r.stdout ?? '') + (r.stderr ?? '');
  const m = out.match(new RegExp(String.raw`\[input-test\] ` + name + String.raw` (\{.*\})`));
  const shot = out.match(/\[shot\] (.+?\.png)/);
  return { info: m ? JSON.parse(m[1]) : null, shot: shot?.[1], out: out + (r.error ? `
[selftest] ${r.error.message}` : ''), code: r.status };
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

// ---------- этап 5: снеговик ----------
{
  const s = scenario('snowman');
  const i = s.info;
  check('правильная стопка → 1 снеговик, неправильная → подсказка', !!i && i.snowmen === 1 && i.hint === 'order', i ? `снеговиков ${i.snowmen}, подсказка «${i.hint}» → ${s.shot}` : tail(s));
}
{
  const s = scenario('snowmen');
  const i = s.info;
  const uniq = new Set(i?.looks ?? []).size;
  check('разные снеговики: малыш…великан, разная внешность', !!i && i.snowmen >= 4 && uniq >= 3, i ? `снеговиков ${i.snowmen}, внешностей ${uniq}: ${i.looks.join(', ')} → ${s.shot}` : tail(s));
}
{
  const s = inputTest('snowman');
  const i = s.info;
  check('мышью: собрать из 3 шаров, двойной клик → окошко, перетащить, ПКМ → растаял', !!i && i.customizeOpen === true && Math.abs(i.dragDx ?? 0) > 100 && i.snowmenAfterMelt === 0, i ? JSON.stringify({ customize: i.customizeOpen, dragDx: i.dragDx, afterMelt: i.snowmenAfterMelt }) : tail(s));
}

// ---------- этап 6: снегоуборщик, время суток, декор ----------
{
  const phases = ['dawn', 'morning', 'day', 'sunset', 'evening', 'night'];
  const got = phases.map((p) => scenario('day-' + p));
  const ok = got.every((g, k) => g.info && g.info.phase === phases[k]);
  check('время суток: 6 фаз (рассвет…ночь)', ok, got.map((g) => g.info?.phase ?? '?').join(', ') + ' → tests/shots/day-*.png');
}
{
  const s = scenario('plow-night');
  const i = s.info;
  check('снегоуборщик едет и срезает снег (ночью — фары)', !!i && i.plows === 1 && i.plowCleared > 100, i ? `убрано ${i.plowCleared}px² → ${s.shot}` : tail(s));
}
{
  const s = scenario('decor-night');
  const i = s.info;
  check('декор: домик, ёлки, фонарь, забор; снег ложится на декор', !!i && i.decor >= 5 && Math.min(...i.decorSnow) > 0.3, i ? `предметов ${i.decor}, снег на них ${JSON.stringify(i.decorSnow)} → ${s.shot}` : tail(s));
}

// ---------- этап 7: дополнительные фишки ----------
{
  const s = scenario('fx');
  const i = s.info;
  check('следы, «снежный ангел», брызги снежков на стекле', !!i && i.decals >= 8 && i.splats >= 3, i ? `отпечатков ${i.decals}, брызг ${i.splats} → ${s.shot}` : tail(s));
}
{
  const s = scenario('shake');
  const i = s.info;
  check('«снежный шар»: снег взметается вихрем', !!i && i.swirl > 150, i ? `частиц вихря ${i.swirl} → ${s.shot}` : tail(s));
}
{
  const s = scenario('ledges');
  const i = s.info;
  check('снег на верхних краях окон (рендер)', !!i && i.ledges === 2 && i.ledgeSnow > 1000, i ? `кромок ${i.ledges}, снега ${i.ledgeSnow}px² → ${s.shot}` : tail(s));
}
{
  const pics = 'tests/tmp-pictures';
  rmSync(pics, { recursive: true, force: true });
  const s = inputTest('fx', [`--pictures-dir=${pics}`]);
  const i = s.info;
  const photos = existsSync(pics) ? readdirSync(pics).filter((f) => f.endsWith('.png')) : [];
  const ok = !!i && i.afterThrow.decals >= 8 && i.afterThrow.splats >= 1 && i.winterOn && i.simSpeed > 15 && i.afterShake.particles > 150 && photos.length === 1 && i.audio === 'running';
  check('мышью: шаги, ангел, бросок, фотоаппарат, «зима за минуту», встряхнуть, звук', ok, i ? `отпечатков ${i.afterThrow.decals}, брызг ${i.afterThrow.splats}, фото ${photos.length}, ускорение ×${i.simSpeed}, вихрь ${i.afterShake.particles}, звук ${i.audio}` : tail(s));
  rmSync(pics, { recursive: true, force: true });
}

// ---------- этап 8: управление ----------
{
  const r = run(['--windowed', '--settings-check']);
  const tabs = (r.out.match(/\[settings-check\] tabs=(\S+)/) ?? [])[1]?.split(',') ?? [];
  const bad = r.out.match(/\[settings-check\] вкладка .*/g) ?? [];
  check('окно настроек: 8 вкладок с предпросмотром', tabs.length === 8 && bad.length === 0, `${tabs.join(', ')} → tests/shots/settings-*.png ${bad.join('; ')}`);
}
{
  const r = run(['--overlay', '--mouse-test']);
  const m = r.out.match(/\[mouse-test\] (\{.*\})/);
  const i = m ? JSON.parse(m[1]) : null;
  const ok = !!i && i.passive === 'under' && i.interactive === 'overlay' && i.afterEsc === 'under' && i.overDockTab === 'overlay' && i.awayFromDock === 'under';
  check('оверлей: клики насквозь, в режиме инструментов — ловит, над доком — ловит', ok, i ? JSON.stringify(i) : r.out.slice(-300));
}
{
  const r = run(['--windowed', '--hotkey-check']);
  const m = r.out.match(/\[hotkey-check\] (\{.*\})/);
  const i = m ? JSON.parse(m[1]) : null;
  const ok = !!i && Object.values(i.defaults).every(Boolean) && i.afterChange.registered.includes('Ctrl+Alt+F9');
  check('глобальные клавиши Ctrl+Alt+S/P/C/G/Q регистрируются и переназначаются', ok, i ? JSON.stringify(i.afterChange.registered) : r.out.slice(-300));
}
{
  const s = inputTest('tour');
  const i = s.info;
  check('подсказка первого запуска: 3 шага, потом не показывается', !!i && i.stepAtStart === 1 && i.stepAtEnd === 0 && i.firstRunSaved === false, i ? JSON.stringify({ start: i.stepAtStart, end: i.stepAtEnd, saved: i.firstRunSaved }) : tail(s));
}

// ---------- этап 9: система ----------
{
  // сцена сохраняется между запусками: 1-й запуск собирает снеговиков и сохраняет при выходе, 2-й загружает
  rmSync(PROFILE, { recursive: true, force: true });
  const a = spawnSync(electron, ['.', `--user-data=${PROFILE}`, '--exit', '--windowed', '--scenario=snowmen', '--save-scene'], { env, encoding: 'utf8', timeout: 360000 });
  const outA = (a.stdout ?? '') + (a.stderr ?? '');
  const before = outA.match(/\[scenario\] snowmen-\S+ (\{.*\})/);
  const saved = /\[scene\] saved/.test(outA);
  const b = spawnSync(electron, ['.', `--user-data=${PROFILE}`, '--exit', '--windowed', '--scenario=persist', '--load-scene'], { env, encoding: 'utf8', timeout: 360000 });
  const outB = (b.stdout ?? '') + (b.stderr ?? '');
  const after = outB.match(/\[scenario\] persist-\S+ (\{.*\})/);
  const i0 = before ? JSON.parse(before[1]) : null;
  const i1 = after ? JSON.parse(after[1]) : null;
  const ok = saved && !!i0 && !!i1 && i1.snowmen === i0.snowmen && i1.snowmen > 0 && i1.mean > 5;
  check('сцена (снег, снеговики) сохраняется между запусками', ok, i1 ? `сохранено=${saved}, снеговиков ${i0?.snowmen} → ${i1.snowmen}, снег mean=${i1.mean} → tests/shots/persist-windowed.png` : outB.slice(-300));
}
{
  const r = run(['--overlay', '--system-check']);
  const m = r.out.match(/\[system-check\] (\{.*\})/);
  const i = m ? JSON.parse(m[1]) : null;
  const ok = !!i && i.helperReady && i.autoPausedWithFullscreen && i.overlayHidden && i.rendererPaused && i.resumedAfterClose && i.overlayVisibleAgain && i.economyFps === 30 && i.normalFps === 60;
  check('автопауза при полноэкранном окне, режим экономии', ok, i ? JSON.stringify(i) : r.out.slice(-300));
}

rmSync(PROFILE, { recursive: true, force: true });
const ok = results.every(Boolean);
console.log(`\n${ok ? 'ALL PASS' : 'SOME FAILED'} (${results.filter(Boolean).length}/${results.length})`);
process.exit(ok ? 0 : 1);
