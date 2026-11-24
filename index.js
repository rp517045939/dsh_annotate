/**
 * dsh-annotate — host half.
 *
 * The plugin is browser-only. This empty `apply` exists so the plugin can be
 * mounted by the Cordis loader / profile tree; the browser module ships through
 * `exports["./client"]` and is discovered from `dsh.client` in package.json.
 */

export const name = 'dsh-annotate'

export function apply() {
  // No host-side behavior. Reserved for a future `/api/annotate` store.
}
