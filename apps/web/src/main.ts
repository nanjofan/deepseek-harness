/**
 * Web application entry: thin bootstrap over the shell library. Everything —
 * loader holding, module-table seeding, AppRoot gate, plugin assembly — lives
 * in @deepseek-ai/dsh-client-web; this file only finds the mount point.
 * Under Electron, the preload bridge also supplies the client-plugin bundle
 * loader, so /plugins bundles arrive over IPC instead of HTTP.
 */
import { AppWebEntry } from '@deepseek-ai/dsh-client-web'
import type { DesktopBridge } from '@deepseek-ai/dsh-client-connection/client'

const el = document.getElementById('root')
if (el === null) throw new Error('web app: missing #root')
const desktop = (globalThis as { dshDesktop?: DesktopBridge }).dshDesktop
void new AppWebEntry(el, desktop === undefined ? undefined : {
  loadBundle: async (url) => {
    const source = await desktop.loadBundle(url)
    const script = document.createElement('script')
    script.textContent = source
    document.head.append(script)
  },
}).run()
