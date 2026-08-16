/**
 * Electron IPC transport: the browser half of the desktop carrier. The
 * preload bridge (`window.dshDesktop`) forwards fetch to the main process's
 * in-process API gateway and pushes mux/host frames over IPC channels, so the
 * renderer needs neither HTTP nor WebSockets.
 */

import type { ApiProxy, HostFrame, MuxFrame, RpcRequest, ServerRequest } from './api.ts'
import { AbstractApiClient } from './api.ts'
import { hostFrameSchema, muxFrameSchema } from '@deepseek-ai/dsh-host-apiproxy/api/events.schema'
import { serverRequestSchema } from '@deepseek-ai/dsh-host-apiproxy/api/rpc.schema'

/** One renderer-initiated fetch request, serialized for structured-clone IPC. */
export interface DesktopFetchRequest {
  /** Renderer-minted correlation id used for cancellation. */
  requestId: string
  /** Absolute request URL (the origin is synthetic; only the path matters). */
  url: string
  method: string
  headers: Record<string, string>
  body?: string
}

/** A completed fetch response, serialized for structured-clone IPC. */
export interface DesktopFetchResponse {
  status: number
  statusText: string
  headers: Record<string, string>
  body: string
}

/** Server-push events delivered by the preload bridge. */
export type DesktopStreamEvent =
  | { kind: 'frame'; streamId: string; message: ServerRequest }
  | { kind: 'end'; streamId: string }

/** The `window.dshDesktop` surface exposed by the Electron preload. */
export interface DesktopBridge {
  /** One API fetch through the main process. */
  fetch(request: DesktopFetchRequest): Promise<DesktopFetchResponse>
  /** Open a mux or host stream; resolves to the main-process stream id. */
  openStream(kind: 'mux' | 'host'): Promise<string>
  /** Close a stream and stop its main-process pump. */
  closeStream(streamId: string): Promise<void>
  /** Subscribe to every stream event; returns the unsubscribe function. */
  onStreamEvent(listener: (event: DesktopStreamEvent) => void): () => void
  /** Cancel an in-flight fetch by its request id. */
  abort(requestId: string): void
  /** Load one client-plugin bundle's JavaScript source by its graph URL. */
  loadBundle(url: string): Promise<string>
  /** Download a host URL through the main process (session-log export etc.). */
  download(url: string, filename: string): Promise<void>
}

type Parser<F> = { parse(value: unknown): F }

type DesktopStreamItem<F> = { kind: 'frame'; envelope: RpcRequest<F> } | { kind: 'end' }

let nextRequestId = 0

/** Browser-side mirror of fetch's abort rejection. */
function abortError(signal: AbortSignal): Error {
  const reason: unknown = signal.reason
  if (reason instanceof Error) return reason
  if (typeof reason === 'string') return new Error(reason)
  return new Error('This operation was aborted')
}

/**
 * Run one browser-shaped fetch through the IPC bridge, mirroring fetch's
 * abort semantics: an aborted caller signal asks the main process to cancel
 * the in-flight request and rejects with the signal's reason.
 * @param bridge - the preload-exposed desktop transport.
 * @param input - absolute request URL (the origin is synthetic; only the path matters).
 * @param init - fetch options; the body must be a string when present.
 * @returns a real Response reconstructed from the serialized IPC result.
 */
export function bridgeFetch(
  bridge: DesktopBridge,
  input: URL,
  init?: RequestInit,
): Promise<Response> {
  const requestId = `dsh-${String(++nextRequestId)}`
  const headers = new Headers(init?.headers)
  const request: DesktopFetchRequest = {
    requestId,
    url: input.toString(),
    method: init?.method ?? 'GET',
    headers: Object.fromEntries(headers.entries()),
    ...typeof init?.body === 'string' ? { body: init.body } : {},
  }
  const signal = init?.signal ?? undefined
  if (signal === undefined) {
    return bridge.fetch(request).then(response =>
      new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: new Headers(response.headers),
      }))
  }
  if (signal.aborted) return Promise.reject(abortError(signal))
  return new Promise((resolve, reject) => {
    const onAbort = (): void => {
      bridge.abort(requestId)
      reject(abortError(signal))
    }
    signal.addEventListener('abort', onAbort, { once: true })
    bridge.fetch(request)
      .then((response) => {
        resolve(new Response(response.body, {
          status: response.status,
          statusText: response.statusText,
          headers: new Headers(response.headers),
        }))
      }, reject)
      .finally(() => {
        signal.removeEventListener('abort', onAbort)
      })
  })
}

