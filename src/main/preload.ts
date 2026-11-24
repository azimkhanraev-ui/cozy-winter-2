import { contextBridge, ipcRenderer } from 'electron';
import type { CozyApi } from '../shared/ipc';

const api: CozyApi = {
  init: () => ipcRenderer.invoke('init'),
  onSettings: (cb) => ipcRenderer.on('settings', (_e, s) => cb(s)),
  onCommand: (cb) => ipcRenderer.on('command', (_e, c) => cb(c)),
  patchSettings: (patch) => ipcRenderer.send('settings:patch', patch),
  setMouseCapture: (capture) => ipcRenderer.send('mouse-capture', capture),
  scenarioDone: (name, info) => ipcRenderer.send('scenario-done', name, info),
  command: (c) => ipcRenderer.send('command', c),
};
contextBridge.exposeInMainWorld('cozy', api);
