# UI-Fix — Element Pinpoint (Chrome Extension)

A Chrome extension port of the Trust Codex feedback widget
(`cui-pilot/control-plane/src/components/feedback/`). Click the toolbar
button, then click any element on any page — the extension captures a
stable CSS selector plus a rich, reviewer-friendly location trail
(page → landmarks → section headings → element role/text) and opens a
feedback form pre-filled with the pinned element.

## Install (unpacked)

1. Open `chrome://extensions`
2. Enable **Developer mode** (top right)
3. Click **Load unpacked** and choose this folder (`ui-fix/`)

## Use

- Click the **UI-Fix toolbar icon** (or press **Alt+Shift+F**) to start
  picking. After the first activation on a page, **Shift+F** also toggles
  the picker.
- Hover shows a live tooltip with the element's section trail and text;
  click captures the element and opens the feedback modal. **ESC** cancels.
- Pick a category (Bug / UX / Feature / General), write your note, then:
  - **Send Feedback** — POSTs to your configured endpoint, or
  - **Copy as JSON** — copies the full payload to the clipboard (works
    with no backend configured).

## Configure the backend

Open the extension's **Options** page and set:

- **Feedback endpoint** — for MacTech Suite use
  `https://<your-suite-host>/api/public/feedback`. Saving requests host
  permission for that origin so the background service worker can POST
  to it.
- **Ingest secret (Bearer token)** — the shared `FEEDBACK_INGEST_SECRET`
  from the Suite, sent as `Authorization: Bearer …`. Required for the
  MacTech endpoint (the route is public at the auth edge and verifies
  this secret itself). Ask your admin for the value.
- **Your name / email** (optional) — tags each submission as
  `submittedBy` so the reviewer knows who filed it. Blank = anonymous.

### MacTech Suite integration

Feedback POSTed here lands in the Suite's **User Feedback** admin page
(`/admin/feedback`), where an admin triages the queue and can bundle open
items into a single Claude agent run that reads every note and corrects
each reported UI/UX issue. See the Suite repo's
`app/api/public/feedback/route.ts` (ingest) and
`app/(admin)/admin/feedback/` (review + dispatch).

## Payload shape

```json
{
  "content": "The save button overlaps the table on narrow screens",
  "category": "bug",
  "pageUrl": "https://app.example.com/dashboard/controls",
  "elementSelector": "[data-testid=\"save-button\"]",
  "elementId": null,
  "elementClass": "btn-primary",
  "elementText": "Page /dashboard/controls \"SCTM\" › Main content › \"Controls\" › <button> \"Save\"",
  "elementType": "button",
  "submittedBy": "patrick@mactechsolutionsllc.com"
}
```

`category` is one of `bug | ux | feature | general`. `submittedBy` is added
by the background worker from the Options "Your name / email" field (`null`
when blank).

## Layout

```
manifest.json         MV3 manifest (activeTab + scripting; host perms optional, requested on save)
background.js         Service worker: injects picker on demand, relays submits
content/picker.js     The picker + modal (vanilla JS, all UI in a shadow root)
options/              Endpoint + token settings
icons/                Generated toolbar icons
```

## Notes

- No content script runs until you activate it — the extension uses
  `activeTab` + on-demand injection, so there are no "read all sites"
  install warnings.
- All UI is rendered inside a closed-off shadow root, so page CSS can't
  break it and vice versa. Element highlighting uses inline outline
  styles on the hovered element, same as the original widget.
- Injection is blocked by Chrome on `chrome://` pages and the Web Store.
