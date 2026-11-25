import { contextBridge, ipcRenderer } from 'electron';
import type { CozyApi } from '../shared/ipc';

const api: CozyApi = {
  init: () => ipcRenderer.invoke('init'),
  onSettings: (cb) => ipcRenderer.on('settings', (_e, s) => cb(s)),
  onCommand: (cb) => ipcRenderer.on('command', (_e, c) => cb(c)),
  onUi: (cb) => ipcRenderer.on('ui', (_e, u) => cb(u)),
  onWindows: (cb) => ipcRenderer.on('windows', (_e, r) => cb(r)),
  patchSettings: (patch) => ipcRenderer.send('settings:patch', patch),
  setMouseCapture: (capture) => ipcRenderer.send('mouse-capture', capture),
  scenarioDone: (name, info) => ipcRenderer.send('scenario-done', name, info),
  command: (c) => ipcRenderer.send('command', c),
  ui: (patch) => ipcRenderer.send('ui', patch),
  historyPushed: () => ipcRenderer.send('history-pushed'),
  openSettings: () => ipcRenderer.send('open-settings'),
  screenshot: () => ipcRenderer.send('screenshot'),
  saveScene: (key, data) => ipcRenderer.send('scene:save', key, data),
  exportSettings: () => ipcRenderer.send('settings:export'),
  importSettings: () => ipcRenderer.send('settings:import'),
  hotkeyStatus: () => ipcRenderer.invoke('hotkey-status'),
  reportRects: (r) => ipcRenderer.send('rects', r),
  setFocus: (f) => ipcRenderer.send('set-focus', f),
  setWallpaper: (scene, png) => ipcRenderer.invoke('wallpaper:apply', scene, png),
  restoreWallpaper: () => ipcRenderer.invoke('wallpaper:restore'),
};
contextBridge.exposeInMainWorld('cozy', api);
