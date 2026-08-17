/**
 * Electron main process for the DeepSeek Harness desktop shell: boots the
 * desktop profile in-process, wires the renderer's IPC bridge to
 * `ctx.desktopRuntime`, and owns the window and shutdown lifecycle.
 */

import { randomUUID } from 'node:crypto'
import { writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { inspect } from 'node:util'
import { fileURLToPath } from 'node:url'
import { app, BrowserWindow, dialog, ipcMain } from 'electron'
import type { HostFrame, MuxFrame, RpcError, RpcRequest, ServerRequest } from '@deepseek-ai/dsh-host-apiproxy/api'
import { RpcId } from '@deepseek-ai/dsh-host-apiproxy'
import type { DesktopRuntime } from '@deepseek-ai/dsh-desktop-app'
import { startDesktopHarness } from './boot.ts'
import type {
  DesktopDownloadRequest, DesktopFetchPayload, DesktopFetchResult, DesktopStreamKind, DesktopStreamPush,
} from './ipc.ts'

const __dirname = fileURLToPath(new URL('.', import.meta.url))

/** Resolve the built desktop frontend entry through the workspace package exports. */
function resolveDistIndex(): string {
  const require = createRequire(import.meta.url)
  try {
    return require.resolve('@deepseek-ai/dsh-web-frontend/dist-desktop/index.html')
  } catch {
    throw new Error('desktop: frontend desktop dist not built; run `pnpm run build:desktop` from the repository root first')
  }
}

/** Convert a narrow server frame into its full ServerRequest wire form. */
function serverRequest(frame: RpcRequest<MuxFrame | HostFrame>): ServerRequest {
  return {
    type: 'server-request',
    rpcId: frame.rpcId,
    method: frame.payload.type,
    payload: frame.payload,
  }
}

/** A stream/error frame for a pump failure, so the client can surface it. */
function failureServerRequest(error: unknown): ServerRequest {
  const rpcError: RpcError = { code: 'internal', message: String(error), details: {} }
  return {
    type: 'server-request',
    rpcId: RpcId(randomUUID()),
    method: 'stream/error',
    payload: { type: 'stream/error', error: rpcError },
  }
}

/** Parse a `/plugins/<id>/client.js` graph URL into its bundle id. */
function bundleIdFromUrl(url: string): string {
  const pathname = new URL(url, 'http://dsh.desktop').pathname
  const prefix = '/plugins/'
  const suffix = '/client.js'
  if (!pathname.startsWith(prefix) || !pathname.endsWith(suffix)) {
    throw new Error(`desktop: not a client bundle URL: ${url}`)
  }
  return decodeURIComponent(pathname.slice(prefix.length, -suffix.length))
}

/** Wire the renderer IPC bridge to one settled desktop runtime. */
function registerIpc(runtime: DesktopRuntime): void {
  const fetchControllers = new Map<string, AbortController>()
  const streams = new Map<string, AbortController>()

  ipcMain.on('dsh:boot-graph', (event) => {
    event.returnValue = runtime.graph()
  })

  ipcMain.handle('dsh:fetch', async (_event, payload: DesktopFetchPayload): Promise<DesktopFetchResult> => {
    const url = new URL(payload.url)
    if (!url.pathname.startsWith('/api/')) {
      throw new Error(`desktop: fetch outside /api refused: ${url.pathname}`)
    }
    const controller = new AbortController()
    fetchControllers.set(payload.requestId, controller)
    try {
      const response = await runtime.fetch(new Request(url, {
        method: payload.method,
        headers: new Headers(payload.headers),
        signal: controller.signal,
        ...payload.body === undefined ? {} : { body: payload.body },
      }))
      return {
        status: response.status,
        statusText: response.statusText,
        headers: Object.fromEntries(response.headers.entries()),
        body: await response.text(),
      }
    } finally {
      fetchControllers.delete(payload.requestId)
    }
  })

  ipcMain.on('dsh:abort', (_event, requestId: string) => {
    fetchControllers.get(requestId)?.abort()
  })

  ipcMain.handle('dsh:load-bundle', (_event, url: string): Promise<string> =>
    runtime.readBundle(bundleIdFromUrl(url)))

  ipcMain.handle('dsh:download', async (_event, payload: DesktopDownloadRequest): Promise<void> => {
    const url = new URL(payload.url)
    if (!url.pathname.startsWith('/api/')) {
      throw new Error(`desktop: download outside /api refused: ${url.pathname}`)
    }
    const response = await runtime.fetch(new Request(url, { method: 'GET' }))
    if (!response.ok) throw new Error(`desktop: download failed with HTTP ${response.status}`)
    const bytes = Buffer.from(await response.arrayBuffer())
    const { canceled, filePath } = await dialog.showSaveDialog({
      defaultPath: join(app.getPath('downloads'), payload.filename),
    })
    if (canceled || filePath === undefined) return
    await writeFile(filePath, bytes)
  })

  ipcMain.handle('dsh:stream-open', (event, kind: DesktopStreamKind): string => {
    const streamId = randomUUID()
    const abort = new AbortController()
    streams.set(streamId, abort)
    const frames = kind === 'mux' ? runtime.mux(abort.signal) : runtime.host(abort.signal)
    void (async () => {
      try {
        for await (const frame of frames) {
          if (abort.signal.aborted || event.sender.isDestroyed()) break
          event.sender.send('dsh:stream-push', {
            kind: 'frame',
            streamId,
            message: serverRequest(frame),
          } satisfies DesktopStreamPush)
        }
      } catch (error) {
        if (!abort.signal.aborted && !event.sender.isDestroyed()) {
          event.sender.send('dsh:stream-push', {
            kind: 'frame',
            streamId,
            message: failureServerRequest(error),
          } satisfies DesktopStreamPush)
        }
      } finally {
        abort.abort()
        streams.delete(streamId)
        if (!event.sender.isDestroyed()) {
          event.sender.send('dsh:stream-push', { kind: 'end', streamId } satisfies DesktopStreamPush)
        }
      }
    })()
    return streamId
  })

  ipcMain.handle('dsh:stream-close', (_event, streamId: string): void => {
    streams.get(streamId)?.abort()
    streams.delete(streamId)
  })
}

let harnessDispose: (() => Promise<void>) | undefined
let quitting = false

async function quit(): Promise<void> {
  if (quitting) return
  quitting = true
  try {
    await harnessDispose?.()
  } finally {
    app.exit(0)
  }
}

/** Create the application window loading the built desktop frontend. */
function createWindow(): void {
  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 960,
    minHeight: 640,
    title: 'DeepSeek Harness',
    backgroundColor: '#0f1115',
    webPreferences: {
      preload: join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  win.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith('file://')) event.preventDefault()
  })
  void win.loadFile(resolveDistIndex())
}

void app.whenReady().then(async () => {
  try {
    console.log('[desktop] booting harness')
    const harness = await startDesktopHarness(
      process.argv.slice(app.isPackaged ? 1 : 2),
      (code) => { void quit().then(() => app.exit(code)) },
    )
    harnessDispose = harness.dispose
    console.log('[desktop] harness ready')
    const runtime = harness.ctx.get('desktopRuntime')
    if (runtime === undefined) throw new Error('desktop-app: desktopRuntime service missing after boot')
    registerIpc(runtime)
    console.log('[desktop] creating window')
    createWindow()
  } catch (error) {
    // Expand nested causes (boot wraps AggregateError) so the real failing
    // entries are visible in the dialog and stderr.
    const detail = inspect(error, { depth: null, colors: false, maxArrayLength: 50 })
    console.error('[desktop] failed to start:', detail)
    dialog.showErrorBox('DeepSeek Harness failed to start', detail)
    app.exit(1)
  }
})

app.on('window-all-closed', () => {
  void quit()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})
