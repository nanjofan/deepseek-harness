/**
 * @deepseek-ai/dsh-desktop-app — the desktop-surface bundle's runtime glue
 * plus its patch layer. The plugin provides {@link DesktopRuntime} to the
 * Electron main process: the composed browser graph, an in-process API fetch
 * handler, client-bundle reads, and the two server-push event streams. The
 * patch layer rides over dsh-base + dsh-web-app and disables every HTTP /
 * WebSocket carrier row.
 *
 * @module @deepseek-ai/dsh-desktop-app
 */

import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/cordis-plugin-loader'
import type { HostFrame, MuxFrame, RpcRequest } from '@deepseek-ai/dsh-host-apiproxy/api'
import { RpcId, toFetchHandler } from '@deepseek-ai/dsh-host-apiproxy'
import type {} from '@deepseek-ai/dsh-client-modules'
import type { WebBootGraph } from '@deepseek-ai/dsh-client-modules'

/** Stable Cordis plugin name. */
export const name = 'desktop-app'

/** Services required before the desktop runtime can be provided. */
export const inject = ['apiProxy', 'clientModules']

/** The host face the Electron shell wires to IPC. */
export interface DesktopRuntime {
  /** Current composed `window.__DSH_BOOT__` entry graph. */
  graph(): WebBootGraph
  /** One in-process API request through the shared gateway fetch handler. */
  fetch(request: Request): Promise<Response>
  /** JavaScript source of one client bundle by graph id. */
  readBundle(id: string): Promise<string>
  /** The all-session mux frame stream. */
  mux(signal: AbortSignal): AsyncIterable<RpcRequest<MuxFrame>>
  /** The host-level frame stream. */
  host(signal: AbortSignal): AsyncIterable<RpcRequest<HostFrame>>
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Desktop runtime facts and carriers consumed by the Electron main process. */
    desktopRuntime: DesktopRuntime
  }
}

/**
 * Mount the desktop runtime glue over the composed host tree.
 * @param ctx - host context carrying the API gateway and client module table.
 */
export function apply(ctx: Context): void {
  ctx.provide('desktopRuntime', {
    graph: () => ctx.clientModules.graph(),
    fetch: request => toFetchHandler(ctx.apiProxy).fetch(request),
    readBundle: async (id) => {
      const path = ctx.clientModules.clientPath(id)
      if (path === undefined) throw new Error(`desktop-app: unknown client bundle ${JSON.stringify(id)}`)
      return readFile(path, 'utf8')
    },
    mux: signal => ctx.apiProxy.events.mux({ rpcId: RpcId(randomUUID()), payload: {} }, signal),
    host: signal => ctx.apiProxy.events.host({ rpcId: RpcId(randomUUID()), payload: {} }, signal),
  })
}
