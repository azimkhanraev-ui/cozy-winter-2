// Отдельный процесс с обычным окном — для проверок снега на краях окон и автопаузы
// (помощник игнорирует окна самого Cozy Winter).
//   по умолчанию: окно в (300,260), через MOVE_AFTER мс сдвигается в (700,330), потом закрывается;
//   FULLSCREEN=1: полноэкранное окно (как игра/видео) на CLOSE_AFTER мс.
const { app, BrowserWindow } = require('electron');
const MOVE_AFTER = Number(process.env.MOVE_AFTER || 27000);
const FULL = process.env.FULLSCREEN === '1';
const CLOSE_AFTER = Number(process.env.CLOSE_AFTER || 8000);
app.whenReady().then(() => {
  const w = new BrowserWindow({ x: 300, y: 260, width: 620, height: 380, title: 'Cozy Winter — тестовое окно', backgroundColor: FULL ? '#202830' : '#e9eef5', fullscreen: FULL });
  w.loadURL('data:text/html;charset=utf-8,<body style="font:20px Segoe UI;padding:30px;color:%23889">Cozy Winter — тестовое окно</body>');
  if (FULL) {
    setTimeout(() => app.quit(), CLOSE_AFTER);
    return;
  }
  setTimeout(() => w.setPosition(700, 330), MOVE_AFTER);
  setTimeout(() => app.quit(), MOVE_AFTER + 6000);
});
