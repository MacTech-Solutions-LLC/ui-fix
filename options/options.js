const endpointInput = document.getElementById('endpoint')
const tokenInput = document.getElementById('authToken')
const submitterInput = document.getElementById('submitter')
const statusEl = document.getElementById('status')

chrome.storage.sync.get(
  ['endpoint', 'authToken', 'submitter'],
  ({ endpoint, authToken, submitter }) => {
    if (endpoint) endpointInput.value = endpoint
    if (authToken) tokenInput.value = authToken
    if (submitter) submitterInput.value = submitter
  },
)

function setStatus(msg, isError = false) {
  statusEl.textContent = msg
  statusEl.classList.toggle('err', isError)
  setTimeout(() => { statusEl.textContent = '' }, 3000)
}

document.getElementById('save').addEventListener('click', async () => {
  const endpoint = endpointInput.value.trim()
  const authToken = tokenInput.value.trim()
  const submitter = submitterInput.value.trim()

  if (endpoint) {
    let origin
    try {
      origin = new URL(endpoint).origin
    } catch {
      setStatus('Invalid URL', true)
      return
    }
    // The background fetch needs host permission for the endpoint's origin.
    const granted = await chrome.permissions.request({ origins: [`${origin}/*`] })
    if (!granted) {
      setStatus('Permission for that host was declined', true)
      return
    }
  }

  await chrome.storage.sync.set({ endpoint, authToken, submitter })
  setStatus('Saved ✓')
})
