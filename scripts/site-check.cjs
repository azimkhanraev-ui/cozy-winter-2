// Проверка сайта в движке Chromium (Electron): страница грузится без ошибок, демо работает,
// три клика по снегу + перетаскивание шаров → снеговик. Снимки в tests/shots/site-*.png.
const { app, BrowserWindow } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
app.whenReady().then(async () => {
  const w = new BrowserWindow({ width: 1280, height: 900, show: false });
  const errors = [];
  w.webContents.on('console-message', (...a) => { const e = a[0]; const lvl = e?.level ?? a[1]; if (lvl === 'error' || lvl === 3) errors.push(e?.message ?? a[2]); });
  if (process.env.SITE_URL) await w.loadURL(process.env.SITE_URL);
  else await w.loadFile(path.join(__dirname, '..', 'website', 'index.html'));
  w.showInactive();
  await wait(1500);
  const js = (c) => w.webContents.executeJavaScript(c);
  const shots = path.join(__dirname, '..', 'tests', 'shots');
  fs.writeFileSync(path.join(shots, 'site-top.png'), (await w.webContents.capturePage()).toPNG());
  // прокрутить к демо
  const r = await js(`(() => { const c = document.getElementById('demo'); c.scrollIntoView({ behavior: 'instant', block: 'center' }); const b = c.getBoundingClientRect(); return [b.left, b.top, b.width, b.height]; })()`);
  await wait(1200);
  const rr = await js(`(() => { const b = document.getElementById('demo').getBoundingClientRect(); return [b.left, b.top, b.width, b.height]; })()`);
  const cx = Math.round(rr[0] + rr[2] * 0.42);
  const send = (type, x, y, extra = {}) => w.webContents.sendInputEvent({ type, x, y, button: 'left', clickCount: 1, ...extra });
  const click = async (x, y) => { send('mouseMove', x, y); await wait(50); send('mouseDown', x, y); await wait(50); send('mouseUp', x, y); await wait(100); };
  // ставим шары по очереди точно над предыдущим (как пользователь)
  for (let k = 0; k < 3; k++) {
    let x = cx;
    if (k > 0) {
      const bs = await js('window.__demo.balls()');
      x = Math.round(rr[0] + bs[bs.length - 1][0]) + 2;
    }
    await click(x, Math.round(rr[1] + 40));
    await wait(2200);
  }
  await wait(1500);
  const info = { snowmen: await js('window.__demo.snowmen()'), hint: await js(`document.getElementById('demo-hint').textContent`), download: await js(`document.querySelector('[data-download]').href`), portable: await js(`document.querySelector('[data-portable]').href`), errors };
  fs.writeFileSync(path.join(shots, 'site-demo.png'), (await w.webContents.capturePage()).toPNG());
  // ночь
  await js(`document.querySelector('[data-hour="23.5"]').click()`);
  await wait(800);
  fs.writeFileSync(path.join(shots, 'site-night.png'), (await w.webContents.capturePage()).toPNG());
  console.log('[site-check] ' + JSON.stringify(info));
  app.exit(0);
});
