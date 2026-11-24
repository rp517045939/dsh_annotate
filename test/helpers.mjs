/**
 * Test harness: load the browser module without a browser.
 *
 * client.js talks to `window.__ModuleLoader__` at load time and requires only
 * `react` inside its factory, so a pair of tiny stubs is enough to exercise the
 * pure helpers and the slot registration path.
 */

const REACT_STUB = {
  createElement: () => null,
  useState: (value) => [typeof value === 'function' ? value() : value, () => {}],
  useEffect: () => {},
  useRef: (value) => ({ current: value }),
  memo: (component) => component,
  Fragment: 'Fragment',
}

export async function loadClient() {
  let definition = null
  globalThis.window = {
    __ModuleLoader__: {
      load: (value) => { definition = value },
    },
    addEventListener: () => {},
    removeEventListener: () => {},
    innerWidth: 1280,
    innerHeight: 900,
  }
  const url = new URL('../client.js', import.meta.url)
  await import(url.href + '?case=' + Math.random().toString(36).slice(2))
  if (!definition) throw new Error('client.js did not call window.__ModuleLoader__.load')
  const mod = definition.factory(() => REACT_STUB)
  return { definition, mod }
}

export function translateWith(mod, locale) {
  const dict = mod.__test__.DICTS[locale || 'zh-CN']
  return (key, params) => mod.__test__.format(dict[key] === undefined ? key : dict[key], params)
}

export function note(overrides) {
  return {
    id: 'n-' + Math.random().toString(36).slice(2),
    sessionId: 's1',
    messageId: '4f2a1c9d-1111',
    turn: 4,
    anchor: { kind: 'range', blockIndex: 1, blockEndIndex: 1, quote: '同时准备报告目录，并将它单独纳入备份：', prefix: '上文', suffix: '后文' },
    quote: '同时准备报告目录，并将它单独纳入备份：',
    locator: '第 4 轮 · 段落 2 · #4f2a1c9d',
    comment: '说明 0750 权限的依据。',
    createdAt: 1,
    status: 'pending',
    ...overrides,
  }
}

/** Minimal DOM/storage/ctx stubs, enough for `apply()` to register four slots. */
export function installFakePlatform() {
  const registered = []
  const style = {
    textContent: '',
    dataset: {},
    setAttribute: () => {},
    remove: () => {},
  }
  globalThis.document = {
    createElement: () => style,
    head: { appendChild: () => {} },
    body: {},
    querySelectorAll: () => [],
    addEventListener: () => {},
    removeEventListener: () => {},
  }
  globalThis.MutationObserver = class {
    observe() {}
    disconnect() {}
  }
  globalThis.localStorage = {
    store: new Map(),
    getItem(key) { return this.store.has(key) ? this.store.get(key) : null },
    setItem(key, value) { this.store.set(key, String(value)) },
    removeItem(key) { this.store.delete(key) },
  }
  const ctx = {
    get: () => undefined,
    effect: (fn) => { const dispose = fn(); return () => { if (typeof dispose === 'function') dispose() } },
    slots: {
      inject: (name, factory) => { factory() },
      register: (def) => {
        registered.push({ name: def.name, id: def.id })
        return () => {}
      },
    },
  }
  return { ctx, registered }
}
