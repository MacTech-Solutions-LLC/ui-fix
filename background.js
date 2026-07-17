// UI-Fix service worker: injects the picker on demand and relays feedback
// submissions to the configured endpoint (cookies included, so session-auth
// backends like the Trust Codex /api/feedback route work as-is).

async function togglePicker(tab) {
  if (!tab?.id) return
  // chrome:// pages, the Web Store, etc. reject injection — ignore quietly.
  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ['content/picker.js'],
    })
    await chrome.tabs.sendMessage(tab.id, { type: 'ui-fix:toggle' })
  } catch (e) {
    console.warn('UI-Fix: cannot inject on this page', e)
  }
}

chrome.action.onClicked.addListener(togglePicker)

chrome.commands.onCommand.addListener(async (command, tab) => {
  if (command === 'toggle-picker') togglePicker(tab)
})

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type !== 'ui-fix:submit') return

  ;(async () => {
    const { endpoint, authToken, submitter } = await chrome.storage.sync.get([
      'endpoint',
      'authToken',
      'submitter',
    ])
    if (!endpoint) {
      sendResponse({
        ok: false,
        error: 'No endpoint configured. Set one in the extension options, or use "Copy as JSON".',
      })
      return
    }
    try {
      const headers = { 'Content-Type': 'application/json' }
      if (authToken) headers['Authorization'] = `Bearer ${authToken}`
      // Tag the payload with who filed it (optional self-identification set
      // in Options). Lets the reviewer attribute feedback across the team.
      const payload = { ...msg.payload, submittedBy: submitter || null }
      const res = await fetch(endpoint, {
        method: 'POST',
        headers,
        credentials: 'include',
        body: JSON.stringify(payload),
      })
      let data = null
      try { data = await res.json() } catch { /* non-JSON response */ }
      if (!res.ok) {
        sendResponse({ ok: false, error: data?.error || `Submit failed (HTTP ${res.status})` })
        return
      }
      sendResponse({ ok: true, id: data?.id ?? null })
    } catch (e) {
      sendResponse({ ok: false, error: e instanceof Error ? e.message : 'Network error' })
    }
  })()

  return true // keep the message channel open for the async response
})
