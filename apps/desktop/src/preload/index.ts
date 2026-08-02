import { contextBridge, ipcRenderer } from 'electron';
import type {
  CreateGameInput,
  DesktopApi,
  LaunchRequest,
  StoreId,
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
  libraryLaunchSource: (sourceId: string) => ipcRenderer.invoke('library:launch-source', sourceId),
  libraryMergeSources: (args: { targetGameId: string; sourceIds: string[] }) =>
    ipcRenderer.invoke('library:merge-sources', args),
  librarySeparateSource: (sourceId: string) => ipcRenderer.invoke('library:separate-source', sourceId),
  libraryPossibleDuplicates: () => ipcRenderer.invoke('library:possible-duplicates'),
  pickExe: () => ipcRenderer.invoke('pick-exe'),
  pickCover: () => ipcRenderer.invoke('pick-cover'),
  coverFromUrl: (url: string) => ipcRenderer.invoke('cover-from-url', url),
  coversDownloadMissing: () => ipcRenderer.invoke('covers:download-missing'),
  steamStatus: () => ipcRenderer.invoke('steam:status'),
  steamScan: () => ipcRenderer.invoke('steam:scan'),
  steamSetPath: (path: string) => ipcRenderer.invoke('steam:set-path', path),
  storeStatus: (id: StoreId) => ipcRenderer.invoke(`${id}:status`),
  storeScan: (id: StoreId) => ipcRenderer.invoke(`${id}:scan`),
  providersList: () => ipcRenderer.invoke('providers:list'),
  providersSyncAll: () => ipcRenderer.invoke('providers:sync-all'),
};

contextBridge.exposeInMainWorld('api', api);
