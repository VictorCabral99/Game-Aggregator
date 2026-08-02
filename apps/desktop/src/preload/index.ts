import { contextBridge, ipcRenderer } from 'electron';
import type { DesktopApi } from '../shared/api';

const api: DesktopApi = {
  launchExe: (req) => ipcRenderer.invoke('launch:exe', req),
  dbHealth: () => ipcRenderer.invoke('db:health'),
  openPath: (path) => ipcRenderer.invoke('shell:open-path', path),
};

contextBridge.exposeInMainWorld('api', api);
