import { contextBridge, ipcRenderer } from 'electron';
import type {
  CreateGameInput,
  DesktopApi,
  LaunchRequest,
  UpdateGameInput,
} from '../shared/api';

const api: DesktopApi = {
  launchExe: (req: LaunchRequest) => ipcRenderer.invoke('launch:exe', req),
  dbHealth: () => ipcRenderer.invoke('db:health'),
  openPath: (path: string) => ipcRenderer.invoke('shell:open-path', path),
  libraryList: () => ipcRenderer.invoke('library:list'),
  libraryAdd: (input: CreateGameInput) => ipcRenderer.invoke('library:add', input),
  libraryUpdate: (args: { id: string; patch: UpdateGameInput }) =>
    ipcRenderer.invoke('library:update', args),
  libraryRemove: (id: string) => ipcRenderer.invoke('library:remove', id),
  libraryLaunch: (id: string) => ipcRenderer.invoke('library:launch', id),
  pickExe: () => ipcRenderer.invoke('pick-exe'),
  pickCover: () => ipcRenderer.invoke('pick-cover'),
  coverFromUrl: (url: string) => ipcRenderer.invoke('cover-from-url', url),
};

contextBridge.exposeInMainWorld('api', api);