/** Electron platform subclass: fetch and both streams ride the IPC bridge. */
export class DesktopApiClient extends AbstractApiClient {
  /** @param bridge - the preload-exposed desktop transport. */
  constructor(private readonly bridge: DesktopBridge, timeoutMs?: number) {
    super(timeoutMs)
  }

  /**
   * The page runs under file:// where `location.origin` is the string "null";
   * a synthetic authority keeps URL construction valid while the main process
   * routes on pathname only.
   */
  protected override resolveBase(): string {
    return 'http://dsh.desktop'
  }

  protected override doFetch(input: URL, init?: RequestInit): Promise<Response> {
    return bridgeFetch(this.bridge, input, init)
  }

  protected override openMux(
    _payload: Parameters<ApiProxy['events']['mux']>[0]['payload'],
    signal: AbortSignal,
    onOpen?: () => void,
  ): AsyncIterable<RpcRequest<MuxFrame>> {
    return this.readStream('mux', signal, muxFrameSchema, onOpen)
  }

  protected override openHost(
    _payload: Parameters<ApiProxy['events']['host']>[0]['payload'],
    signal: AbortSignal,
    onOpen?: () => void,
  ): AsyncIterable<RpcRequest<HostFrame>> {
    return this.readStream('host', signal, hostFrameSchema, onOpen)
  }

  private async *readStream<F extends MuxFrame | HostFrame>(
    kind: 'mux' | 'host',
    signal: AbortSignal,
    schema: Parser<F>,
    onOpen?: () => void,
  ): AsyncGenerator<RpcRequest<F>> {
    const inbox: DesktopStreamItem<F>[] = []
    let wake: (() => void) | undefined
    let ended = false
    let streamId: string | undefined
    const early: DesktopStreamEvent[] = []
    const enqueue = (item: DesktopStreamItem<F>): void => {
      inbox.push(item)
      wake?.()
      wake = undefined
    }
    const handleEvent = (event: DesktopStreamEvent): void => {
      if (event.kind === 'end') {
        ended = true
        enqueue({ kind: 'end' })
        return
      }
      let full: ServerRequest
      let frame: F
      try {
        full = serverRequestSchema.parse(event.message)
        frame = schema.parse(full.payload)
      } catch (error) {
        console.error(`[client-connection] dropping malformed desktop stream frame on ${kind}:`, error)
        return
      }
      this.onEnvelope(full)
      enqueue({ kind: 'frame', envelope: { rpcId: full.rpcId, payload: frame } })
    }
    // Subscribe before openStream so frames emitted while the main process
    // starts the pump are buffered instead of lost (mux baselines arrive
    // immediately on open).
    const unsubscribe = this.bridge.onStreamEvent((event) => {
      if (streamId === undefined) {
        early.push(event)
        return
      }
      if (event.streamId !== streamId) return
      handleEvent(event)
    })
    const onAbort = (): void => { enqueue({ kind: 'end' }) }
    signal.addEventListener('abort', onAbort, { once: true })
    try {
      streamId = await this.bridge.openStream(kind)
      for (const event of early) {
        if (event.streamId === streamId) handleEvent(event)
      }
      early.length = 0
      if (signal.aborted) onAbort()
      onOpen?.()
      while (true) {
        while (inbox.length > 0) {
          const item = inbox.shift() as DesktopStreamItem<F>
          if (item.kind === 'end') return
          yield item.envelope
        }
        if (ended) return
        await new Promise<void>((resolve) => { wake = resolve })
      }
    } finally {
      signal.removeEventListener('abort', onAbort)
      unsubscribe()
      if (streamId !== undefined) {
        void this.bridge.closeStream(streamId).catch(() => undefined)
      }
    }
  }
}
