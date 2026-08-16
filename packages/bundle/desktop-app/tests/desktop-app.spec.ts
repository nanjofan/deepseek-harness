/** Desktop bundle patch composition over dsh-web-app plus the runtime glue service. */

import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as yaml from 'js-yaml'
import { Context } from '@deepseek-ai/cordis'
import { applyEntryPatches, entryListSchema, type PatchOptions } from '@deepseek-ai/cordis-plugin-include'
import { RpcId, type ApiProxy, type RpcRequest, type MuxFrame, type HostFrame } from '@deepseek-ai/dsh-host-apiproxy/api'
import type { ClientModuleRegistry } from '@deepseek-ai/dsh-client-modules'
import { afterEach, describe, expect, it } from 'vitest'
import { apply } from '../src/index.ts'

function patchFile(packageRoot: string, name: string): PatchOptions[] {
  const text = readFileSync(join(packageRoot, name), 'utf8')
  return yaml.load(text, { schema: entryListSchema }) as PatchOptions[]
}

const webRoot = fileURLToPath(new URL('../../web-app/', import.meta.url))
const desktopRoot = fileURLToPath(new URL('../', import.meta.url))

describe('desktop-app bundle patch', () => {
  it('disables the web carriers and mounts the desktop runtime over the web roster', () => {
    const rows = applyEntryPatches([], [
      ...patchFile(webRoot, 'cordis.patch.yml'),
      ...patchFile(desktopRoot, 'cordis.patch.yml'),
    ], () => {})
    const byId = new Map(rows.map(row => [row.id, row]))
    expect(byId.get('webserver')?.disabled).toBe(true)
    expect(byId.get('web-runtime')?.disabled).toBe(true)
    expect(byId.get('web-startup')?.disabled).toBe(true)
    expect(byId.get('client-hmr')?.disabled).toBe(true)
    expect(byId.get('directory-picker')?.disabled).toBe(true)
    expect(byId.get('directory-picker-browse')?.name).toBe('@deepseek-ai/dsh-host-directory-picker-browse')
    expect(byId.get('directory-picker-surface')?.name).toBe('@deepseek-ai/dsh-client-ui-directory-picker-browse')
    expect(byId.get('desktop-runtime')?.name).toBe('@deepseek-ai/dsh-desktop-app')
    const connection = byId.get('connection')
    expect(connection?.inject).toEqual([])
    expect(connection?.config).toEqual({ trustedHosts: [] })
  })
})

describe('desktop runtime glue', () => {
  let temp: string | undefined

  afterEach(() => {
    if (temp !== undefined) rmSync(temp, { recursive: true, force: true })
    temp = undefined
  })

  it('provides the graph, fetch, bundle reads, and both event streams to the shell', async () => {
    temp = mkdtempSync(join(tmpdir(), 'dsh-desktop-app-'))
    const bundlePath = join(temp, 'client.js')
    writeFileSync(bundlePath, 'module.exports = {}\n')
    const graph = { rev: 'r', entries: [{ id: 'pkg', url: '/plugins/pkg/client.js', rev: 'r' }] }
    const muxFrames: AsyncIterable<RpcRequest<MuxFrame>> = (async function* () {
      yield { rpcId: RpcId('m1'), payload: { type: 'stream/error', error: { code: 'internal', message: 'm', details: {} } } }
    })()
    const hostFrames: AsyncIterable<RpcRequest<HostFrame>> = (async function* () {
      yield { rpcId: RpcId('h1'), payload: { type: 'stream/error', error: { code: 'internal', message: 'h', details: {} } } }
    })()
    const apiProxy = {
      events: {
        mux: (_request: unknown, signal: AbortSignal) => {
          expect(signal.aborted).toBe(false)
          return muxFrames
        },
        host: (_request: unknown, signal: AbortSignal) => {
          expect(signal.aborted).toBe(false)
          return hostFrames
        },
      },
    } as unknown as ApiProxy
    const clientModules = {
      graph: () => graph,
      clientPath: (id: string) => id === 'pkg' ? bundlePath : undefined,
    } as unknown as ClientModuleRegistry

    const ctx = new Context()
    ctx.provide('apiProxy', apiProxy)
    ctx.provide('clientModules', clientModules)
    apply(ctx)

    const runtime = ctx.get('desktopRuntime')
    expect(runtime?.graph()).toBe(graph)
    await expect(runtime?.readBundle('pkg')).resolves.toBe('module.exports = {}\n')
    await expect(runtime?.readBundle('missing')).rejects.toThrow('unknown client bundle')
    const unknown = await runtime?.fetch(new Request('http://dsh.desktop/api/does-not-exist', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    }))
    expect(unknown?.status).toBe(404)

    const muxSignal = new AbortController().signal
    const mux = runtime?.mux(muxSignal)
    await expect(mux?.[Symbol.asyncIterator]().next()).resolves.toMatchObject({
      done: false,
      value: { rpcId: RpcId('m1') },
    })
    const hostSignal = new AbortController().signal
    const host = runtime?.host(hostSignal)
    await expect(host?.[Symbol.asyncIterator]().next()).resolves.toMatchObject({
      done: false,
      value: { rpcId: RpcId('h1') },
    })
  })
})
