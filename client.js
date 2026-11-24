/**
 * dsh-annotate — the browser half.
 *
 * Select text in the transcript, leave a comment, collect notes in a tray and
 * send the whole batch to the model as one ordinary user message.
 *
 * Design notes:
 * - zero build step: this file is loaded verbatim by window.__ModuleLoader__;
 * - the only runtime dependency is react (the Harness client packages are not
 *   required by third-party browser halves);
 * - annotations are stored per session in localStorage; the sent text is plain
 *   markdown, so fork / replay / search / compaction keep working;
 * - the anchor stores messageId + turn + block + quote + 32-char prefix/suffix
 *   and is re-resolved against the rendered DOM on every mutation.
 */

window.__ModuleLoader__.load({
  id: 'dsh-annotate',
  factory: (require) => {
    const React = require('react')
    const h = React.createElement

    const NS = 'annotate'
    const STORE_PREFIX = 'dsh.annotate.v1.'
    const STORE_INDEX = 'dsh.annotate.v1.index'
    const MAX_NOTES = 200
    const MAX_QUOTE = 300
    const MAX_BATCH = 6000
    const MAX_SESSIONS = 20
    const TTL_MS = 7 * 24 * 60 * 60 * 1000
    const BLOCK_SELECTOR = 'p,h1,h2,h3,h4,h5,h6,li,pre,blockquote,td,th,figcaption'
    const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEXTAREA', 'INPUT', 'SELECT', 'OPTION', 'BUTTON'])
    const TAGS = ['change', 'question', 'add', 'remove']

    /* ────────────────────────────── i18n ────────────────────────────── */

    const DICTS = {
      'zh-CN': {
        'pill.add': '添加批注',
        'pill.key': 'Alt+A',
        'pop.title': '添加批注',
        'pop.comment': '评论',
        'pop.placeholder': '这条哪里不对？想怎么改？（可留空）',
        'pop.save': '保存',
        'pop.cancel': '取消',
        'pop.hint': 'Ctrl+Enter 保存 · Esc 取消',
        'tag.change': '修改',
        'tag.question': '疑问',
        'tag.add': '补充',
        'tag.remove': '删除',
        'tray.unit': '条批注待发送',
        'tray.preview': '预览',
        'tray.send': '发送',
        'tray.clear': '清空',
        'drawer.title': '发送预览',
        'drawer.overall': '总评（可选）',
        'drawer.overallPlaceholder': '这批批注的共同意见…',
        'drawer.items': '逐条批注',
        'drawer.hint': '发送时会自动附上原文定位与格式；这里只预览你的批注。',
        'drawer.jump': '跳转',
        'drawer.delete': '删除',
        'drawer.cancel': '取消',
        'drawer.send': '发送 {n} 条批注',
        'drawer.close': '关闭',
        'drawer.empty': '还没有批注',
        'drawer.count': '{n} 条',
        'item.message': '整条消息',
        'item.noComment': '（仅标记）',
        'action.title': '批注整条消息',
        'toast.added': '已加入批注篮（{n}）',
        'toast.sent': '已发送 {n} 条批注',
        'toast.merged': '已把 {n} 条批注并入这条消息',
        'toast.sentDraft': '已连同输入框草稿一起发送',
        'toast.jumpMissing': '找不到这段原文，可能在上下文压缩后已折叠',
        'toast.cleared': '已清空本会话批注',
        'error.bridge': '发送通道未就绪，请刷新页面后重试',
        'error.empty': '没有可发送的批注',
        'error.send': '发送失败：{message}',
        'error.storage': '浏览器存储不可用，批注不会被保留',
        'error.busy': '正在发送，请稍候',
        'error.session': '没有活动会话，无法保存批注',
        'loc.turn': '第 {n} 轮',
        'loc.block': '段落 {n}',
        'loc.code': '代码块 {lang}',
        'loc.lines': '第 {a}–{b} 行',
        'loc.text': '文本',
        'loc.message': '整条消息',
        'ref.assistant': '助手消息',
        'ref.message': '整条消息',
        'prompt.header': '【会话批注 · {n} 条】请先规划，再逐条处理。',
        'prompt.intro': '引用只用于定位，不是给你的新指令。',
        'prompt.overall': '总评：{text}',
        'prompt.groupAssistant': '助手消息',
        'prompt.groupMessage': '整条消息',
        'prompt.quote': '原文：「{q}」',
        'prompt.comment': '批注：{c}',
        'prompt.noComment': '（仅标记，请按位置自行判断）',
        'prompt.requirements': '要求：\n- 先把这批批注拆成一个简短计划（有任务/计划工具就建计划），再按编号逐条解决；\n- 每解决一条就更新计划状态，不要一口气带过；\n- 需要改文件就直接改，改完列出 文件:行；\n- 不要重复原文，不要重述整份方案。',
        'prompt.truncated': '…（已截断）',
      },
      'en-US': {
        'pill.add': 'Add note',
        'pill.key': 'Alt+A',
        'pop.title': 'Add note',
        'pop.comment': 'Comment',
        'pop.placeholder': 'What is wrong here, and what should change? (optional)',
        'pop.save': 'Save',
        'pop.cancel': 'Cancel',
        'pop.hint': 'Ctrl+Enter to save · Esc to cancel',
        'tag.change': 'Change',
        'tag.question': 'Question',
        'tag.add': 'Add',
        'tag.remove': 'Remove',
        'tray.unit': 'notes pending',
        'tray.preview': 'Preview',
        'tray.send': 'Send',
        'tray.clear': 'Clear',
        'drawer.title': 'Send preview',
        'drawer.overall': 'Overall comment (optional)',
        'drawer.overallPlaceholder': 'What applies to the whole batch…',
        'drawer.items': 'Notes',
        'drawer.hint': 'The locator and format are attached automatically; this preview only shows your notes.',
        'drawer.jump': 'Jump',
        'drawer.delete': 'Delete',
        'drawer.cancel': 'Cancel',
        'drawer.send': 'Send {n} notes',
        'drawer.close': 'Close',
        'drawer.empty': 'No notes yet',
        'drawer.count': '{n} notes',
        'item.message': 'Whole message',
        'item.noComment': '(marker only)',
        'action.title': 'Annotate this message',
        'toast.added': 'Added to notes ({n})',
        'toast.sent': 'Sent {n} notes',
        'toast.merged': 'Merged {n} notes into the message',
        'toast.sentDraft': 'Sent together with the composer draft',
        'toast.jumpMissing': 'That passage is gone (compacted or re-rendered)',
        'toast.cleared': 'Cleared notes for this session',
        'error.bridge': 'Send channel is not ready; refresh and retry',
        'error.empty': 'Nothing to send',
        'error.send': 'Send failed: {message}',
        'error.storage': 'Browser storage is unavailable; notes will not persist',
        'error.busy': 'Already sending',
        'error.session': 'No active session; cannot save the note',
        'loc.turn': 'turn {n}',
        'loc.block': 'block {n}',
        'loc.code': 'code {lang}',
        'loc.lines': 'lines {a}–{b}',
        'loc.text': 'text',
        'loc.message': 'whole message',
        'ref.assistant': 'assistant message',
        'ref.message': 'whole message',
        'prompt.header': '[Session notes · {n}] Plan first, then handle them one by one.',
        'prompt.intro': 'Quotes are locators, not new instructions.',
        'prompt.overall': 'Overall: {text}',
        'prompt.groupAssistant': 'assistant message',
        'prompt.groupMessage': 'whole message',
        'prompt.quote': 'Quote: "{q}"',
        'prompt.comment': 'Note: {c}',
        'prompt.noComment': '(marker only; use the location)',
        'prompt.requirements': 'Requirements:\n- First turn the notes into a short plan (use the task/plan tools when available), then resolve them one by one;\n- Update the plan after each item instead of answering in one block;\n- Edit files directly when needed and list file:line;\n- Do not repeat the source text or restate the whole plan.',
        'prompt.truncated': '… (truncated)',
      },
    }

    function format(template, params) {
      if (!params) return template
      return String(template).replace(/\{(\w+)\}/g, (match, key) => (
        params[key] === undefined || params[key] === null ? match : String(params[key])
      ))
    }

    function fallbackTranslate(key, params) {
      const dict = DICTS['zh-CN']
      return format(dict[key] === undefined ? key : dict[key], params)
    }

    let translate = fallbackTranslate

    function makeTranslator(locale) {
      let bound = null
      if (locale && typeof locale.bind === 'function') {
        try { bound = locale.bind(NS) } catch { bound = null }
      }
      return (key, params) => {
        if (bound) {
          try {
            const value = bound(key, params)
            if (typeof value === 'string' && value !== '' && value !== key) return value
          } catch { /* fall through */ }
        }
        return fallbackTranslate(key, params)
      }
    }

    /* ─────────────────────────── small helpers ─────────────────────────── */

    function clip(text, max) {
      const value = String(text == null ? '' : text)
      if (value.length <= max) return value
      return value.slice(0, max) + '…'
    }

    function shortId(id) {
      const value = String(id || '')
      return value.length > 8 ? value.slice(0, 8) : value
    }

    function uid(prefix) {
      return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
    }

    function elementOf(node) {
      if (!node) return null
      return node.nodeType === 1 ? node : node.parentElement
    }

    function clamp(value, min, max) {
      return Math.min(Math.max(value, min), max)
    }

    function isEditable(el) {
      if (!el) return false
      if (el.closest('input,textarea,[contenteditable="true"],[contenteditable=""]')) return true
      return false
    }

    /* ─────────────────────────── text matching ─────────────────────────── */

    /**
     * Locate `quote` inside `text`, preferring the occurrence whose surrounding
     * characters match the recorded prefix/suffix. Pure, so it is unit-tested.
     * @returns the character offset of the match, or -1.
     */
    function findQuote(text, anchor) {
      const quote = anchor && typeof anchor.quote === 'string' ? anchor.quote : ''
      if (!quote) return -1
      const candidates = []
      let index = text.indexOf(quote)
      while (index >= 0 && candidates.length < 64) {
        candidates.push(index)
        index = text.indexOf(quote, index + 1)
      }
      if (candidates.length === 0) {
        const trimmed = quote.trim()
        if (trimmed && trimmed !== quote) {
          return findQuote(text, { ...anchor, quote: trimmed, prefix: '', suffix: '' })
        }
        return -1
      }
      if (candidates.length === 1) return candidates[0]
      const prefix = anchor.prefix || ''
      const suffix = anchor.suffix || ''
      let best = candidates[0]
      let bestScore = -1
      for (const at of candidates) {
        let score = 0
        if (prefix && text.slice(Math.max(0, at - prefix.length), at) === prefix) score += 2
        if (suffix && text.slice(at + quote.length, at + quote.length + suffix.length) === suffix) score += 2
        if (score > bestScore) {
          bestScore = score
          best = at
        }
      }
      return best
    }

    function groupNotes(notes) {
      const groups = []
      const byKey = new Map()
      for (const note of notes) {
        const key = note.messageId
          ? 'm:' + note.messageId
          : note.turn != null
            ? 't:' + note.turn
            : 'x'
        let group = byKey.get(key)
        if (!group) {
          group = []
          byKey.set(key, group)
          groups.push(group)
        }
        group.push(note)
      }
      return groups
    }

    /**
     * Build the exact text that is sent to the model. Kept pure so the prompt
     * contract can be tested without a DOM.
     */
    function buildBatchText(notes, overall, t, options) {
      const tr = t || translate
      const opts = options || {}
      const list = Array.isArray(notes) ? notes : []
      if (list.length === 0) return ''
      const body = []
      body.push(tr('prompt.header', { n: list.length }))
      body.push(tr('prompt.intro'))
      const overallText = String(overall || '').trim()
      if (overallText) {
        body.push('')
        body.push(tr('prompt.overall', { text: overallText }))
      }
      let number = 0
      for (const group of groupNotes(list)) {
        const first = group[0]
        const wholeMessage = group.every((note) => note.anchor && note.anchor.kind === 'message')
        body.push('')
        if (wholeMessage) {
          body.push('▍' + tr('prompt.groupMessage') + (first.messageId ? ' #' + shortId(first.messageId) : ''))
        } else {
          const bits = [tr('prompt.groupAssistant')]
          const turn = group.find((note) => note.turn != null)
          if (turn) bits.push(tr('loc.turn', { n: turn.turn }))
          if (first.messageId) bits.push('#' + shortId(first.messageId))
          body.push('▍' + bits.join(' · '))
        }
        for (const note of group) {
          number += 1
          body.push(number + ') ' + (note.locator || tr('loc.message')))
          if (!opts.compact && note.anchor && note.anchor.kind === 'range' && note.quote) {
            body.push('   ' + tr('prompt.quote', { q: clip(note.quote, MAX_QUOTE) }))
          }
          const comment = String(note.comment || '').trim()
          body.push('   ' + tr('prompt.comment', { c: comment || tr('prompt.noComment') }))
        }
      }
      body.push('')
      body.push(tr('prompt.requirements'))
      return body.join('\n')
    }

    function batchTextFor(notes, overall, t) {
      const text = buildBatchText(notes, overall, t, { compact: false })
      if (text.length <= MAX_BATCH) return text
      return buildBatchText(notes, overall, t, { compact: true })
    }

    /**
     * Fold the pending batch into an outgoing draft. Pure so the merge order
     * (draft first, batch second) and the idempotence are unit-tested.
     */
    function mergeBatchIntoDraft(draft, notes, overall, t) {
      const text = batchTextFor(notes, overall, t)
      const base = String(draft == null ? '' : draft)
      if (!text) return base
      if (base.includes(text)) return base
      return base.trim() ? base + '\n\n' + text : text
    }

    function shouldMergeDraft(draft) {
      return !String(draft == null ? '' : draft).trimStart().startsWith('/')
    }

    /**
     * Drop the notes that were merged into a just-sent draft, keeping any note
     * added after the merge.
     */
    function clearSentNotes(ids) {
      if (!Array.isArray(ids) || ids.length === 0) return
      const sent = new Set(ids)
      const before = store.notes.length
      store.notes = store.notes.filter((note) => !sent.has(note.id))
      const removed = before - store.notes.length
      if (removed === 0) return
      if (store.notes.length === 0) {
        store.overall = ''
        store.panel = false
      }
      saveSession()
      store.bump()
      scheduleResolve()
      toast(translate('toast.merged', { n: removed }))
    }

    /* ───────────────────────────── storage ───────────────────────────── */

    let storageWarned = false

    function storage() {
      try {
        if (typeof localStorage === 'undefined' || localStorage === null) return null
        return localStorage
      } catch {
        return null
      }
    }

    function readJSON(key) {
      const store = storage()
      if (!store) return null
      try {
        const raw = store.getItem(key)
        return raw ? JSON.parse(raw) : null
      } catch {
        return null
      }
    }

    function writeJSON(key, value) {
      const store = storage()
      if (!store) return false
      try {
        store.setItem(key, JSON.stringify(value))
        return true
      } catch {
        return false
      }
    }

    function removeKey(key) {
      const store = storage()
      if (!store) return
      try { store.removeItem(key) } catch { /* ignore */ }
    }

    function sanitizeNote(note) {
      if (!note || typeof note !== 'object') return null
      if (typeof note.id !== 'string' || typeof note.sessionId !== 'string') return null
      if (!note.anchor || (note.anchor.kind !== 'range' && note.anchor.kind !== 'message')) return null
      return {
        id: note.id,
        sessionId: note.sessionId,
        messageId: typeof note.messageId === 'string' ? note.messageId : undefined,
        turn: typeof note.turn === 'number' ? note.turn : undefined,
        anchor: note.anchor,
        quote: typeof note.quote === 'string' ? note.quote : '',
        locator: typeof note.locator === 'string' ? note.locator : '',
        comment: typeof note.comment === 'string' ? note.comment : '',
        tag: TAGS.includes(note.tag) ? note.tag : undefined,
        createdAt: typeof note.createdAt === 'number' ? note.createdAt : Date.now(),
        status: 'pending',
      }
    }

    function loadSession(sessionId) {
      const data = readJSON(STORE_PREFIX + sessionId)
      if (!data || data.v !== 1 || !Array.isArray(data.notes)) return { notes: [], overall: '' }
      const notes = data.notes.map(sanitizeNote).filter(Boolean).slice(-MAX_NOTES)
      return { notes, overall: typeof data.overall === 'string' ? data.overall : '' }
    }

    function pruneIndex(list) {
      const cutoff = Date.now() - TTL_MS
      const kept = []
      for (const entry of list) {
        if (!entry || typeof entry.id !== 'string' || typeof entry.at !== 'number') continue
        if (entry.at < cutoff) {
          removeKey(STORE_PREFIX + entry.id)
          continue
        }
        kept.push(entry)
      }
      const bounded = kept.slice(0, MAX_SESSIONS)
      for (const entry of kept.slice(MAX_SESSIONS)) removeKey(STORE_PREFIX + entry.id)
      writeJSON(STORE_INDEX, bounded)
    }

    function touchIndex(sessionId) {
      const raw = readJSON(STORE_INDEX)
      const list = Array.isArray(raw) ? raw : []
      const next = [{ id: sessionId, at: Date.now() }]
        .concat(list.filter((entry) => entry && entry.id !== sessionId))
      pruneIndex(next)
    }

    function removeFromIndex(sessionId) {
      const raw = readJSON(STORE_INDEX)
      const list = Array.isArray(raw) ? raw : []
      writeJSON(STORE_INDEX, list.filter((entry) => entry && entry.id !== sessionId))
    }

    /* ──────────────────────────── app store ──────────────────────────── */

    const store = {
      sessionId: null,
      notes: [],
      overall: '',
      panel: false,
      selection: null,
      compose: null,
      sending: false,
      error: '',
      toast: null,
      focus: null,
      rev: 0,
      listeners: new Set(),
      bump() {
        this.rev += 1
        for (const listener of Array.from(this.listeners)) {
          try { listener() } catch { /* one bad listener must not stop the rest */ }
        }
      },
    }

    const services = { sessions: null }
    const bridges = new Map()
    let mergeLockedUntil = 0
    const resolvedRanges = new Map()
    const badgeEls = new Map()
    let toastTimer = 0
    let resolveTimer = 0
    let badgeFrame = 0

    function toast(text, kind) {
      store.toast = { text, kind: kind || 'info' }
      store.bump()
      if (toastTimer) clearTimeout(toastTimer)
      toastTimer = setTimeout(() => {
        store.toast = null
        store.bump()
      }, 2800)
    }

    function saveSession() {
      if (!store.sessionId) return
      const ok = writeJSON(STORE_PREFIX + store.sessionId, {
        v: 1,
        sessionId: store.sessionId,
        overall: store.overall,
        notes: store.notes,
        savedAt: Date.now(),
      })
      if (!ok && !storageWarned) {
        storageWarned = true
        toast(translate('error.storage'), 'error')
      }
    }

    function activateSession(sessionId) {
      if (!sessionId || typeof sessionId !== 'string') return
      if (sessionId === store.sessionId) return
      store.sessionId = sessionId
      const data = loadSession(sessionId)
      store.notes = data.notes
      store.overall = data.overall
      store.panel = false
      store.selection = null
      store.compose = null
      store.focus = null
      store.error = ''
      touchIndex(sessionId)
      store.bump()
      scheduleResolve()
    }

    function addNote(note) {
      store.notes = store.notes.concat([note]).slice(-MAX_NOTES)
      saveSession()
      store.bump()
      scheduleResolve()
    }

    function removeNote(id) {
      store.notes = store.notes.filter((note) => note.id !== id)
      saveSession()
      store.bump()
      scheduleResolve()
    }

    function clearNotes() {
      if (!store.notes.length) return
      store.notes = []
      store.overall = ''
      store.panel = false
      saveSession()
      store.bump()
      scheduleResolve()
      toast(translate('toast.cleared'))
    }

    function useStore() {
      const [, setTick] = React.useState(0)
      React.useEffect(() => {
        const listener = () => setTick((value) => value + 1)
        store.listeners.add(listener)
        return () => { store.listeners.delete(listener) }
      }, [])
      return store
    }

    /* ──────────────────────── selection → anchor ──────────────────────── */

    function fiberOf(element) {
      if (!element || typeof element !== 'object') return null
      const names = Object.getOwnPropertyNames(element)
      for (const name of names) {
        if (name.startsWith('__reactFiber$') || name.startsWith('__reactInternalInstance$')) {
          return element[name]
        }
      }
      return null
    }

    function fiberContext(element) {
      const out = { sessionId: null, messageId: null, turn: null }
      let fiber = fiberOf(element)
      let hops = 0
      while (fiber && hops < 160) {
        const props = fiber.memoizedProps
        if (props && typeof props === 'object') {
          if (!out.sessionId && typeof props.sessionId === 'string') out.sessionId = props.sessionId
          if (!out.messageId && typeof props.messageId === 'string') out.messageId = props.messageId
          const node = props.node
          if (node && typeof node === 'object') {
            const data = node.data
            if (data && data.finalNode && typeof data.finalNode.messageId === 'string') {
              out.messageId = data.finalNode.messageId
            } else if (!out.messageId && typeof node.messageId === 'string') {
              out.messageId = node.messageId
            }
            if (out.turn == null && node.location && node.location.turn != null) {
              const turn = node.location.turn
              if (typeof turn === 'number') out.turn = turn
              else if (typeof turn.turn === 'number') out.turn = turn.turn
            }
            if (out.turn == null && data && typeof data.turn === 'number') out.turn = data.turn
          }
        }
        fiber = fiber.return
        hops += 1
      }
      return out
    }

    function topBlocks(wrapper) {
      const all = Array.from(wrapper.querySelectorAll(BLOCK_SELECTOR))
      return all.filter((element) => {
        let parent = element.parentElement
        while (parent && parent !== wrapper) {
          if (parent.matches && parent.matches(BLOCK_SELECTOR)) return false
          parent = parent.parentElement
        }
        return true
      })
    }

    function topBlockFor(node, wrapper) {
      let element = elementOf(node)
      let found = null
      while (element && element !== wrapper) {
        if (element.nodeType === 1 && element.matches && element.matches(BLOCK_SELECTOR)) found = element
        element = element.parentElement
      }
      return found
    }

    function blockKind(block) {
      const tag = block.tagName.toLowerCase()
      if (tag === 'pre') return 'code'
      if (tag === 'blockquote') return 'quote'
      if (tag === 'li') return 'list'
      if (tag === 'td' || tag === 'th') return 'table'
      if (/^h[1-6]$/.test(tag)) return 'heading'
      return 'paragraph'
    }

    function codeLanguage(block) {
      const code = block.querySelector('code')
      const className = code && typeof code.className === 'string' ? code.className : ''
      const found = /language-([A-Za-z0-9_+#.-]+)/.exec(className)
      return found ? found[1] : null
    }

    function describeBlock(block, range) {
      const kind = blockKind(block)
      let before = ''
      let after = ''
      try {
        const beforeRange = document.createRange()
        beforeRange.selectNodeContents(block)
        beforeRange.setEnd(range.startContainer, range.startOffset)
        before = beforeRange.toString()
        const afterRange = document.createRange()
        afterRange.selectNodeContents(block)
        afterRange.setStart(range.endContainer, range.endOffset)
        after = afterRange.toString()
      } catch { /* selection crosses the block boundary */ }
      const blockText = block.textContent || ''
      const beforeLength = Math.min(before.length, blockText.length)
      const lineStart = before.split('\n').length
      const selected = String(range.toString() || '')
      return {
        kind,
        lang: kind === 'code' ? codeLanguage(block) : null,
        start: beforeLength,
        end: beforeLength + selected.length,
        lineStart,
        lineEnd: lineStart + selected.split('\n').length - 1,
        prefix: before.slice(-32),
        suffix: after.slice(0, 32),
      }
    }

    function buildLocator(info, t) {
      if (info.kind === 'message') {
        return t('loc.message') + (info.messageId ? ' #' + shortId(info.messageId) : '')
      }
      const parts = []
      if (info.turn != null) parts.push(t('loc.turn', { n: info.turn }))
      if (info.block) {
        if (info.block.kind === 'code') {
          parts.push(t('loc.code', { lang: info.block.lang || t('loc.text') }))
          if (info.block.lineStart > 0) parts.push(t('loc.lines', { a: info.block.lineStart, b: info.block.lineEnd }))
        } else if (info.block.index >= 0) {
          parts.push(t('loc.block', { n: info.block.index + 1 }))
        }
      }
      if (info.messageId) parts.push('#' + shortId(info.messageId))
      return parts.join(' · ') || t('loc.message')
    }

    function selectionRect(range) {
      const rects = range.getClientRects()
      for (let i = 0; i < rects.length; i += 1) {
        const rect = rects[i]
        if (rect.width > 0 || rect.height > 0) {
          return { top: rect.top, left: rect.left, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height }
        }
      }
      const rect = range.getBoundingClientRect()
      if (!rect || (!rect.width && !rect.height)) return null
      return { top: rect.top, left: rect.left, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height }
    }

    /**
     * Read the current DOM selection into a durable annotation target.
     * @returns {{ target: object, rect: object } | null}
     */
    function readSelection() {
      if (typeof window === 'undefined') return null
      const selection = window.getSelection()
      if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return null
      const range = selection.getRangeAt(0)
      const text = String(selection.toString() || '')
      if (!text.trim()) return null
      const startEl = elementOf(range.startContainer)
      if (!startEl) return null
      if (isEditable(startEl)) return null
      if (startEl.closest('button')) return null
      if (startEl.closest('[data-review-ui]')) return null
      const wrapper = startEl.closest('[data-chat-flow-kind]')
      if (!wrapper) return null
      const context = fiberContext(startEl)
      const blocks = topBlocks(wrapper)
      const startBlock = topBlockFor(range.startContainer, wrapper)
      const endBlock = topBlockFor(range.endContainer, wrapper)
      const startIndex = startBlock ? blocks.indexOf(startBlock) : -1
      const endIndex = endBlock ? blocks.indexOf(endBlock) : startIndex
      const detail = startBlock ? describeBlock(startBlock, range) : null
      const rawTurn = context.turn != null ? context.turn : parseTurn(wrapper.getAttribute('data-chat-turn'))
      const turn = typeof rawTurn === 'number' ? rawTurn : parseTurn(rawTurn)
      const quote = text.replace(/[\s\u00a0]+$/, '')
      if (!quote.trim()) return null
      const target = {
        sessionId: context.sessionId || store.sessionId,
        messageId: context.messageId,
        turn: turn == null ? undefined : turn,
        quote,
        anchor: {
          kind: 'range',
          blockIndex: startIndex,
          blockEndIndex: endIndex >= 0 ? endIndex : startIndex,
          quote,
          prefix: detail ? detail.prefix : '',
          suffix: detail ? detail.suffix : '',
          lang: detail ? detail.lang : null,
          lineStart: detail ? detail.lineStart : 0,
          lineEnd: detail ? detail.lineEnd : 0,
        },
        locator: '',
      }
      target.locator = buildLocator({
        kind: 'range',
        turn: target.turn,
        block: detail ? { kind: detail.kind, lang: detail.lang, lineStart: detail.lineStart, lineEnd: detail.lineEnd, index: startIndex } : null,
        messageId: target.messageId,
      }, translate)
      const rect = selectionRect(range)
      if (!rect) return null
      const blockRect = startBlock ? startBlock.getBoundingClientRect() : null
      const popoverRect = blockRect && blockRect.width > 0
        ? { top: blockRect.top, left: blockRect.left, right: blockRect.right, bottom: blockRect.bottom, width: blockRect.width, height: blockRect.height }
        : rect
      return { target, rect, popoverRect }
    }

    function parseTurn(raw) {
      if (raw === null || raw === undefined || raw === '') return undefined
      const value = Number(raw)
      return Number.isFinite(value) ? value : undefined
    }

    /* ─────────────────────── anchor → rendered range ─────────────────── */

    let highlightCtor = null
    let wrapperIds = new Map()

    function supportsHighlight() {
      if (highlightCtor) return true
      if (typeof window === 'undefined') return false
      const ctor = window.Highlight
      if (typeof ctor !== 'function') return false
      // NOTE: the module also has a local `CSS` string for its stylesheet, so
      // the browser API must be read from `window.CSS` explicitly.
      const api = window.CSS
      if (!api || !api.highlights) return false
      highlightCtor = ctor
      return true
    }

    function collectText(root) {
      const segments = []
      let text = ''
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
        acceptNode(node) {
          const parent = node.parentElement
          if (!parent) return NodeFilter.FILTER_REJECT
          if (parent.closest('[data-review-ui]')) return NodeFilter.FILTER_REJECT
          if (parent.closest('[hidden]')) return NodeFilter.FILTER_REJECT
          if (SKIP_TAGS.has(parent.tagName)) return NodeFilter.FILTER_REJECT
          return NodeFilter.FILTER_ACCEPT
        },
      })
      let node = walker.nextNode()
      while (node) {
        const value = node.nodeValue || ''
        if (value) {
          segments.push({ node, start: text.length, end: text.length + value.length })
          text += value
        }
        node = walker.nextNode()
      }
      return { text, segments }
    }

    function pointAt(segments, offset) {
      for (const segment of segments) {
        if (offset < segment.end) {
          return { node: segment.node, offset: Math.max(0, offset - segment.start) }
        }
      }
      const last = segments[segments.length - 1]
      if (!last) return null
      return { node: last.node, offset: last.node.nodeValue ? last.node.nodeValue.length : 0 }
    }

    function resolveRangeIn(wrapper, anchor) {
      const blocks = topBlocks(wrapper)
      const index = typeof anchor.blockIndex === 'number' ? anchor.blockIndex : -1
      const endIndex = typeof anchor.blockEndIndex === 'number' ? anchor.blockEndIndex : index
      const single = index >= 0 && index === endIndex && blocks[index]
      const root = single ? blocks[index] : wrapper
      const { text, segments } = collectText(root)
      const at = findQuote(text, anchor)
      if (at < 0) return null
      const start = pointAt(segments, at)
      const end = pointAt(segments, at + anchor.quote.length)
      if (!start || !end) return null
      try {
        const range = document.createRange()
        range.setStart(start.node, start.offset)
        range.setEnd(end.node, end.offset)
        return range
      } catch {
        return null
      }
    }

    function findWrappers() {
      const wrappers = Array.from(document.querySelectorAll('[data-chat-flow-kind]'))
      wrapperIds = new Map()
      for (const wrapper of wrappers) {
        const context = fiberContext(wrapper)
        if (context.messageId && !wrapperIds.has(context.messageId)) {
          wrapperIds.set(context.messageId, wrapper)
        }
      }
      return wrappers
    }

    function resolveRangeFor(note, wrappers) {
      const candidates = []
      const push = (wrapper) => {
        if (wrapper && !candidates.includes(wrapper)) candidates.push(wrapper)
      }
      if (note.messageId) push(wrapperIds.get(note.messageId))
      if (note.turn != null) {
        const turn = String(note.turn)
        for (const wrapper of wrappers) {
          if (wrapper.getAttribute('data-chat-turn') === turn) push(wrapper)
        }
      }
      // Last resort: a turn can render several rows (user / process / answer),
      // and the fiber-based messageId map is not guaranteed for every row.
      for (const wrapper of wrappers) push(wrapper)
      for (const wrapper of candidates) {
        const range = resolveRangeIn(wrapper, note.anchor)
        if (range) return range
      }
      return null
    }

    function paintHighlights() {
      if (!supportsHighlight()) return
      try {
        const highlight = new highlightCtor()
        for (const range of resolvedRanges.values()) highlight.add(range)
        window.CSS.highlights.set('review-notes', highlight)
      } catch { /* highlight API refused a range; keep going */ }
    }

    function layoutBadges() {
      if (typeof window === 'undefined') return
      for (const [id, element] of badgeEls) {
        if (!element) continue
        const range = resolvedRanges.get(id)
        if (!range) {
          element.hidden = true
          continue
        }
        let rect = null
        try {
          const rects = range.getClientRects()
          rect = rects.length ? rects[rects.length - 1] : range.getBoundingClientRect()
        } catch {
          rect = null
        }
        if (!rect || (!rect.width && !rect.height)) {
          element.hidden = true
          continue
        }
        const top = Math.max(6, rect.top - 6)
        const left = Math.min(window.innerWidth - 24, rect.right + 3)
        element.hidden = false
        element.style.top = top + 'px'
        element.style.left = left + 'px'
      }
    }

    function scheduleBadgeLayout() {
      if (badgeFrame) return
      badgeFrame = requestAnimationFrame(() => {
        badgeFrame = 0
        layoutBadges()
      })
    }

    function resolveAll() {
      resolvedRanges.clear()
      if (!store.notes.length || !store.sessionId || typeof document === 'undefined') {
        paintHighlights()
        layoutBadges()
        return
      }
      const wrappers = findWrappers()
      for (const note of store.notes) {
        if (!note.anchor || note.anchor.kind !== 'range') continue
        const range = resolveRangeFor(note, wrappers)
        if (range) resolvedRanges.set(note.id, range)
      }
      paintHighlights()
      layoutBadges()
    }

    function scheduleResolve() {
      if (resolveTimer) return
      resolveTimer = setTimeout(() => {
        resolveTimer = 0
        resolveAll()
      }, 160)
    }

    /* ───────────────────────────── sending ───────────────────────────── */

    const MISSING = { ok: false, reason: 'missing' }

    function sessionFromService(sessionId) {
      const sessions = services.sessions
      if (!sessions) return null
      try {
        if (typeof sessions.get === 'function') {
          const direct = sessions.get(sessionId)
          if (direct) return direct
        }
        if (typeof sessions.binding === 'function') {
          const binding = sessions.binding(sessionId)
          if (binding) return binding.session || binding
        }
      } catch { /* service shape changed; fall through to composer */ }
      return null
    }

    async function promptDirect(sessionId, text) {
      const session = sessionFromService(sessionId)
      if (!session || typeof session.prompt !== 'function') return MISSING
      try {
        const result = await session.prompt([{ type: 'text', text }], 'queue')
        if (result && result.ok === false) {
          return { ok: false, reason: (result.error && result.error.code) || 'prompt-failed', error: result.error && result.error.message }
        }
        return { ok: true, via: 'session' }
      } catch (error) {
        return { ok: false, reason: 'threw', error: error && error.message ? error.message : String(error) }
      }
    }

    function promptViaComposer(text, ref) {
      return new Promise((resolve) => {
        const actions = ref.current && ref.current.inputActions
        if (!actions || typeof actions.setDraft !== 'function' || typeof actions.submit !== 'function') {
          resolve({ ok: false, reason: 'composer-missing' })
          return
        }
        const draft = typeof ref.current.draft === 'string' ? ref.current.draft : ''
        const payload = draft.trim() ? draft + '\n\n' + text : text
        try {
          actions.setDraft(payload)
        } catch (error) {
          resolve({ ok: false, reason: 'set-draft-failed', error: String(error) })
          return
        }
        const submitNow = () => {
          try {
            actions.submit()
            resolve({ ok: true, via: 'composer', hadDraft: draft.trim() !== '' })
          } catch (error) {
            resolve({ ok: false, reason: 'submit-failed', error: String(error) })
          }
        }
        // Without a draft observer there is nothing to wait for; give the
        // editor one frame to apply the value and submit.
        if (!ref.current.observable) {
          setTimeout(submitNow, 80)
          return
        }
        const deadline = Date.now() + 1500
        const tick = () => {
          if (ref.current.draft === payload) {
            submitNow()
            return
          }
          if (Date.now() > deadline) {
            resolve({ ok: false, reason: 'timeout' })
            return
          }
          setTimeout(tick, 30)
        }
        setTimeout(tick, 30)
      })
    }

    async function sendThrough(sessionId, text, ref) {
      const direct = await promptDirect(sessionId, text)
      if (direct.ok) return direct
      return promptViaComposer(text, ref)
    }

    async function sendBatch() {
      if (store.sending) {
        toast(translate('error.busy'))
        return
      }
      if (!store.notes.length) {
        toast(translate('error.empty'))
        return
      }
      const sessionId = store.sessionId
      const bridge = sessionId ? bridges.get(sessionId) : null
      if (!bridge) {
        store.error = translate('error.bridge')
        toast(translate('error.bridge'), 'error')
        store.bump()
        return
      }
      const count = store.notes.length
      const text = batchTextFor(store.notes, store.overall, translate)
      store.sending = true
      store.error = ''
      store.bump()
      try {
        const result = await bridge.send(text)
        if (result && result.ok === false) {
          store.error = translate('error.send', {
            message: result.error || result.reason || 'unknown',
          })
          toast(store.error, 'error')
        } else {
          store.notes = []
          store.overall = ''
          store.panel = false
          saveSession()
          store.bump()
          scheduleResolve()
          toast(translate('toast.sent', { n: count }))
          if (result && result.via === 'composer' && result.hadDraft) toast(translate('toast.sentDraft'))
        }
      } catch (error) {
        store.error = translate('error.send', { message: error && error.message ? error.message : String(error) })
      } finally {
        store.sending = false
        store.bump()
      }
    }

    function registerBridge(sessionId, bridge) {
      bridges.set(sessionId, bridge)
      return () => {
        if (bridges.get(sessionId) === bridge) bridges.delete(sessionId)
      }
    }

    /**
     * Fold the pending batch into a normal composer send. Registered for the
     * lifetime of the plugin (not per component) so React remounts of the
     * composer overlay can never drop the listener.
     */
    function installSubmitInterceptor() {
      const lastButton = (card) => {
        const buttons = Array.from(card.querySelectorAll('button'))
          .filter((button) => !button.closest('[data-review-ui]'))
        return buttons[buttons.length - 1] || null
      }

      const merge = () => {
        if (store.sending || store.notes.length === 0) return
        if (Date.now() < mergeLockedUntil) return
        const bridge = store.sessionId ? bridges.get(store.sessionId) : null
        const ref = bridge && bridge.ref
        const actions = ref && ref.current ? ref.current.inputActions : null
        if (!actions || typeof actions.setDraft !== 'function') return
        const draft = typeof ref.current.draft === 'string' ? ref.current.draft : ''
        if (!draft.trim()) return
        if (!shouldMergeDraft(draft)) return
        const merged = mergeBatchIntoDraft(draft, store.notes, store.overall, translate)
        if (merged === draft) return
        try {
          actions.setDraft(merged)
        } catch {
          return
        }
        mergeLockedUntil = Date.now() + 400
        const ids = store.notes.map((note) => note.id)
        // The draft now owns the batch text: if the host sends, it is in the
        // message; if it does not, the text stays in the composer.
        setTimeout(() => clearSentNotes(ids), 400)
      }

      const onKeyDown = (event) => {
        if (event.key !== 'Enter' || event.shiftKey || event.altKey || event.altGraphKey) return
        if (event.isComposing || event.keyCode === 229) return
        const target = event.target
        if (!(target instanceof Element) || target.closest('[data-review-ui]')) return
        const card = target.closest('[data-composer-card]')
        if (!card) return
        const button = lastButton(card)
        // While a turn is running the last button is "stop"; Enter may still
        // queue the message, so do not require a send button here. A click on
        // stop is filtered by the guard in onClick.
        if (button && button.disabled) return
        merge()
      }

      const onClick = (event) => {
        const target = event.target
        if (!(target instanceof Element) || target.closest('[data-review-ui]')) return
        const card = target.closest('[data-composer-card]')
        if (!card) return
        const button = target.closest('button')
        if (!button || button.disabled) return
        if (lastButton(card) !== button) return
        if (button.querySelector('svg rect')) return
        merge()
      }

      // `window` capture runs before any `document` capture listener the host
      // may install for shortcuts, so the merge still happens first.
      window.addEventListener('keydown', onKeyDown, true)
      window.addEventListener('click', onClick, true)
      return () => {
        window.removeEventListener('keydown', onKeyDown, true)
        window.removeEventListener('click', onClick, true)
      }
    }

    /* ────────────────────────────── icons ────────────────────────────── */

    function IconPlus({ size }) {
      return h('svg', { width: size, height: size, viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': 'true' },
        h('path', { d: 'M8 3.4v9.2M3.4 8h9.2', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round' }))
    }

    function IconClip({ size }) {
      return h('svg', { width: size, height: size, viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': 'true' },
        h('path', {
          d: 'M10.6 3.4 5.9 8.1a1.5 1.5 0 0 0 2.1 2.1l4.9-4.9a2.7 2.7 0 0 0-3.8-3.8L4 6.5a3.9 3.9 0 0 0 5.5 5.5l3.9-3.9',
          stroke: 'currentColor', strokeWidth: 1.4, strokeLinecap: 'round', strokeLinejoin: 'round',
        }))
    }

    function IconPen({ size }) {
      return h('svg', { width: size, height: size, viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': 'true' },
        h('path', {
          d: 'M3 13h3l7.2-7.2a1.7 1.7 0 0 0-2.4-2.4L3.6 10.6 3 13Z',
          stroke: 'currentColor', strokeWidth: 1.4, strokeLinejoin: 'round',
        }))
    }

    function IconClose({ size }) {
      return h('svg', { width: size, height: size, viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': 'true' },
        h('path', { d: 'm4 4 8 8M12 4l-8 8', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round' }))
    }

    /* ──────────────────────────── components ──────────────────────────── */

    function pillStyle(rect) {
      const width = 132
      const left = clamp(rect.left + rect.width / 2, width / 2 + 8, window.innerWidth - width / 2 - 8)
      if (rect.top < 52) {
        return { left: left + 'px', top: rect.bottom + 8 + 'px', transform: 'translateX(-50%)' }
      }
      return { left: left + 'px', top: rect.top - 8 + 'px', transform: 'translate(-50%, -100%)' }
    }

    function popoverStyle(rect) {
      const width = Math.min(360, window.innerWidth - 20)
      const left = clamp(rect.left, 10, Math.max(10, window.innerWidth - width - 10))
      const estimated = 290
      const below = rect.bottom + 8
      if (below + estimated < window.innerHeight) {
        return { left: left + 'px', top: below + 'px', width: width + 'px' }
      }
      return {
        left: left + 'px',
        top: Math.max(10, rect.top - 8 - estimated) + 'px',
        width: width + 'px',
      }
    }

    function openPanel(focusId) {
      store.panel = true
      store.error = ''
      if (focusId) store.focus = focusId
      store.bump()
    }

    function openCompose(target, rect) {
      store.compose = { target, rect }
      store.selection = null
      store.panel = false
      store.bump()
    }

    function SelectionPill({ selection, t }) {
      return h('button', {
        type: 'button',
        className: 'rn-pill',
        'data-review-ui': '',
        style: pillStyle(selection.rect),
        onMouseDown: (event) => event.preventDefault(),
        onClick: () => {
          openCompose(selection.target, selection.popoverRect || selection.rect)
        },
      },
      h('span', { className: 'rn-pill-icon' }, h(IconPlus, { size: 12 })),
      h('span', null, t('pill.add')),
      h('kbd', null, t('pill.key')))
    }

    function CommentPopover({ compose, t }) {
      const [draft, setDraft] = React.useState('')
      const [tag, setTag] = React.useState(null)
      const areaRef = React.useRef(null)
      const target = compose.target
      const isMessage = target.anchor && target.anchor.kind === 'message'

      React.useEffect(() => {
        const element = areaRef.current
        if (!element) return
        element.focus()
        try { element.setSelectionRange(element.value.length, element.value.length) } catch { /* ignore */ }
      }, [])

      const close = () => {
        store.compose = null
        store.bump()
      }

      const save = () => {
        const sessionId = target.sessionId || store.sessionId
        if (!sessionId) {
          toast(t('error.session'), 'error')
          store.compose = null
          store.bump()
          return
        }
        const note = {
          id: uid('n'),
          sessionId,
          messageId: target.messageId,
          turn: target.turn,
          anchor: target.anchor,
          quote: target.quote || '',
          locator: target.locator || '',
          comment: draft.trim(),
          tag: tag || undefined,
          createdAt: Date.now(),
          status: 'pending',
        }
        store.compose = null
        store.selection = null
        addNote(note)
        const selection = window.getSelection()
        if (selection) selection.removeAllRanges()
        toast(t('toast.added', { n: store.notes.length }))
      }

      const onKeyDown = (event) => {
        if (event.key === 'Escape') {
          event.preventDefault()
          close()
          return
        }
        if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
          if (event.nativeEvent && event.nativeEvent.isComposing) return
          event.preventDefault()
          save()
        }
      }

      const quote = target.quote || ''
      return h('div', {
        className: 'rn-pop',
        'data-review-ui': '',
        role: 'dialog',
        'aria-label': t('pop.title'),
        style: popoverStyle(compose.rect),
      },
      h('div', { className: 'rn-pop-head' },
        h('span', { className: 'rn-pop-title' }, t('pop.title')),
        h('span', { className: 'rn-pop-locator' }, target.locator || '')),
      isMessage
        ? h('div', { className: 'rn-pop-quote rn-pop-quote-message' }, t('item.message'))
        : h('div', { className: 'rn-pop-quote' }, clip(quote, 180)),
      h('div', { className: 'rn-field' },
        h('span', { className: 'rn-field-label' }, t('pop.comment')),
        h('textarea', {
          ref: areaRef,
          className: 'rn-input',
          rows: 3,
          value: draft,
          placeholder: t('pop.placeholder'),
          spellCheck: false,
          onChange: (event) => setDraft(event.target.value),
          onKeyDown,
        })),
      h('div', { className: 'rn-tags' }, TAGS.map((id) => h('button', {
        key: id,
        type: 'button',
        className: 'rn-tag' + (tag === id ? ' on' : ''),
        onClick: () => setTag(tag === id ? null : id),
      }, t('tag.' + id)))),
      h('div', { className: 'rn-pop-foot' },
        h('span', { className: 'rn-hint' }, t('pop.hint')),
        h('span', { className: 'rn-spacer' }),
        h('button', { type: 'button', className: 'rn-btn ghost', onClick: close }, t('pop.cancel')),
        h('button', { type: 'button', className: 'rn-btn primary', onClick: save }, t('pop.save'))))
    }

    function BadgeLayer({ t }) {
      useStore()
      React.useEffect(() => { layoutBadges() })
      return h('div', { className: 'rn-badges', 'data-review-ui': '' },
        store.notes.map((note, index) => {
          if (!note.anchor || note.anchor.kind !== 'range') return null
          return h('button', {
            key: note.id,
            type: 'button',
            className: 'rn-badge',
            title: note.comment || note.locator || t('pill.add'),
            'data-review-ui': '',
            ref: (element) => {
              if (element) {
                badgeEls.set(note.id, element)
                scheduleBadgeLayout()
              } else {
                badgeEls.delete(note.id)
              }
            },
            onClick: () => {
              openPanel(note.id)
            },
          }, String(index + 1))
        }))
    }

    function NotesDock(props) {
      const state = useStore()
      const trayRef = React.useRef(null)
      const cardRef = React.useRef(null)
      const sessionId = typeof props.sessionId === 'string' ? props.sessionId : state.sessionId

      React.useEffect(() => {
        if (sessionId) activateSession(sessionId)
      }, [sessionId])

      // The tray lives inside the composer card's top padding area. Measure it
      // and pad the card so the editor moves down instead of being covered.
      React.useEffect(() => {
        const tray = trayRef.current
        if (!tray || typeof ResizeObserver !== 'function') return undefined
        const card = tray.closest('[data-composer-card]')
        if (!card) return undefined
        cardRef.current = card
        const sync = () => {
          const height = Math.ceil(tray.getBoundingClientRect().height)
          if (height <= 0) {
            card.classList.remove('rn-card-pad')
            card.style.removeProperty('--rn-tray-pad')
            return
          }
          card.style.setProperty('--rn-tray-pad', height + 'px')
          card.classList.add('rn-card-pad')
        }
        sync()
        const observer = new ResizeObserver(sync)
        observer.observe(tray)
        return () => {
          observer.disconnect()
          if (cardRef.current === card) {
            card.classList.remove('rn-card-pad')
            card.style.removeProperty('--rn-tray-pad')
            cardRef.current = null
          }
        }
      }, [])

      const active = Boolean(sessionId) && state.sessionId === sessionId
      const notes = active ? state.notes : []
      const empty = notes.length === 0
      const preview = notes.slice(0, 2)
        .map((note) => clip(note.comment || (note.tag ? translate('tag.' + note.tag) : ''), 18))
        .filter(Boolean)
        .join(' · ')
      return h('div', { ref: trayRef, className: 'rn-tray', hidden: empty, 'data-review-ui': '' },
        h('div', { className: 'rn-tray-icon' }, h(IconClip, { size: 15 })),
        h('div', {
          className: 'rn-tray-main',
          role: 'button',
          tabIndex: 0,
          onClick: () => openPanel(),
          onKeyDown: (event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault()
              openPanel()
            }
          },
        },
        h('span', { className: 'rn-tray-title' },
          h('span', { className: 'rn-tray-count' }, String(notes.length)),
          h('span', null, translate('tray.unit'))),
        preview ? h('span', { className: 'rn-tray-sub' }, '· ' + preview) : null),
        h('div', { className: 'rn-tray-actions' },
          h('button', { type: 'button', className: 'rn-btn sm', onClick: () => openPanel() }, translate('tray.preview')),
          h('button', { type: 'button', className: 'rn-btn sm primary', onClick: () => sendBatch() }, translate('tray.send'))))
    }

    function Drawer({ t }) {
      const state = useStore()
      const [overall, setOverall] = React.useState(state.overall)
      const itemRefs = React.useRef(new Map())

      React.useEffect(() => { setOverall(store.overall) }, [state.sessionId, state.panel])

      React.useEffect(() => {
        if (!state.focus) return
        const element = itemRefs.current.get(state.focus)
        if (element && typeof element.scrollIntoView === 'function') {
          element.scrollIntoView({ block: 'nearest' })
        }
        store.focus = null
      }, [state.focus, state.panel])

      if (!state.panel) return null

      const count = state.notes.length

      const updateOverall = (value) => {
        setOverall(value)
        store.overall = value
        saveSession()
      }

      const jump = (note) => {
        const range = resolvedRanges.get(note.id)
        if (!range) {
          toast(t('toast.jumpMissing'))
          return
        }
        const element = elementOf(range.startContainer)
        if (element && typeof element.scrollIntoView === 'function') {
          element.scrollIntoView({ block: 'center', behavior: 'smooth' })
        }
        const selection = window.getSelection()
        if (selection) {
          selection.removeAllRanges()
          selection.addRange(range)
        }
      }

      return h('aside', { className: 'rn-drawer', 'data-review-ui': '', role: 'dialog', 'aria-label': t('drawer.title') },
        h('div', { className: 'rn-drawer-head' },
          h('span', { className: 'rn-drawer-title' }, t('drawer.title')),
          h('span', { className: 'rn-chip' }, t('drawer.count', { n: count })),
          h('span', { className: 'rn-spacer' }),
          h('button', { type: 'button', className: 'rn-icon-btn', title: t('drawer.close'), onClick: () => { store.panel = false; store.bump() } }, h(IconClose, { size: 14 }))),
        h('div', { className: 'rn-drawer-body' },
          h('div', { className: 'rn-label' }, t('drawer.overall')),
          h('div', { className: 'rn-summary' },
            h('textarea', {
              className: 'rn-overall',
              rows: 2,
              value: overall,
              placeholder: t('drawer.overallPlaceholder'),
              onChange: (event) => updateOverall(event.target.value),
            })),
          h('div', { className: 'rn-label' }, t('drawer.items')),
          count === 0
            ? h('div', { className: 'rn-empty' }, t('drawer.empty'))
            : state.notes.map((note, index) => h('div', {
              key: note.id,
              className: 'rn-item',
              ref: (element) => {
                if (element) itemRefs.current.set(note.id, element)
                else itemRefs.current.delete(note.id)
              },
            },
            h('span', { className: 'rn-item-num' }, String(index + 1)),
            h('div', { className: 'rn-item-body' },
              h('div', { className: 'rn-item-quote' }, note.anchor && note.anchor.kind === 'message'
                ? t('item.message')
                : '「' + clip(note.quote, 90) + '」'),
              h('div', { className: 'rn-item-comment' }, note.comment || (note.tag ? t('tag.' + note.tag) : t('item.noComment'))),
              h('div', { className: 'rn-item-meta' }, note.locator || '')),
            h('div', { className: 'rn-item-actions' },
              h('button', { type: 'button', className: 'rn-link', onClick: () => jump(note) }, t('drawer.jump')),
              h('button', { type: 'button', className: 'rn-link danger', onClick: () => removeNote(note.id) }, t('drawer.delete'))))),
          h('div', { className: 'rn-drawer-hint' }, t('drawer.hint'))),
        h('div', { className: 'rn-drawer-foot' },
          h('button', { type: 'button', className: 'rn-btn ghost', onClick: clearNotes }, t('tray.clear')),
          h('span', { className: 'rn-spacer' }),
          state.error ? h('span', { className: 'rn-error', role: 'alert' }, state.error) : null,
          h('button', {
            type: 'button',
            className: 'rn-btn primary',
            disabled: state.sending || count === 0,
            onClick: () => sendBatch(),
          }, state.sending ? '…' : t('drawer.send', { n: count }))))
    }

    function OverlayRoot({ t }) {
      const state = useStore()
      useSelectionTracking(t)
      useReposition()
      return h('div', { className: 'rn-root', 'data-review-ui': '' },
        state.selection && !state.compose ? h(SelectionPill, { selection: state.selection, t }) : null,
        state.compose ? h(CommentPopover, { compose: state.compose, t }) : null,
        h(BadgeLayer, { t }),
        h(Drawer, { t }),
        state.toast ? h('div', { className: 'rn-toast' + (state.toast.kind === 'error' ? ' error' : '') }, state.toast.text) : null)
    }

    function useSelectionTracking(t) {
      React.useEffect(() => {
        let timer = 0
        const read = () => {
          if (store.compose) return
          const result = readSelection()
          if (result) {
            store.selection = result
            store.bump()
          } else if (store.selection) {
            store.selection = null
            store.bump()
          }
        }
        const scheduleRead = () => {
          if (timer) clearTimeout(timer)
          timer = setTimeout(read, 120)
        }
        const insideUi = (event) => {
          const target = event.target
          return target instanceof Element && Boolean(target.closest('[data-review-ui]'))
        }
        const onMouseUp = (event) => {
          if (insideUi(event)) return
          scheduleRead()
        }
        const onMouseDown = (event) => {
          if (insideUi(event)) return
          if (store.selection) {
            store.selection = null
            store.bump()
          }
        }
        const onScroll = () => {
          if (store.selection) {
            store.selection = null
            store.bump()
          }
        }
        const onKeyDown = (event) => {
          if (event.key === 'Escape') {
            if (store.compose) {
              store.compose = null
              store.bump()
              return
            }
            if (store.panel) {
              store.panel = false
              store.bump()
            }
            return
          }
          if (event.altKey && !event.ctrlKey && !event.metaKey && (event.key === 'a' || event.key === 'A')) {
            const result = readSelection()
            if (!result) return
            event.preventDefault()
            openCompose(result.target, result.popoverRect || result.rect)
          }
        }
        document.addEventListener('mouseup', onMouseUp, true)
        document.addEventListener('mousedown', onMouseDown, true)
        document.addEventListener('keydown', onKeyDown, true)
        window.addEventListener('scroll', onScroll, true)
        return () => {
          if (timer) clearTimeout(timer)
          document.removeEventListener('mouseup', onMouseUp, true)
          document.removeEventListener('mousedown', onMouseDown, true)
          document.removeEventListener('keydown', onKeyDown, true)
          window.removeEventListener('scroll', onScroll, true)
        }
      }, [t])
    }

    function useReposition() {
      React.useEffect(() => {
        const onMove = () => scheduleBadgeLayout()
        window.addEventListener('scroll', onMove, true)
        window.addEventListener('resize', onMove)
        return () => {
          window.removeEventListener('scroll', onMove, true)
          window.removeEventListener('resize', onMove)
        }
      }, [])
    }

    function SendBridge(props) {
      const observable = typeof props.useInput === 'function'
      const input = observable ? props.useInput((value) => value) : null
      const ref = React.useRef({ draft: '', inputActions: props.inputActions, sessionId: props.sessionId, observable })
      ref.current.draft = input && typeof input.draft === 'string' ? input.draft : ''
      ref.current.inputActions = props.inputActions || ref.current.inputActions
      ref.current.sessionId = props.sessionId
      ref.current.observable = observable

      React.useEffect(() => {
        const sessionId = props.sessionId
        if (typeof sessionId !== 'string' || sessionId === '') return undefined
        activateSession(sessionId)
        const bridge = {
          sessionId,
          ref,
          send: (text) => sendThrough(sessionId, text, ref),
        }
        return registerBridge(sessionId, bridge)
      }, [props.sessionId])

      return null
    }

    function MessageAnnotateAction(props) {
      const state = useStore()
      if (!state.sessionId || !props.messageId) return null
      const click = (event) => {
        const rect = event.currentTarget.getBoundingClientRect()
        const row = event.currentTarget.closest('[data-chat-turn]')
        const turn = row ? parseTurn(row.getAttribute('data-chat-turn')) : undefined
        openCompose({
          sessionId: state.sessionId,
          messageId: props.messageId,
          turn,
          anchor: { kind: 'message' },
          quote: '',
          locator: translate('loc.message') + ' #' + shortId(props.messageId),
        }, { top: rect.top, left: rect.left, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height })
      }
      return h('button', {
        type: 'button',
        className: 'rn-action',
        title: translate('action.title'),
        'aria-label': translate('action.title'),
        onClick: click,
      }, h(IconPen, { size: 15 }))
    }

    /* ─────────────────────────────── css ─────────────────────────────── */

    const CSS = `
.rn-root,.rn-tray,.rn-action{
  --rn-brand:var(--dsw-static-blue-500,#3b82f6);
  --rn-bg:var(--dsw-alias-bg-layer-1,#fff);
  --rn-text:var(--dsw-alias-label-primary,#0f1115);
  --rn-muted:var(--dsw-alias-label-secondary,#61666b);
  --rn-line:var(--dsw-alias-border-l2,rgba(0,0,0,.1));
  --rn-layer:var(--dsw-alias-bg-layer-2,#f2f3f5);
  --rn-hover:var(--dsw-alias-interactive-bg-hover,rgba(38,49,72,.06));
  --rn-shadow:var(--dsw-elevation-prominent,0 0 0 .5px rgba(0,0,0,.16),0 8px 24px rgba(20,20,25,.12));
}
.rn-root{
  position:fixed;inset:0;z-index:75;pointer-events:none;
  color:var(--rn-text);font-size:13px;line-height:1.5;
  font-family:inherit;
}
.rn-root :where(button){font:inherit;color:inherit;border:0;background:none;cursor:pointer}
.rn-root *{box-sizing:border-box}
.rn-pill{
  position:fixed;z-index:78;display:inline-flex;align-items:center;gap:6px;height:30px;padding:0 10px 0 6px;
  border-radius:999px;background:var(--rn-bg);border:1px solid var(--rn-line);
  box-shadow:0 8px 24px rgba(20,20,25,.16),0 2px 6px rgba(20,20,25,.08);
  color:var(--rn-text);font-size:12.5px;white-space:nowrap;pointer-events:auto;
}
.rn-pill:hover{border-color:rgba(77,107,254,.45)}
.rn-pill-icon{width:18px;height:18px;border-radius:50%;background:var(--rn-brand);color:#fff;display:inline-flex;align-items:center;justify-content:center}
.rn-pill kbd{font-family:inherit;font-size:10.5px;color:var(--rn-muted);border:1px solid var(--rn-line);border-radius:4px;padding:0 4px;background:var(--rn-layer)}
.rn-pop{
  position:fixed;z-index:79;pointer-events:auto;padding:12px;border-radius:14px;background:var(--rn-bg);
  border:1px solid var(--rn-line);box-shadow:0 18px 48px rgba(20,20,25,.22),0 4px 12px rgba(20,20,25,.08);
}
.rn-pop-head{display:flex;align-items:center;gap:8px;margin-bottom:8px}
.rn-pop-title{font-weight:600;font-size:13px}
.rn-pop-locator{margin-left:auto;font-size:11px;color:var(--rn-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:210px}
.rn-pop-quote{
  padding:7px 9px;border-radius:8px;background:var(--rn-layer);border-left:2px solid rgba(77,107,254,.45);
  color:var(--rn-muted);font-size:12px;line-height:1.55;max-height:72px;overflow:hidden;
  white-space:pre-wrap;word-break:break-word;
}
.rn-pop-quote-message{font-style:italic}
.rn-field{margin-top:9px;border:1px solid var(--rn-line);border-radius:9px;padding:6px 9px 7px;background:var(--rn-bg)}
.rn-field:focus-within{border-color:rgba(77,107,254,.55)}
.rn-field-label{display:block;font-size:10.5px;color:var(--rn-muted);margin-bottom:1px}
.rn-input{display:block;width:100%;border:0;outline:none;resize:none;background:transparent;color:var(--rn-text);font:inherit;font-size:13.5px;line-height:1.6;min-height:58px;padding:0}
.rn-input::placeholder,.rn-overall::placeholder{color:var(--rn-muted);opacity:.75}
.rn-tags{display:flex;gap:6px;margin-top:8px;flex-wrap:wrap}
.rn-tag{height:24px;padding:0 9px;border-radius:999px;border:1px solid var(--rn-line);color:var(--rn-muted);font-size:11.5px;background:var(--rn-bg)}
.rn-tag:hover{border-color:rgba(77,107,254,.4)}
.rn-tag.on{background:rgba(77,107,254,.1);border-color:rgba(77,107,254,.4);color:var(--rn-brand)}
.rn-pop-foot{display:flex;align-items:center;gap:8px;margin-top:10px;padding-top:9px;border-top:1px solid var(--rn-line)}
.rn-hint{font-size:10.5px;color:var(--rn-muted)}
.rn-spacer{margin-left:auto}
.rn-btn{height:28px;padding:0 11px;border-radius:7px;border:1px solid var(--rn-line);background:var(--rn-bg);color:var(--rn-text);font-size:12px;white-space:nowrap}
.rn-btn:hover{background:var(--rn-layer)}
.rn-btn.primary{background:var(--rn-brand);border-color:transparent;color:#fff;font-weight:600}
.rn-btn.primary:hover{filter:brightness(1.05);background:var(--rn-brand)}
.rn-btn.primary:disabled{opacity:.55;cursor:default;filter:none}
.rn-btn.ghost{border-color:transparent;background:transparent;color:var(--rn-muted)}
.rn-btn.ghost:hover{background:var(--rn-layer);color:var(--rn-text)}
.rn-btn.sm{height:26px;padding:0 9px;font-size:11.5px;border-radius:6px}
.rn-badges{position:fixed;inset:0;z-index:74;pointer-events:none}
.rn-badge{
  position:fixed;top:-100px;left:-100px;width:16px;height:16px;border-radius:50%;background:var(--rn-brand);color:#fff;
  font-size:10px;font-weight:650;line-height:1;display:inline-flex;align-items:center;justify-content:center;
  box-shadow:0 0 0 2px var(--rn-bg),0 2px 6px rgba(20,20,25,.18);pointer-events:auto;padding:0;
}
.rn-badge:hover{transform:scale(1.12)}
.rn-tray{
  position:absolute;left:0;right:0;top:0;z-index:1;pointer-events:auto;
  display:flex;align-items:center;gap:10px;height:44px;padding:0 12px;
  border:0;border-bottom:1px solid var(--rn-line);border-radius:0;background:transparent;
}
.rn-tray[hidden]{display:none!important}
.rn-card-pad{padding-top:var(--rn-tray-pad,52px)!important}
.rn-tray-icon{width:24px;height:24px;border-radius:7px;background:rgba(77,107,254,.1);color:var(--rn-brand);display:inline-flex;align-items:center;justify-content:center;flex:none}
.rn-tray-main{display:flex;align-items:center;gap:4px;min-width:0;flex:1 1 auto;cursor:pointer;border-radius:6px;outline:none}
.rn-tray-main:focus-visible{box-shadow:0 0 0 2px rgba(77,107,254,.4)}
.rn-tray-title{display:inline-flex;align-items:baseline;gap:4px;font-size:12.5px;font-weight:600;white-space:nowrap;flex:none}
.rn-tray-count{color:var(--rn-brand)}
.rn-tray-sub{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:11.5px;color:var(--rn-muted)}
.rn-tray-actions{display:flex;align-items:center;gap:6px;flex:none}
.rn-drawer{
  position:fixed;z-index:73;top:66px;right:12px;bottom:auto;width:min(420px,calc(100vw - 24px));
  max-height:calc(100vh - 78px);
  display:flex;flex-direction:column;pointer-events:auto;border-radius:14px;
  background:var(--rn-bg);border:1px solid var(--rn-line);
  box-shadow:0 24px 60px rgba(20,20,25,.22),0 4px 14px rgba(20,20,25,.08);overflow:hidden;
}
.rn-drawer-head{display:flex;align-items:center;gap:8px;padding:11px 12px;border-bottom:1px solid var(--rn-line);flex:none}
.rn-drawer-title{font-weight:650;font-size:13px}
.rn-chip{font-size:10.5px;color:var(--rn-muted);background:var(--rn-layer);border-radius:999px;padding:2px 7px;white-space:nowrap}
.rn-icon-btn{width:24px;height:24px;border-radius:6px;display:inline-flex;align-items:center;justify-content:center;color:var(--rn-muted);flex:none}
.rn-icon-btn:hover{background:var(--rn-layer);color:var(--rn-text)}
.rn-drawer-body{flex:1 1 auto;min-height:0;overflow-y:auto;padding:11px 12px 10px;display:block}
.rn-label{font-size:11px;color:var(--rn-muted);margin:0 0 6px}
.rn-summary{border:1px solid var(--rn-line);border-radius:9px;padding:7px 9px;margin-bottom:11px;background:var(--rn-bg)}
.rn-summary:focus-within{border-color:rgba(77,107,254,.5)}
.rn-overall{display:block;width:100%;border:0;outline:none;resize:none;background:transparent;color:var(--rn-text);font:inherit;font-size:12.5px;line-height:1.6;min-height:38px;padding:0}
.rn-item{position:relative;display:flex;gap:7px;padding:9px 9px 8px 8px;margin-bottom:7px;border:1px solid var(--rn-line);border-radius:10px;background:var(--rn-bg)}
.rn-item-num{width:16px;height:16px;border-radius:50%;background:var(--rn-brand);color:#fff;font-size:10px;font-weight:650;display:inline-flex;align-items:center;justify-content:center;flex:none;margin-top:1px}
.rn-item-body{min-width:0;flex:1 1 auto}
.rn-item-quote{font-size:11.5px;color:var(--rn-muted);line-height:1.5;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.rn-item-comment{margin-top:3px;font-size:12.5px;line-height:1.55;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden;word-break:break-word}
.rn-item-meta{margin-top:3px;font-size:10.5px;color:var(--rn-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.rn-item-actions{display:flex;flex-direction:column;gap:2px;flex:none}
.rn-link{font-size:10.5px;color:var(--rn-muted);padding:2px 3px;border-radius:4px;white-space:nowrap}
.rn-link:hover{background:var(--rn-layer);color:var(--rn-text)}
.rn-link.danger:hover{color:#c0392b}
.rn-drawer-hint{margin-top:10px;font-size:11px;line-height:1.55;color:var(--rn-muted)}
.rn-empty{padding:14px;text-align:center;color:var(--rn-muted);font-size:12px;border:1px dashed var(--rn-line);border-radius:9px;margin-bottom:10px}
.rn-drawer-foot{display:flex;align-items:center;gap:8px;padding:10px 12px;border-top:1px solid var(--rn-line);flex:none}
.rn-error{font-size:11px;color:#c0392b;max-width:190px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.rn-toast{
  position:fixed;z-index:80;left:50%;bottom:110px;transform:translateX(-50%);pointer-events:none;
  background:#1f2024;color:#fff;font-size:12.5px;padding:8px 14px;border-radius:9px;
  box-shadow:0 12px 32px rgba(0,0,0,.28);max-width:70vw;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;
}
.rn-toast.error{background:#8f2b20}
.rn-action{display:inline-flex;align-items:center;justify-content:center;width:26px;height:26px;border-radius:6px;color:var(--rn-muted);background:transparent}
.rn-action:hover{background:var(--rn-layer);color:var(--rn-text)}
::highlight(review-notes){background-color:rgba(77,107,254,.18);color:inherit}
@media (max-width:720px){
  .rn-drawer{top:auto;left:8px;right:8px;bottom:8px;width:auto;max-height:76vh}
}
`

    /* ───────────────────────────── lifecycle ───────────────────────────── */

    function apply(ctx) {
      const style = document.createElement('style')
      style.setAttribute('data-plugin', 'dsh-annotate')
      style.textContent = CSS
      document.head.appendChild(style)

      const locale = ctx.get('locale')
      if (locale) {
        if (typeof locale.register === 'function') {
          try {
            // Host form: one call registers every built-in language.
            locale.register(NS, { zh: DICTS['zh-CN'], en: DICTS['en-US'] })
          } catch {
            try {
              locale.register(NS, 'zh', DICTS['zh-CN'])
              locale.register(NS, 'en', DICTS['en-US'])
            } catch { /* custom namespaces may be rejected; local dict still works */ }
          }
        }
        translate = makeTranslator(locale)
      }

      try { services.sessions = ctx.get('sessions') } catch { services.sessions = null }

      const observer = new MutationObserver(() => scheduleResolve())
      observer.observe(document.body, { childList: true, subtree: true, characterData: true })

      const onStorage = (event) => {
        if (!event.key) return
        if (event.key === STORE_INDEX) return
        if (event.key !== STORE_PREFIX + store.sessionId) return
        const data = loadSession(store.sessionId)
        store.notes = data.notes
        store.overall = data.overall
        store.bump()
        scheduleResolve()
      }
      window.addEventListener('storage', onStorage)

      const disposeSubmitInterceptor = installSubmitInterceptor()

      ctx.effect(() => () => {
        disposeSubmitInterceptor()
        observer.disconnect()
        window.removeEventListener('storage', onStorage)
        if (resolveTimer) clearTimeout(resolveTimer)
        if (badgeFrame) cancelAnimationFrame(badgeFrame)
        if (toastTimer) clearTimeout(toastTimer)
        style.remove()
        try {
          if (window.CSS && window.CSS.highlights) window.CSS.highlights.delete('review-notes')
        } catch { /* ignore */ }
      })

      ctx.slots.inject('conversation.input.overlay', () => ctx.slots.register({
        name: 'conversation.input.overlay',
        id: 'annotate-tray',
        order: 20,
      }, (slotProps) => h(NotesDock, { ...slotProps, t: translate })))

      ctx.slots.inject('conversation.input.overlay', () => ctx.slots.register({
        name: 'conversation.input.overlay',
        id: 'annotate-bridge',
        order: 95,
      }, (slotProps) => h(SendBridge, slotProps)))

      ctx.slots.inject('shell.overlay', () => ctx.slots.register({
        name: 'shell.overlay',
        id: 'annotate-overlay',
        order: 20,
      }, () => h(OverlayRoot, { t: translate })))

      ctx.slots.inject('conversation.chat.assistant-actions', () => ctx.slots.register({
        name: 'conversation.chat.assistant-actions',
        id: 'annotate-action',
        order: 30,
      }, (slotProps) => h(MessageAnnotateAction, slotProps)))
    }

    return {
      name: 'dsh-annotate-client',
      inject: ['slots'],
      apply,
      __test__: {
        buildBatchText,
        batchTextFor,
        mergeBatchIntoDraft,
        shouldMergeDraft,
        findQuote,
        groupNotes,
        clip,
        format,
        shortId,
        makeTranslator,
        readSelection,
        resolveRangeIn,
        topBlocks,
        fiberContext,
        buildLocator,
        parseTurn,
        activateSession,
        addNote,
        removeNote,
        loadSession,
        store,
        DICTS,
      },
    }
  },
})
