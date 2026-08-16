/**
 * Structured-clone wire contract between the Electron main process and the
 * preload bridge. Values must stay plain JSON-safe data: IPC is the boundary.
 */

import type { ServerRequest } from '@deepseek-ai/dsh-host-apiproxy/api'

/** One renderer-initiated API fetch. */
export interface DesktopFetchPayload {
  requestId: string
  url: string
  method: string
  headers: Record<string, string>
  body?: string
}

/** A completed API fetch. */
export interface DesktopFetchResult {
  status: number
  statusText: string
  headers: Record<string, string>
  body: string
}

/** The two server-push event streams. */
export type DesktopStreamKind = 'mux' | 'host'

/** A main-process push on one event stream. */
export type DesktopStreamPush =
  | { kind: 'frame'; streamId: string; message: ServerRequest }
  | { kind: 'end'; streamId: string }

/** A renderer-requested native download (session-log export). */
export interface DesktopDownloadRequest {
  /** Host URL under `/api`. */
  url: string
  /** Suggested save filename. */
  filename: string
}
