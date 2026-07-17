// UI-Fix element picker — vanilla-JS port of the Trust Codex feedback widget
// (ElementSelector.tsx + FeedbackModal.tsx). Injected on demand; toggled by
// the toolbar button, the Alt+Shift+F command, or Shift+F in-page.
;(() => {
  if (window.__uiFixPickerLoaded) return
  window.__uiFixPickerLoaded = true

  // ---------------------------------------------------------------------
  // Selector + descriptor extraction (ported 1:1 from ElementSelector.tsx)
  // ---------------------------------------------------------------------

  /** Prefer data-testid → aria-label → id → first class → path */
  function generatePathSelector(el) {
    const path = []
    let current = el
    while (current && current.nodeType === Node.ELEMENT_NODE) {
      let selector = current.nodeName.toLowerCase()
      if (current.id) {
        selector += `#${current.id}`
        path.unshift(selector)
        break
      }
      if (current.className && typeof current.className === 'string') {
        const classes = current.className.trim().split(/\s+/).filter(Boolean)
        if (classes.length > 0) {
          selector += `.${classes[0].replace(/[.#:[\]]/g, '\\$&')}`
        }
      }
      const parent = current.parentElement
      if (parent) {
        const siblings = Array.from(parent.children)
        const idx = siblings.indexOf(current) + 1
        if (siblings.length > 1) selector += `:nth-child(${idx})`
      }
      path.unshift(selector)
      current = current.parentElement
    }
    return path.join(' > ')
  }

  function generateSelector(el) {
    const testId = el.getAttribute('data-testid')
    if (testId) return `[data-testid="${testId}"]`
    const ariaLabel = el.getAttribute('aria-label')
    if (ariaLabel) return `[aria-label="${ariaLabel}"]`
    if (el.id) return `#${el.id}`
    if (el.className && typeof el.className === 'string') {
      const classes = el.className.trim().split(/\s+/).filter(Boolean)
      if (classes.length > 0) return `.${classes[0].replace(/[.#:[\]]/g, '\\$&')}`
    }
    return generatePathSelector(el)
  }

  /** Collapse whitespace and clip long strings for description fields. */
  function normalize(text, max = 120) {
    if (!text) return null
    const t = text.replace(/\s+/g, ' ').trim()
    if (!t) return null
    return t.length > max ? `${t.slice(0, max - 1)}…` : t
  }

  /** Best-effort accessible name: aria-label, aria-labelledby, or visible label. */
  function accessibleName(el) {
    const ariaLabel = el.getAttribute('aria-label')
    if (ariaLabel) return normalize(ariaLabel, 80)
    const labelledby = el.getAttribute('aria-labelledby')
    if (labelledby) {
      const labels = labelledby
        .split(/\s+/)
        .map((id) => document.getElementById(id)?.textContent ?? '')
        .filter(Boolean)
        .join(' ')
      if (labels) return normalize(labels, 80)
    }
    if (el.tagName === 'INPUT' || el.tagName === 'SELECT' || el.tagName === 'TEXTAREA') {
      if (el.id) {
        const label = document.querySelector(`label[for="${CSS.escape(el.id)}"]`)
        if (label?.textContent) return normalize(label.textContent, 80)
      }
      const wrappingLabel = el.closest('label')
      if (wrappingLabel?.textContent) return normalize(wrappingLabel.textContent, 80)
      if (el.placeholder) return normalize(el.placeholder, 80)
    }
    const title = el.getAttribute('title')
    if (title) return normalize(title, 80)
    return null
  }

  /** Immediate visible text of this element. */
  function ownText(el) {
    const accessible = accessibleName(el)
    if (accessible) return accessible
    return normalize(el.textContent, 160)
  }

  /**
   * Walks ancestors and returns a breadcrumb of human-readable labels:
   * page landmarks (<main>, <header>, <nav>) → <section>/<article> headings →
   * card/container headings → nearest label for the clicked element.
   */
  function buildSectionTrail(el) {
    const trail = []
    const seen = new Set()
    const pushUnique = (label) => {
      const clean = normalize(label ?? null, 80)
      if (!clean || seen.has(clean)) return
      seen.add(clean)
      trail.push(clean)
    }

    const landmarkFor = (node) => {
      const tag = node.tagName.toLowerCase()
      const role = node.getAttribute('role')
      if (tag === 'main' || role === 'main') return 'Main content'
      if (tag === 'nav' || role === 'navigation')
        return `Nav${node.getAttribute('aria-label') ? ` · ${node.getAttribute('aria-label')}` : ''}`
      if (tag === 'aside' || role === 'complementary') return 'Sidebar'
      if (tag === 'header' || role === 'banner') return 'Header'
      if (tag === 'footer' || role === 'contentinfo') return 'Footer'
      if (tag === 'dialog' || role === 'dialog' || node.getAttribute('aria-modal') === 'true') return 'Dialog'
      return null
    }

    const nearestHeading = (node) => {
      const headings = node.querySelectorAll('h1,h2,h3,h4,h5,h6')
      for (const h of Array.from(headings)) {
        if (h.textContent?.trim()) return normalize(h.textContent, 80)
      }
      return null
    }

    let current = el
    let depth = 0
    while (current && depth < 24) {
      if (current !== el) {
        const aria = current.getAttribute('aria-label')
        if (aria) pushUnique(aria)
        const labelledby = current.getAttribute('aria-labelledby')
        if (labelledby) {
          const labelText = labelledby
            .split(/\s+/)
            .map((id) => document.getElementById(id)?.textContent ?? '')
            .filter(Boolean)
            .join(' ')
          pushUnique(labelText)
        }
        const tag = current.tagName.toLowerCase()
        if (tag === 'section' || tag === 'article' || current.getAttribute('role') === 'region') {
          pushUnique(nearestHeading(current))
        }
        pushUnique(landmarkFor(current))
      }
      current = current.parentElement
      depth++
    }

    return trail.reverse()
  }

  function extractElementData(el) {
    const tag = el.tagName.toLowerCase()
    const role = el.getAttribute('role')
    const ariaLabel = accessibleName(el)
    const text = ownText(el)
    const pageTitle = normalize(document.title, 120)
    const pageHost = window.location.host
    const pagePath = window.location.pathname + window.location.search
    const sectionTrail = buildSectionTrail(el)

    const descriptorParts = []
    // Multi-site usage: lead the trail with the host so a reviewer can tell
    // which site the pinpoint came from without opening the raw pageUrl.
    if (pagePath) descriptorParts.push(`Page ${pageHost}${pagePath}${pageTitle ? ` "${pageTitle}"` : ''}`)
    if (sectionTrail.length) descriptorParts.push(sectionTrail.join(' › '))
    const elementLabel = [
      `<${tag}${role ? ` role="${role}"` : ''}${ariaLabel ? ` aria-label="${ariaLabel}"` : ''}>`,
      text ? `"${text}"` : '',
    ].filter(Boolean).join(' ')
    descriptorParts.push(elementLabel)

    return {
      selector: generateSelector(el),
      elementId: el.id || null,
      elementClass:
        el.className && typeof el.className === 'string'
          ? el.className.trim().split(/\s+/)[0] || null
          : null,
      elementText: descriptorParts.join(' › '),
      elementType: tag,
      pageTitle,
      pageHost,
      pagePath,
      sectionTrail,
      ownText: text,
      ariaLabel,
      role,
    }
  }

  // ---------------------------------------------------------------------
  // UI shell — everything lives in a shadow root so page CSS can't touch it
  // ---------------------------------------------------------------------

  const HOST_ID = '__ui-fix-host'
  let host = null
  let shadow = null
  let selecting = false
  let highlighted = null
  let modalEl = null

  const STYLES = `
    :host { all: initial; }
    * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; }
    .overlay { position: fixed; inset: 0; z-index: 2147483644; background: rgba(0,0,0,.2); pointer-events: none; }
    .banner { position: fixed; top: 16px; left: 50%; transform: translateX(-50%); z-index: 2147483645;
      display: flex; align-items: center; gap: 12px; border-radius: 12px; background: #fff;
      padding: 10px 20px; box-shadow: 0 10px 25px rgba(0,0,0,.15); border: 1px solid #c7d2fe; pointer-events: auto; }
    .banner .dot { height: 8px; width: 8px; border-radius: 999px; background: #6366f1; animation: uifix-pulse 1.2s ease-in-out infinite; }
    @keyframes uifix-pulse { 0%,100% { opacity: 1 } 50% { opacity: .35 } }
    .banner p { font-size: 13px; font-weight: 500; color: #262626; }
    .banner button { margin-left: 8px; border: 0; border-radius: 6px; padding: 4px 10px; font-size: 11px;
      font-weight: 600; color: #737373; background: transparent; cursor: pointer; }
    .banner button:hover { background: #f5f5f5; }
    .tooltip { position: fixed; z-index: 2147483646; pointer-events: none; border-radius: 6px;
      background: #171717; padding: 6px 10px; font-size: 11px; font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      color: #fff; box-shadow: 0 4px 12px rgba(0,0,0,.25); max-width: 420px; overflow-wrap: break-word; line-height: 1.35; }

    .modal-backdrop { position: fixed; inset: 0; z-index: 2147483647; display: flex; align-items: center;
      justify-content: center; padding: 16px; background: rgba(0,0,0,.5); backdrop-filter: blur(4px); pointer-events: auto; }
    .modal { background: #fff; border-radius: 16px; width: 100%; max-width: 520px; box-shadow: 0 25px 50px rgba(0,0,0,.25);
      overflow: hidden; }
    .modal-header { display: flex; align-items: center; justify-content: space-between; padding: 18px 24px 14px; border-bottom: 1px solid #f5f5f5; }
    .modal-header .title-wrap { display: flex; align-items: center; gap: 10px; }
    .modal-header .icon { display: flex; height: 32px; width: 32px; align-items: center; justify-content: center;
      border-radius: 8px; background: #eef2ff; color: #4f46e5; font-size: 16px; }
    .modal-header h2 { font-size: 15px; font-weight: 600; color: #171717; line-height: 1.2; }
    .modal-header .sub { font-size: 11px; color: #a3a3a3; }
    .close-btn { border: 0; background: transparent; border-radius: 8px; padding: 6px; color: #a3a3a3; cursor: pointer; font-size: 16px; line-height: 1; }
    .close-btn:hover { color: #525252; background: #f5f5f5; }
    .modal-body { padding: 18px 24px 20px; display: flex; flex-direction: column; gap: 14px; }
    .label { font-size: 11px; font-weight: 500; color: #737373; text-transform: uppercase; letter-spacing: .05em; margin-bottom: 8px; }
    .pills { display: flex; flex-wrap: wrap; gap: 8px; }
    .pill { display: flex; align-items: center; gap: 6px; border-radius: 999px; border: 1px solid; padding: 5px 12px;
      font-size: 12px; font-weight: 500; cursor: pointer; background: #fafafa; transition: all .15s; }
    .pill[data-cat="bug"]     { border-color: #fca5a5; background: #fef2f2; color: #b91c1c; }
    .pill[data-cat="ux"]      { border-color: #fcd34d; background: #fffbeb; color: #b45309; }
    .pill[data-cat="feature"] { border-color: #c4b5fd; background: #f5f3ff; color: #6d28d9; }
    .pill[data-cat="general"] { border-color: #d4d4d4; background: #fafafa; color: #404040; }
    .pill.selected[data-cat="bug"]     { background: #dc2626; border-color: #dc2626; color: #fff; }
    .pill.selected[data-cat="ux"]      { background: #f59e0b; border-color: #f59e0b; color: #fff; }
    .pill.selected[data-cat="feature"] { background: #7c3aed; border-color: #7c3aed; color: #fff; }
    .pill.selected[data-cat="general"] { background: #404040; border-color: #404040; color: #fff; }
    .pin { display: flex; align-items: flex-start; gap: 10px; border-radius: 12px; background: #eef2ff;
      border: 1px solid #c7d2fe; padding: 10px 12px; }
    .pin .target { flex-shrink: 0; margin-top: 2px; font-size: 13px; }
    .pin .body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 4px; }
    .pin .head { font-size: 11px; font-weight: 600; color: #3730a3; }
    .pin .row { font-size: 11px; color: #4338ca; }
    .pin .row .k { font-weight: 500; }
    .pin .mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
    .pin .selector { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 10px; color: #6366f1; word-break: break-all; }
    .pin .remove { flex-shrink: 0; border: 0; background: transparent; color: #818cf8; cursor: pointer; font-size: 13px; line-height: 1; }
    .pin .remove:hover { color: #3730a3; }
    textarea { width: 100%; border-radius: 12px; border: 1px solid #e5e5e5; padding: 12px 14px; font-size: 13px;
      color: #171717; resize: none; outline: none; transition: box-shadow .15s; min-height: 110px; }
    textarea:focus { box-shadow: 0 0 0 2px #6366f1; border-color: transparent; }
    textarea::placeholder { color: #a3a3a3; }
    .meta-row { display: flex; justify-content: space-between; font-size: 11px; color: #a3a3a3; margin-top: 4px; padding: 0 2px; }
    .error { border-radius: 8px; background: #fef2f2; border: 1px solid #fecaca; padding: 10px 14px; font-size: 13px; color: #991b1b; }
    .actions { display: flex; justify-content: flex-end; gap: 8px; padding-top: 4px; }
    .btn { border: 0; border-radius: 8px; padding: 8px 16px; font-size: 13px; font-weight: 500; cursor: pointer; transition: background .15s; }
    .btn:disabled { opacity: .4; cursor: not-allowed; }
    .btn-secondary { color: #525252; background: #f5f5f5; }
    .btn-secondary:hover:not(:disabled) { background: #e5e5e5; }
    .btn-primary { color: #fff; background: #4f46e5; font-weight: 600; }
    .btn-primary:hover:not(:disabled) { background: #4338ca; }
    .btn-ghost { color: #4f46e5; background: transparent; margin-right: auto; }
    .btn-ghost:hover:not(:disabled) { background: #eef2ff; }
    .success { display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 48px 24px; text-align: center; }
    .success .check { display: flex; height: 56px; width: 56px; align-items: center; justify-content: center;
      border-radius: 999px; background: #d1fae5; color: #059669; font-size: 28px; margin-bottom: 16px; }
    .success h3 { font-size: 17px; font-weight: 600; color: #171717; margin-bottom: 4px; }
    .success p { font-size: 13px; color: #737373; }
  `

  function ensureHost() {
    if (host && document.documentElement.contains(host)) return
    host = document.createElement('div')
    host.id = HOST_ID
    shadow = host.attachShadow({ mode: 'open' })
    const style = document.createElement('style')
    style.textContent = STYLES
    shadow.appendChild(style)
    document.documentElement.appendChild(host)
  }

  function isPickerOwned(el) {
    return el === host || host?.contains(el)
  }

  // -------------------------------------------------------------------
  // Highlighting (inline styles on the page element, same as the source)
  // -------------------------------------------------------------------

  function removeHighlight(el) {
    if (!el) return
    el.style.outline = ''
    el.style.outlineOffset = ''
    el.style.backgroundColor = ''
    el.style.cursor = ''
  }

  function addHighlight(el, selected = false) {
    el.style.outline = selected ? '3px solid rgb(34,197,94)' : '2px solid rgb(99,102,241)'
    el.style.outlineOffset = '2px'
    el.style.backgroundColor = selected ? 'rgba(34,197,94,0.08)' : 'rgba(99,102,241,0.08)'
    el.style.cursor = 'pointer'
  }

  // -------------------------------------------------------------------
  // Selection mode
  // -------------------------------------------------------------------

  let overlayEl = null
  let bannerEl = null
  let tooltipEl = null

  function handleMouseMove(e) {
    const target = e.target
    if (!target || isPickerOwned(target)) {
      removeHighlight(highlighted)
      highlighted = null
      if (tooltipEl) tooltipEl.style.display = 'none'
      return
    }
    if (highlighted && highlighted !== target) removeHighlight(highlighted)
    if (target !== highlighted) {
      addHighlight(target)
      highlighted = target
      const tag = target.tagName.toLowerCase()
      const text = ownText(target)
      const trail = buildSectionTrail(target)
      const trailStr = trail.length ? `${trail.slice(-2).join(' › ')} › ` : ''
      tooltipEl.textContent = [trailStr + `<${tag}>`, text ? `"${text}"` : ''].filter(Boolean).join(' ')
      tooltipEl.style.display = 'block'
    }
    tooltipEl.style.left = `${e.clientX + 14}px`
    tooltipEl.style.top = `${e.clientY + 14}px`
  }

  function handleClick(e) {
    const target = e.target
    if (!target || isPickerOwned(target)) return
    e.preventDefault()
    e.stopPropagation()
    addHighlight(target, true)
    const data = extractElementData(target)
    const flashed = target
    setTimeout(() => removeHighlight(flashed), 300)
    highlighted = null
    stopSelection()
    openModal(data)
  }

  function handleKeydown(e) {
    if (e.key === 'Escape') stopSelection()
  }

  function startSelection() {
    if (selecting) return
    ensureHost()
    selecting = true

    overlayEl = document.createElement('div')
    overlayEl.className = 'overlay'
    shadow.appendChild(overlayEl)

    bannerEl = document.createElement('div')
    bannerEl.className = 'banner'
    bannerEl.innerHTML = `<span class="dot"></span><p>Click any element to attach it to your feedback</p><button type="button">ESC to cancel</button>`
    bannerEl.querySelector('button').addEventListener('click', stopSelection)
    shadow.appendChild(bannerEl)

    tooltipEl = document.createElement('div')
    tooltipEl.className = 'tooltip'
    tooltipEl.style.display = 'none'
    shadow.appendChild(tooltipEl)

    document.addEventListener('mousemove', handleMouseMove, true)
    document.addEventListener('click', handleClick, true)
    document.addEventListener('keydown', handleKeydown, true)
    document.body.style.cursor = 'crosshair'
  }

  function stopSelection() {
    if (!selecting) return
    selecting = false
    document.removeEventListener('mousemove', handleMouseMove, true)
    document.removeEventListener('click', handleClick, true)
    document.removeEventListener('keydown', handleKeydown, true)
    document.body.style.cursor = ''
    removeHighlight(highlighted)
    highlighted = null
    overlayEl?.remove(); overlayEl = null
    bannerEl?.remove(); bannerEl = null
    tooltipEl?.remove(); tooltipEl = null
  }

  // -------------------------------------------------------------------
  // Modal
  // -------------------------------------------------------------------

  const CATEGORIES = [
    { value: 'bug', label: '🐞 Bug' },
    { value: 'ux', label: '🎨 UX' },
    { value: 'feature', label: '✨ Feature' },
    { value: 'general', label: '💬 General' },
  ]

  function esc(s) {
    return String(s).replace(/[&<>"']/g, (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
  }

  function closeModal() {
    modalEl?.remove()
    modalEl = null
  }

  function openModal(elementData) {
    ensureHost()
    closeModal()

    let category = 'general'
    let pinned = elementData

    modalEl = document.createElement('div')
    modalEl.className = 'modal-backdrop'

    const pinHtml = () => {
      if (!pinned) return ''
      const pageRow = pinned.pagePath
        ? `<p class="row"><span class="k">Page:</span> <span class="mono">${esc((pinned.pageHost ?? '') + pinned.pagePath)}</span>${pinned.pageTitle ? ` — ${esc(pinned.pageTitle)}` : ''}</p>` : ''
      const sectionRow = pinned.sectionTrail?.length
        ? `<p class="row"><span class="k">Section:</span> ${esc(pinned.sectionTrail.join(' › '))}</p>` : ''
      const attrs = `${pinned.role ? ` role="${esc(pinned.role)}"` : ''}${pinned.ariaLabel ? ` aria-label="${esc(pinned.ariaLabel)}"` : ''}`
      const own = pinned.ownText
        ? ` "${esc(pinned.ownText.length > 80 ? pinned.ownText.slice(0, 80) + '…' : pinned.ownText)}"` : ''
      return `
        <div class="pin">
          <span class="target">🎯</span>
          <div class="body">
            <p class="head">Pinned element</p>
            ${pageRow}
            ${sectionRow}
            <p class="row"><span class="k">Element:</span> <span class="mono">&lt;${esc(pinned.elementType ?? '')}${attrs}&gt;</span>${own}</p>
            <p class="selector">${esc(pinned.selector)}</p>
          </div>
          <button class="remove" type="button" aria-label="Remove pinned element" data-act="unpin">✕</button>
        </div>`
    }

    modalEl.innerHTML = `
      <div class="modal" role="dialog" aria-modal="true">
        <div class="modal-header">
          <div class="title-wrap">
            <div class="icon">💬</div>
            <div>
              <h2>Submit Feedback</h2>
              <p class="sub">UI-Fix element pinpoint</p>
            </div>
          </div>
          <button class="close-btn" type="button" aria-label="Close" data-act="close">✕</button>
        </div>
        <div class="modal-body">
          <div>
            <p class="label">Category</p>
            <div class="pills">
              ${CATEGORIES.map((c) =>
                `<button type="button" class="pill${c.value === category ? ' selected' : ''}" data-cat="${c.value}">${c.label}</button>`
              ).join('')}
            </div>
          </div>
          <div data-slot="pin">${pinHtml()}</div>
          <div>
            <p class="label">Your feedback</p>
            <textarea maxlength="5000" placeholder="Describe what you noticed, what you expected, or what you'd like to see…"></textarea>
            <div class="meta-row"><span data-slot="count">0 / 5000</span><span>⌘↵ to submit</span></div>
          </div>
          <div class="error" data-slot="error" style="display:none"></div>
          <div class="actions">
            <button class="btn btn-ghost" type="button" data-act="copy">Copy as JSON</button>
            <button class="btn btn-secondary" type="button" data-act="close">Cancel</button>
            <button class="btn btn-primary" type="button" data-act="send" disabled>Send Feedback</button>
          </div>
        </div>
      </div>`

    const $ = (sel) => modalEl.querySelector(sel)
    const textarea = $('textarea')
    const sendBtn = $('[data-act="send"]')
    const errorBox = $('[data-slot="error"]')

    const buildPayload = () => ({
      content: textarea.value.trim(),
      category,
      pageUrl: window.location.href,
      elementSelector: pinned?.selector,
      elementId: pinned?.elementId,
      elementClass: pinned?.elementClass,
      elementText: pinned?.elementText,
      elementType: pinned?.elementType,
    })

    const showError = (msg) => {
      errorBox.textContent = msg
      errorBox.style.display = msg ? 'block' : 'none'
    }

    const showSuccess = () => {
      $('.modal-body').outerHTML = `
        <div class="success">
          <div class="check">✓</div>
          <h3>Thanks for the feedback!</h3>
          <p>It has been logged and will be reviewed shortly.</p>
        </div>`
      setTimeout(closeModal, 1800)
    }

    const submit = async () => {
      if (!textarea.value.trim()) { showError('Please enter your feedback'); return }
      showError('')
      sendBtn.disabled = true
      sendBtn.textContent = 'Sending…'
      try {
        const res = await chrome.runtime.sendMessage({ type: 'ui-fix:submit', payload: buildPayload() })
        if (!res?.ok) throw new Error(res?.error || 'Failed to submit feedback')
        showSuccess()
      } catch (err) {
        showError(err instanceof Error ? err.message : 'Failed to submit. Please try again.')
        sendBtn.disabled = false
        sendBtn.textContent = 'Send Feedback'
      }
    }

    modalEl.addEventListener('click', (e) => {
      if (e.target === modalEl) { closeModal(); return }
      const pill = e.target.closest?.('.pill')
      if (pill) {
        category = pill.dataset.cat
        modalEl.querySelectorAll('.pill').forEach((p) => p.classList.toggle('selected', p === pill))
        return
      }
      const act = e.target.closest?.('[data-act]')?.dataset.act
      if (act === 'close') closeModal()
      if (act === 'unpin') { pinned = null; $('[data-slot="pin"]').innerHTML = '' }
      if (act === 'send') submit()
      if (act === 'copy') {
        navigator.clipboard.writeText(JSON.stringify(buildPayload(), null, 2)).then(
          () => { const b = $('[data-act="copy"]'); b.textContent = 'Copied ✓'; setTimeout(() => { b.textContent = 'Copy as JSON' }, 1500) },
          () => showError('Could not copy to clipboard')
        )
      }
    })

    textarea.addEventListener('input', () => {
      $('[data-slot="count"]').textContent = `${textarea.value.length} / 5000`
      sendBtn.disabled = !textarea.value.trim()
    })
    textarea.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); submit() }
      e.stopPropagation() // keep page shortcuts from firing while typing
    })
    modalEl.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { e.stopPropagation(); closeModal() }
    })

    shadow.appendChild(modalEl)
    setTimeout(() => textarea.focus(), 50)
  }

  // -------------------------------------------------------------------
  // Entry points: toolbar/command message + in-page Shift+F
  // -------------------------------------------------------------------

  function toggle() {
    if (modalEl) { closeModal(); return }
    if (selecting) stopSelection()
    else startSelection()
  }

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg?.type === 'ui-fix:toggle') {
      toggle()
      sendResponse({ ok: true })
    }
  })

  document.addEventListener('keydown', (e) => {
    if (e.shiftKey && e.key === 'F' && !e.ctrlKey && !e.metaKey && !e.altKey) {
      const tag = e.target?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || e.target?.isContentEditable) return
      if (modalEl) return
      e.preventDefault()
      toggle()
    }
  })

  // No self-toggle on load: the background always follows injection with a
  // 'ui-fix:toggle' message, on first injection and re-clicks alike.
})()
