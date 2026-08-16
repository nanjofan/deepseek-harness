/**
 * Electron preload: exposes the boot graph and the IPC fetch/stream bridge to
 * the renderer's isolated main world. Runs under `sandbox: true`, so it only
 * uses the `electron` surface and plain IPC.
 */

import { contextBridge, ipcRenderer } from 'electron'
import type {
  DesktopDownloadRequest, DesktopFetchPayload, DesktopFetchResult, DesktopStreamKind, DesktopStreamPush,
} from './ipc.ts'

contextBridge.exposeInMainWorld('__DSH_BOOT__', ipcRenderer.sendSync('dsh:boot-graph'))

contextBridge.exposeInMainWorld('dshDesktop', {
  fetch: (request: DesktopFetchPayload): Promise<DesktopFetchResult> =>
    ipcRenderer.invoke('dsh:fetch', request),
  openStream: (kind: DesktopStreamKind): Promise<string> =>
    ipcRenderer.invoke('dsh:stream-open', kind),
  closeStream: (streamId: string): Promise<void> =>
    ipcRenderer.invoke('dsh:stream-close', streamId),
  onStreamEvent: (listener: (event: DesktopStreamPush) => void): (() => void) => {
    const handler = (_event: unknown, push: DesktopStreamPush): void => { listener(push) }
    ipcRenderer.on('dsh:stream-push', handler)
    return () => { ipcRenderer.removeListener('dsh:stream-push', handler) }
  },
  abort: (requestId: string): void => {
    ipcRenderer.send('dsh:abort', requestId)
  },
  loadBundle: (url: string): Promise<string> =>
    ipcRenderer.invoke('dsh:load-bundle', url),
  download: (request: DesktopDownloadRequest): Promise<void> =>
    ipcRenderer.invoke('dsh:download', request),
})
