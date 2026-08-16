/** Desktop IPC transport: fetch serialization, cancellation, and both stream pumps. */

import { describe, expect, it, vi } from 'vitest'
import { RpcId, type ServerRequest } from '../src/client/api.ts'
import {
  DesktopApiClient,
  type DesktopBridge,
  type DesktopFetchResponse,
  type DesktopStreamEvent,
} from '../src/client/desktop.ts'
import { createDesktopConnectionRpc } from '../src/client/rpc.ts'

interface Deferred<T> {
  promise: Promise<T>
  resolve(value: T): void
  reject(error: unknown): void
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

function fakeBridge(overrides: Partial<DesktopBridge> = {}): {
  bridge: DesktopBridge
  fetch: ReturnType<typeof vi.fn>
  openStream: ReturnType<typeof vi.fn>
  closeStream: ReturnType<typeof vi.fn>
  onStreamEvent: ReturnType<typeof vi.fn>
} {
  const fetch = vi.fn(async (): Promise<DesktopFetchResponse> => ({
    status: 200,
    statusText: 'OK',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ accepted: true }),
  }))
  const openStream = vi.fn(async () => 's1')
  const closeStream = vi.fn(async () => undefined)
  const onStreamEvent = vi.fn(() => () => {})
  const bridge: DesktopBridge = {
    fetch,
    openStream,
    closeStream,
    onStreamEvent,
    abort: vi.fn(),
    loadBundle: vi.fn(async () => ''),
    download: vi.fn(async () => undefined),
    ...overrides,
  }
  return {
    bridge,
    fetch: bridge.fetch as typeof fetch,
    openStream: bridge.openStream as typeof openStream,
    closeStream: bridge.closeStream as typeof closeStream,
    onStreamEvent: bridge.onStreamEvent as typeof onStreamEvent,
  }
}

const clientResponse = {
  type: 'client-response' as const,
  rpcId: RpcId('r1'),
  result: { ok: true as const, value: {} },
}

describe('DesktopApiClient', () => {
  it('routes respond through the bridge as a serialized /api/respond POST', async () => {
    const { bridge, fetch } = fakeBridge()
    const client = new DesktopApiClient(bridge)
    await expect(client.respond(clientResponse)).resolves.toEqual({ accepted: true })
    expect(fetch).toHaveBeenCalledTimes(1)
    const [payload] = fetch.mock.calls[0] as [Parameters<DesktopBridge['fetch']>[0]]
    expect(payload?.url).toBe('http://dsh.desktop/api/respond')
    expect(payload?.method).toBe('POST')
    expect(JSON.parse(payload?.body ?? '')).toMatchObject({ type: 'client-response', rpcId: 'r1' })
  })

  it('rejects immediately when the caller signal already aborted', async () => {
    const { bridge } = fakeBridge()
    const client = new DesktopApiClient(bridge)
    await expect(client.respond(clientResponse, AbortSignal.abort())).rejects.toThrow(/aborted/i)
  })

  it('rejects on mid-flight abort and asks the main process to cancel the request', async () => {
    const pending = deferred<DesktopFetchResponse>()
    const abort = vi.fn(() => { pending.reject(new Error('cancelled')) })
    const { bridge } = fakeBridge({ fetch: vi.fn(() => pending.promise), abort })
    const client = new DesktopApiClient(bridge)
    const controller = new AbortController()
    const promise = client.respond(clientResponse, controller.signal)
    controller.abort()
    await expect(promise).rejects.toThrow(/aborted/i)
    expect(abort).toHaveBeenCalled()
  })

  it('yields mux frames, fires onOpen, and closes the stream on end', async () => {
    let listener: ((event: DesktopStreamEvent) => void) | undefined
    const { bridge, closeStream } = fakeBridge({
      onStreamEvent: vi.fn((callback) => {
        listener = callback
        return () => {}
      }),
    })
    const client = new DesktopApiClient(bridge)
    let opened = false
    const iterator = client.events.mux({}, new AbortController().signal, () => { opened = true })[Symbol.asyncIterator]()
    const first = iterator.next()
    const message: ServerRequest = {
      type: 'server-request',
      rpcId: RpcId('f1'),
      method: 'stream/error',
      payload: { type: 'stream/error', error: { code: 'internal', message: 'x', details: {} } },
    }
    listener?.({ kind: 'frame', streamId: 's1', message })
    listener?.({ kind: 'end', streamId: 's1' })
    await expect(first).resolves.toEqual({ done: false, value: { rpcId: RpcId('f1'), payload: message.payload } })
    await expect(iterator.next()).resolves.toEqual({ done: true, value: undefined })
    expect(opened).toBe(true)
    expect(closeStream).toHaveBeenCalledWith('s1')
  })

  it('drops malformed host frames, ends on abort, and tolerates a failing close', async () => {
    let listener: ((event: DesktopStreamEvent) => void) | undefined
    const { bridge, closeStream } = fakeBridge({
      onStreamEvent: vi.fn((callback) => {
        listener = callback
        return () => {}
      }),
      closeStream: vi.fn(async () => { throw new Error('stream gone') }),
    })
    const client = new DesktopApiClient(bridge)
    const controller = new AbortController()
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const iterator = client.events.host({}, controller.signal)[Symbol.asyncIterator]()
    const first = iterator.next()
    listener?.({
      kind: 'frame',
      streamId: 's1',
      message: { type: 'server-request', rpcId: RpcId('bad'), method: 'nope', payload: { type: 'nope' } },
    } as unknown as DesktopStreamEvent)
    controller.abort()
    await expect(first).resolves.toEqual({ done: true, value: undefined })
    expect(errorSpy).toHaveBeenCalled()
    expect(closeStream).toHaveBeenCalledWith('s1')
    errorSpy.mockRestore()
  })

  it('surfaces an openStream failure through the generator', async () => {
    const { bridge } = fakeBridge({
      openStream: vi.fn(async () => { throw new Error('no stream') }),
    })
    const client = new DesktopApiClient(bridge)
    const iterator = client.events.mux({}, new AbortController().signal)[Symbol.asyncIterator]()
    await expect(iterator.next()).rejects.toThrow('no stream')
  })

  it('routes generic connection RPC through the bridge with rpcId echo validation', async () => {
    const { bridge, fetch } = fakeBridge({
      fetch: vi.fn(async (request) => {
        const message = JSON.parse(request.body ?? '{}') as { rpcId: string }
        return {
          status: 200,
          statusText: 'OK',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            type: 'server-response',
            rpcId: message.rpcId,
            result: { ok: true, value: { pong: 1 } },
          }),
        }
      }),
    })
    const rpc = createDesktopConnectionRpc(bridge)
    await expect(rpc.call('/plugin', 'list', {})).resolves.toEqual({ ok: true, value: { pong: 1 } })
    const [request] = fetch.mock.calls[0] as unknown as [Parameters<DesktopBridge['fetch']>[0]]
    expect(request?.url).toContain('/plugin/list')
    expect(request?.method).toBe('POST')
  })

  it('rejects an invalid generic RPC target before touching the bridge', async () => {
    const { bridge, fetch } = fakeBridge()
    const rpc = createDesktopConnectionRpc(bridge)
    await expect(rpc.call('not-a-channel', '', {})).rejects.toThrow(/invalid RPC target/)
    expect(fetch).not.toHaveBeenCalled()
  })
})
