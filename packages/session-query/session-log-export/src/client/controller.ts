/** Browser download state shared by the Session Header button and `/export`. */

import { createSnapshotStore, type SessionId, type SnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'

/** Download phases presented by the shared modal. */
export type SessionLogDownloadStatus = 'downloading' | 'success' | 'error'

/** One Session's current download-dialog state. */
export interface SessionLogDownloadEntry {
  readonly open: boolean
  readonly status: SessionLogDownloadStatus
  readonly error: string | null
}

/** Download states keyed by the Session whose Header owns the dialog. */
export interface SessionLogDownloadState {
  bySession: Record<string, SessionLogDownloadEntry | undefined>
}

type Fetch = (input: string | URL, init?: RequestInit) => Promise<Response>
type Save = (url: string, filename: string) => void | Promise<void>

/** Electron preload bridge surface the download controller adapts to. */
interface DesktopDownloadBridge {
  fetch(request: {
    requestId: string
    url: string
    method: string
    headers: Record<string, string>
    body?: string
  }): Promise<{ status: number; statusText: string; headers: Record<string, string>; body: string }>
  download(url: string, filename: string): Promise<void>
}

function desktopBridge(): DesktopDownloadBridge | undefined {
  return (globalThis as { dshDesktop?: DesktopDownloadBridge }).dshDesktop
}

/** Serialize a browser fetch call through the Electron IPC bridge. */
function desktopFetch(input: string | URL, init?: RequestInit): Promise<Response> {
  const bridge = desktopBridge()
  if (bridge === undefined) return fetch(input, init)
  const url = typeof input === 'string' ? new URL(input, hostBase()) : input
  const headers = new Headers(init?.headers)
  return bridge.fetch({
    requestId: `dsh-download-${Math.random().toString(36).slice(2)}`,
    url: url.toString(),
    method: init?.method ?? 'GET',
    headers: Object.fromEntries(headers.entries()),
    ...typeof init?.body === 'string' ? { body: init.body } : {},
  }).then(response => new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: new Headers(response.headers),
  }))
}

/** Default save: the browser download manager, or the Electron main process dialog. */
function defaultSave(url: string, filename: string): void | Promise<void> {
  const bridge = desktopBridge()
  if (bridge !== undefined) {
    void bridge.download(url, filename)
    return
  }
  downloadUrl(url, filename)
}

const INITIAL: SessionLogDownloadState = { bySession: {} }

/**
 * Collapse an untrusted Session id into the filename convention owned by the host endpoint.
 * @param sessionId - Session whose archive is downloaded.
 * @returns one safe browser download filename.
 */
export function sessionLogZipFilename(sessionId: SessionId): string {
  return `dsh-session-${String(sessionId).replace(/[^A-Za-z0-9_-]/g, '_')}.zip`
}

/**
 * Hand a Host download URL to the browser download manager.
 * @param url - same-origin Host download URL.
 * @param filename - browser download filename.
 */
export function downloadUrl(url: string, filename: string): void {
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
}

/** Resolve the browser's Host base with the connection carrier's null-origin fallback. */
function hostBase(): string {
  const origin = (globalThis as { location?: { origin?: string } }).location?.origin
  return origin !== undefined && origin !== 'null' ? origin : 'http://dsh.internal'
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/** Owns one in-flight browser download per Session and publishes modal state. */
export class SessionLogDownloadController {
  /** uSES-safe state source shared by every Session-scoped modal contribution. */
  readonly store: SnapshotStore<SessionLogDownloadState> = createSnapshotStore(INITIAL)

  private readonly active = new Map<SessionId, { readonly abort: AbortController; readonly done: Promise<void> }>()
  private disposed = false

  /**
   * @param fetcher - HTTP carrier used to read the host-streamed ZIP.
   * @param save - browser save operation.
   */
  constructor(
    private readonly fetcher: Fetch = desktopFetch,
    private readonly save: Save = defaultSave,
  ) {}

  /**
   * Download one Session tree; concurrent gestures for the same Session share one operation.
   * @param sessionId - root Session whose ZIP includes descendants and attachments.
   * @returns after the browser save starts, an error state is published, or a late post-disposal request is ignored.
   */
  download(sessionId: SessionId): Promise<void> {
    const existing = this.active.get(sessionId)
    if (existing !== undefined) return existing.done
    if (this.disposed) return Promise.resolve()
    const abort = new AbortController()
    const done = this.run(sessionId, abort.signal).finally(() => {
      this.active.delete(sessionId)
    })
    this.active.set(sessionId, { abort, done })
    return done
  }

  /**
   * Close one Session's dialog without cancelling an in-flight browser download.
   * @param sessionId - Session whose modal closes.
   */
  dismiss(sessionId: SessionId): void {
    const current = this.store.getSnapshot().bySession[String(sessionId)]
    if (current === undefined || !current.open) return
    this.publish(sessionId, { ...current, open: false })
  }

  /**
   * Abort active fetches and reach quiescence.
   * @returns after every active operation settles.
   */
  async dispose(): Promise<void> {
    this.disposed = true
    const active = [...this.active.values()]
    for (const operation of active) operation.abort.abort()
    await Promise.allSettled(active.map(operation => operation.done))
  }

  private async run(sessionId: SessionId, signal: AbortSignal): Promise<void> {
    this.publish(sessionId, { open: true, status: 'downloading', error: null })
    try {
      const url = new URL('/api/session.export', hostBase())
      url.searchParams.set('sessionId', sessionId)
      url.searchParams.set('includeDescendants', 'true')
      const response = await this.fetcher(url, { method: 'HEAD', signal })
      if (!response.ok) {
        const detail = await response.text().catch(() => '')
        throw new Error(`Export failed: HTTP ${response.status}${detail === '' ? '' : ` ${detail}`}`)
      }
      this.save(url.toString(), sessionLogZipFilename(sessionId))
      const open = this.store.getSnapshot().bySession[String(sessionId)]?.open ?? true
      this.publish(sessionId, { open, status: 'success', error: null })
    } catch (error: unknown) {
      if (signal.aborted) return
      const open = this.store.getSnapshot().bySession[String(sessionId)]?.open ?? true
      this.publish(sessionId, { open, status: 'error', error: messageOf(error) })
    }
  }

  private publish(sessionId: SessionId, entry: SessionLogDownloadEntry): void {
    this.store.update((state) => {
      state.bySession = { ...state.bySession, [String(sessionId)]: entry }
    })
  }
}
