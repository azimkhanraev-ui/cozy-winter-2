// Подсказка первого запуска: три шага над доком. После «Понятно» больше не показывается
// (можно вернуть кнопкой в настройках → Система).
import { registerModule, App } from './app';
import { t, Key } from '../shared/i18n';

let el: HTMLDivElement | null = null;
let step = 0;
const STEPS: Key[] = ['tour1', 'tour2', 'tour3'];

function close(app: App): void {
  el?.remove();
  el = null;
  app.api.patchSettings({ firstRun: false });
}

function show(app: App): void {
  const lang = app.settings.lang;
  if (!el) {
    el = document.createElement('div');
    el.className = 'tour';
    document.body.appendChild(el);
  }
  el.innerHTML = `<div class="step">${step + 1} / ${STEPS.length}</div><div class="txt"></div><div class="row"><button></button></div>`;
  (el.querySelector('.txt') as HTMLElement).textContent = t(lang, STEPS[step]);
  const b = el.querySelector('button') as HTMLButtonElement;
  b.textContent = t(lang, step < STEPS.length - 1 ? 'next' : 'gotIt');
  b.onclick = () => {
    if (step < STEPS.length - 1) {
      step++;
      show(app);
    } else close(app);
  };
  const w = 300;
  const above = Math.min(app.H * 0.35, app.settings.drift.maxHeight * 1.15 + 34) + 70;
  el.style.left = `${Math.round(app.W / 2 - w / 2)}px`;
  el.style.bottom = `${Math.round(above)}px`;
}

registerModule({
  name: 'tour',
  onSettings(app) {
    if (!app.info.hasDock || app.info.scenario) return;
    if (app.settings.firstRun && !el) {
      step = 0;
      show(app);
    } else if (!app.settings.firstRun && el) {
      el.remove();
      el = null;
    }
  },
});

const TT = ((window as unknown as { __test: Record<string, unknown> }).__test ??= {});
TT.tourStep = () => (el ? step + 1 : 0);
