/**
 * Desktop profile boot: resolve the `desktop` profile under the Harness home,
 * stack its bundle layers (base + web-app + desktop-app) plus the user patch
 * layers, and settle the Cordis tree inside the Electron main process.
 */

import { writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Context } from '@deepseek-ai/cordis'
import {
  boot,
  composeEntries,
  healProfilesModuleFallback,
  loadLayeredEnv,
  loadOptionalPatches,
  loadProfile,
  PROFILE_PATCH_FILENAME,
} from '@deepseek-ai/dsh-app-boot'
import { provideCmdline } from '@deepseek-ai/dsh-cmdline'
import { resolveDshHome } from '@deepseek-ai/dsh-home-paths'
import { DSH_LAUNCH_ENVIRONMENT_KEY } from '@deepseek-ai/dsh-launch-environment'
import type { PatchOptions } from '@deepseek-ai/cordis-plugin-include'
import type { EntryOptions } from '@deepseek-ai/cordis-plugin-loader'

const NAME = 'dsh'
const PROFILE = 'desktop'

/** This app's package.json, from either the source or built layout. */
export const INSTALL_ANCHOR = fileURLToPath(new URL('../package.json', import.meta.url))

/** Root config filename inside a profile directory. */
const PROFILE_ROOT_FILENAME = 'cordis.yml'

/** The empty root entry list every profile tree patches over. */
const PROFILE_ROOT_CONFIG = `# dsh profile root — an empty entry list. The tree is composed as patches:
# each bundle in package.json's dsh.profile.bundles, then cordis.patch.yml, then any
# --patch overlays. Edit cordis.patch.yml, not this file.
[]
`

/** The session-telemetry row id the DSH_TELEMETRY_DISABLED switch targets. */
const TELEMETRY_ROW_ID = 'session-telemetry-otel'

/** Shipped agent-preset root, resolved through the CLI app package in source and packaged layouts. */
function shippedPresetRoot(): string {
  const require = createRequire(INSTALL_ANCHOR)
  const cliRoot = dirname(require.resolve('@deepseek-ai/dsh/package.json'))
  return join(cliRoot, 'config', 'agent-presets')
}

/** A settled desktop harness: the live root context and its disposer. */
export interface DesktopHarness {
  ctx: Context
  dispose(): Promise<void>
}

/**
 * Resolve the telemetry opt-out switch into its boot patch, mirroring the
 * CLI's privacy posture: any non-empty value disables.
 * @param disabledEnv - the raw `DSH_TELEMETRY_DISABLED` value.
 * @param hasRow - whether the composed tree carries the telemetry row.
 * @returns the disable patch, or `undefined` when no hard-disable patch is required.
 */
function resolveTelemetryPatch(disabledEnv: string | undefined, hasRow: boolean): PatchOptions | undefined {
  if ((disabledEnv ?? '') === '' || !hasRow) return undefined
  return { id: TELEMETRY_ROW_ID, disabled: true }
}

/**
 * Boot the desktop profile end to end.
 * @param args - the invocation's inner arguments, handed to the tree through `ctx.cmdlineArgs`.
 * @param onExit - the app-owned exit request, invoked after the tree disposes.
 * @returns the settled root context.
 */
export async function startDesktopHarness(
  args: readonly string[],
  onExit: (code: number) => void,
): Promise<DesktopHarness> {
  console.log('[desktop] healing profile module fallback')
  healProfilesModuleFallback(INSTALL_ANCHOR)
  console.log('[desktop] resolving desktop profile')
  const profile = loadProfile(NAME, PROFILE, INSTALL_ANCHOR)
  const rootConfig = join(profile.dir, PROFILE_ROOT_FILENAME)
  writeFileSync(rootConfig, PROFILE_ROOT_CONFIG)

  const bundlePatches = profile.layers.flatMap(layer => layer.patches)
  const homePatches = loadOptionalPatches(NAME, join(resolveDshHome(), PROFILE_PATCH_FILENAME)) ?? []
  const rows = new Map<string, EntryOptions>()
  for (const row of composeEntries([bundlePatches, profile.patches, homePatches])) {
    if (typeof row.id === 'string') rows.set(row.id, row)
  }
  const overlays: PatchOptions[] = []
  if (rows.has('agent-presets')) {
    overlays.push({
      id: 'agent-presets',
      config: {
        ...(rows.get('agent-presets')?.config ?? {}) as Record<string, unknown>,
        roots: [{ path: shippedPresetRoot(), trust: 'system' }],
      },
    })
  }
  const telemetryPatch = resolveTelemetryPatch(process.env.DSH_TELEMETRY_DISABLED, rows.has(TELEMETRY_ROW_ID))
  if (telemetryPatch !== undefined) overlays.push(telemetryPatch)

  console.log('[desktop] booting cordis tree')
  const ctx = await boot(NAME, rootConfig, structuredClone([
    ...bundlePatches,
    ...profile.patches,
    ...homePatches,
    ...overlays,
  ]), (hostCtx) => {
    hostCtx.provide(DSH_LAUNCH_ENVIRONMENT_KEY, loadLayeredEnv(NAME))
    provideCmdline(hostCtx, {
      args: [...args],
      exit: (code) => { onExit(code) },
    })
  })
  console.log('[desktop] cordis tree settled')
  return {
    ctx,
    dispose: () => ctx.fiber.dispose(),
  }
}
