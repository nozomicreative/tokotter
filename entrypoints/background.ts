// tokotter service worker — thin by design. No auth, no API proxy,
// no telemetry. Only: open the panel, write files to disk.
export default defineBackground(() => {
  chrome.runtime.onInstalled.addListener(() => {
    chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
  });

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    (async () => {
      if (msg?.type === 'TOKOTTER_DOWNLOAD') {
        const { filename, mime, base64 } = msg.file as {
          filename: string;
          mime: string;
          base64: string;
        };
        // Service workers have no URL.createObjectURL: use a data: URL,
        // the same mechanism Chrome's own download pipeline accepts.
        const id = await chrome.downloads.download({
          url: `data:${mime};base64,${base64}`,
          filename: safeName(filename),
          saveAs: false,
        });
        return { downloadId: id };
      }
      return { ok: false, error: 'Unknown message.' };
    })()
      .then((r) => sendResponse({ ok: true, data: r }))
      .catch((e) => sendResponse({ ok: false, error: e instanceof Error ? e.message : 'Failed.' }));
    return true;
  });
});

const UNSAFE_CHARS = new RegExp('[\u0000-\u001f<>:"|?*]', 'g');

function safeName(name: string): string {
  const clean = name
    .replace(/[/\\]+/g, '-')
    .replace(/\.{2,}/g, '.')
    .replace(UNSAFE_CHARS, '')
    .trim();
  const base = clean.length > 0 ? clean : 'tokotter-download';
  if (base.length <= 120) return base;
  const dot = base.lastIndexOf('.');
  const ext = dot > 0 && base.length - dot <= 12 ? base.slice(dot) : '';
  return base.slice(0, 120 - ext.length) + ext;
}
