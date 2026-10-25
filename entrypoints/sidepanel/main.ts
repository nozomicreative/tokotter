// tokotter side panel —vanilla TS, no framework. All state stays local:
// chrome.storage.local for prefs, IndexedDB for capture artifacts.
import { deriveSystem, slug, stamp, toRecords, tokenPackEntries } from '../../src/tokens';
import { cloneEntries } from '../../src/clone';
import { LOCALES, t, type Locale, type MsgKey } from '../../src/i18n';
import type { ScanEvidence } from '../../src/types';
import { makeZip } from '../../src/zip';

// ---------- tiny IndexedDB wrapper ----------
const DB = 'tokotter';
const STORE = 'captures';

export interface Capture {
  id: string;
  url: string;
  title: string;
  createdAt: string;
  kind: 'tokens' | 'clone';
  files: { name: string; base64: string }[];
}

function idb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id' });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function dbPut(c: Capture): Promise<void> {
  const db = await idb();
  await new Promise<void>((res, rej) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(c);
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error);
  });
  db.close();
}

async function dbAll(): Promise<Capture[]> {
  const db = await idb();
  const rows: Capture[] = await new Promise((res, rej) => {
    const q = db.transaction(STORE, 'readonly').objectStore(STORE).getAll();
    q.onsuccess = () => res((q.result as Capture[]).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)));
    q.onerror = () => rej(q.error);
  });
  db.close();
  return rows;
}

async function dbDel(id: string): Promise<void> {
  const db = await idb();
  await new Promise<void>((res, rej) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(id);
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error);
  });
  db.close();
}

async function dbClear(): Promise<void> {
  const db = await idb();
  await new Promise<void>((res, rej) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).clear();
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error);
  });
  db.close();
}

// ---------- helpers ----------
const $ = <T extends HTMLElement = HTMLElement>(sel: string) => document.querySelector<T>(sel)!;
const view = () => $('#view');
const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

let locale: Locale = 'en';
let tab: 'inspect' | 'tokens' | 'clone' | 'library' | 'settings' = 'inspect';
let evidence: ScanEvidence | null = null;
let inspecting = false;
const pins: Record<string, string>[] = [];

const T = (k: MsgKey) => t(locale, k);

function toast(msg: string) {
  const el = $('#toast');
  el.textContent = msg;
  el.hidden = false;
  window.clearTimeout((toast as unknown as { _h?: number })._h);
  (toast as unknown as { _h?: number })._h = window.setTimeout(() => (el.hidden = true), 2600);
}

function toBase64(bytes: Uint8Array): string {
  let bin = '';
  const CH = 0x8000;
  for (let i = 0; i < bytes.length; i += CH) bin += String.fromCharCode(...bytes.subarray(i, i + CH));
  return btoa(bin);
}

function fromBase64(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function activeTab(): Promise<chrome.tabs.Tab> {
  const [tb] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tb?.id) throw new Error('no-tab');
  return tb;
}

async function sendToTab<T>(type: string): Promise<T> {
  const tb = await activeTab();
  const res = await chrome.tabs.sendMessage(tb.id!, { type }).catch(() => null);
  if (!res?.ok) throw new Error(res?.error ?? T('error.scan'));
  return res.data as T;
}

async function downloadZip(filename: string, bytes: Uint8Array): Promise<void> {
  const res = await chrome.runtime
    .sendMessage({ type: 'TOKOTTER_DOWNLOAD', file: { filename, mime: 'application/zip', base64: toBase64(bytes) } })
    .catch(() => null);
  if (!res?.ok) throw new Error(res?.error ?? T('error.download'));
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return 'page';
  }
}

// ---------- i18n ----------
function applyI18n() {
  document.querySelectorAll('[data-i18n]').forEach((el) => {
    el.textContent = T(el.getAttribute('data-i18n') as MsgKey);
  });
  document.querySelectorAll('[role="tab"]').forEach((b) =>
    (b as HTMLButtonElement).setAttribute('aria-selected', (b as HTMLElement).dataset.tab === tab ? 'true' : 'false'),
  );
  ($('#locale') as HTMLSelectElement).value = locale;
}

// ---------- views ----------
async function render() {
  applyI18n();
  const v = view();
  if (tab === 'inspect') return renderInspect(v);
  if (tab === 'tokens') return renderTokens(v);
  if (tab === 'clone') return renderClone(v);
  if (tab === 'library') return renderLibrary(v);
  return renderSettings(v);
}

function scanCard(actionLabel: MsgKey): string {
  if (!evidence) {
    return `<div class="toko-card"><h3>tokotter</h3>
      <p class="toko-note">${esc(T('scan.empty'))}</p>
      <button class="toko-btn" data-act="scan">${esc(T('scan.start'))}</button></div>`;
  }
  return `<div class="toko-card"><h3>tokotter</h3>
    <p class="toko-url">${esc(evidence.title)}<br>${esc(evidence.url)}</p>
    <div class="toko-row"><button class="toko-btn secondary" data-act="scan">${esc(T('scan.rescan'))}</button>
    <button class="toko-btn ghost" data-act="inspect-toggle">${inspecting ? esc(T('common.close')) : 'Inspect'}</button></div></div>`;
}

async function renderInspect(v: HTMLElement) {
  const pinsHtml = pins
    .map(
      (p) => `<div class="toko-card toko-pin"><dl>
        ${Object.entries(p).map(([k, val]) => `<dt>${esc(k)}</dt><dd>${esc(val)}</dd>`).join('')}
        </dl><div class="toko-row">
        <button class="toko-btn ghost" data-copy="${esc(p['selector'] ?? '')}">CSS</button></div></div>`,
    )
    .join('');
  v.innerHTML =
    scanCard('scan.start') +
    (evidence
      ? `<div class="toko-card"><h3>${esc(T('tab.inspect'))}</h3>
      <p class="toko-note">${esc(T('inspect.hint'))}</p>
      <div class="toko-kv">🎨 ${evidence.colors.length} colors · 🔤 ${evidence.fonts.length} families · 📏 ${evidence.spacings.length} spacings</div>
      <div class="toko-kv">${evidence.colors.slice(0, 8).map((c) => `<span class="toko-swatch" style="background:${esc(c.color)}"></span>`).join('')}</div>
      </div>${pinsHtml}`
      : '');
}

async function renderTokens(v: HTMLElement) {
  const has = !!evidence;
  const sys = evidence ? deriveSystem(evidence) : null;
  const recs = sys ? toRecords(sys) : [];
  v.innerHTML =
    scanCard('scan.start') +
    (has && sys
      ? `<div class="toko-card"><h3>${esc(T('tab.tokens'))}</h3>
      <p class="toko-note">${esc(T('tokens.formats'))}</p>
      <div class="toko-kv">📦 ${recs.length} tokens · ${Object.keys(sys.spacing).length} spacing · ${Object.keys(sys.radii).length} radii · ${Object.keys(sys.shadows).length} shadows</div>
      <div class="toko-kv">${recs.filter((r) => r.name.startsWith('color-primary')).slice(0, 6).map((r) => `<span class="toko-swatch" style="background:${esc(r.value)}" title="${esc(r.name)}"></span>`).join('')}</div>
      <div class="toko-row"><button class="toko-btn" data-act="tokens">${esc(T('tokens.generate'))}</button></div>
      <div data-msg></div></div>`
      : '');
}

async function renderClone(v: HTMLElement) {
  v.innerHTML =
    scanCard('scan.start') +
    (evidence
      ? `<div class="toko-card"><h3>${esc(T('tab.clone'))}</h3>
      <p class="toko-note">${esc(evidence.title)} · ${evidence.viewport.width}×{evidence.viewport.height}</p>
      <div class="toko-row"><button class="toko-btn" data-act="clone">${esc(T('clone.build'))}</button></div>
      <div data-msg></div></div>`
      : '');
}

async function renderLibrary(v: HTMLElement) {
  const rows = await dbAll();
  v.innerHTML = rows.length
    ? `<ul class="toko-list">${rows.map((c) => `<li class="toko-card">
      <div class="meta"><b>${esc(c.title)}</b><span>${esc(c.kind)} · ${esc(c.url)} · ${esc(c.createdAt.slice(0, 10))}</span></div>
      <button class="toko-btn ghost" data-lib-dl="${c.id}">${esc(T('library.download'))}</button>
      <button class="toko-btn ghost" data-lib-del="${c.id}">${esc(T('library.delete'))}</button>
    </li>`).join('')}</ul>`
    : `<div class="toko-card"><p class="toko-note">${esc(T('library.empty'))}</p></div>`;
}

async function renderSettings(v: HTMLElement) {
  let used = '';
  try {
    const est = await navigator.storage.estimate();
    used = `${(((est.usage ?? 0) / 1048576).toFixed(1))} MB`;
  } catch {
    used = '—';
  }
  v.innerHTML = `<div class="toko-card"><h3>${esc(T('tab.settings'))}</h3>
    <p class="toko-note">${esc(T('settings.about'))}</p>
    <p class="toko-kv">${esc(T('settings.language'))}:
      <select id="lang2" class="toko-select">${LOCALES.map((l) => `<option value="${l.id}">${esc(l.label)}</option>`).join('')}</select></p>
    <p class="toko-kv">${esc(T('settings.storage'))}: ${esc(used)}</p>
    <div class="toko-row"><button class="toko-btn warn" data-act="clear">${esc(T('settings.clear'))}</button></div>
  </div>`;
  (document.getElementById('lang2') as HTMLSelectElement).value = locale;
}

// ---------- actions ----------
async function doScan(btn: HTMLButtonElement) {
  btn.disabled = true;
  try {
    evidence = await sendToTab<ScanEvidence>('TOKOTTER_SCAN');
    await render();
  } catch {
    toast(T('error.scan'));
    btn.disabled = false;
  }
}

async function doTokens(btn: HTMLButtonElement, msgHost: Element) {
  if (!evidence) return;
  btn.disabled = true;
  try {
    const system = deriveSystem(evidence);
    const records = toRecords(system);
    const vp = evidence.viewport;
    const url = evidence.url;
    const host = hostOf(url);
    const { tokenPackEntries: entries } = await import('../../src/tokens');
    const pack = { records, system, meta: { url, host, generatedAt: new Date().toISOString(), viewport: { width: vp.width, height: vp.height, scale: vp.deviceScaleFactor } } };
    const files = entries(pack).map((e) => ({ name: e.name, text: e.text }));
    const { makeZip: zip } = await import('../../src/zip');
    const bytes = zip(files);
    const folder = `tokotter-${slug(host)}-${stamp()}-tokens`;
    const filename = `${folder}.zip`;
    await downloadZip(filename, bytes);
    await dbPut({
      id: `${Date.now()}`,
      url,
      title: evidence.title,
      createdAt: new Date().toISOString(),
      kind: 'tokens',
      files: files.map((f) => ({ name: f.name, base64: toBase64(new TextEncoder().encode(f.text)) })),
    });
    (msgHost as HTMLElement).innerHTML = `<p class="toko-ok">${esc(T('tokens.done'))}</p>`;
  } catch {
    (msgHost as HTMLElement).innerHTML = `<p class="toko-error">${esc(T('error.download'))}</p>`;
  } finally {
    btn.disabled = false;
  }
}

async function doClone(btn: HTMLButtonElement, msgHost: Element) {
  btn.disabled = true;
  try {
    const input = await sendToTab<{
      url: string; title: string; html: string; css: string; width: number;
      assets: { kind: 'image' | 'font' | 'video' | 'svg' | 'other'; url: string }[];
      states: { control: number; label: string; mutations: unknown[] }[];
    }>('TOKOTTER_CLONE');
    const host = hostOf(input.url);
    const folder = `${slug(host)}-${slug(input.title).slice(0, 40) || 'page'}-clone`;
    const files = cloneEntries(folder, input).map((f) => ({ name: f.name, data: f.data }));
    const { makeZipBytes } = await import('../../src/zip');
    const bytes = makeZipBytes(files);
    const filename = `${folder}.zip`;
    await downloadZip(filename, bytes);
    await dbPut({
      id: `${Date.now()}`,
      url: input.url,
      title: input.title,
      createdAt: new Date().toISOString(),
      kind: 'clone',
      files: files.map((f) => ({ name: f.name, base64: toBase64(f.data) })),
    });
    (msgHost as HTMLElement).innerHTML = `<p class="toko-ok">${esc(T('clone.done'))} ${esc(filename)}</p>`;
  } catch {
    (msgHost as HTMLElement).innerHTML = `<p class="toko-error">${esc(T('error.download'))}</p>`;
  } finally {
    btn.disabled = false;
  }
}

// ---------- boot ----------
async function boot() {
  const prefs = await chrome.storage.local.get('tokotter.locale');
  locale = prefs['tokotter.locale'] === 'ja' ? 'ja' : 'en';

  document.querySelectorAll('[role="tab"]').forEach((b) =>
    b.addEventListener('click', async () => {
      tab = (b as HTMLElement).dataset.tab as typeof tab;
      await render();
    }),
  );

  ($('#locale') as HTMLSelectElement).addEventListener('change', async (e) => {
    locale = (e.target as HTMLSelectElement).value as Locale;
    await chrome.storage.local.set({ 'tokotter.locale': locale });
    await render();
  });

  view().addEventListener('click', async (e) => {
    const el = (e.target as HTMLElement).closest('[data-act],[data-lib-dl],[data-lib-del],[data-copy]') as HTMLElement | null;
    if (!el) return;
    if (el.dataset.act === 'scan') await doScan(el as HTMLButtonElement);
    else if (el.dataset.act === 'tokens') {
      const host = el.closest('.toko-card')?.querySelector('[data-msg]')!;
      await doTokens(el as HTMLButtonElement, host);
    } else if (el.dataset.act === 'clone') {
      const host = el.closest('.toko-card')?.querySelector('[data-msg]')!;
      await doClone(el as HTMLButtonElement, host);
    } else if (el.dataset.act === 'inspect-toggle') {
      inspecting = !inspecting;
      const tb = await activeTab().catch(() => null);
      if (tb?.id) chrome.tabs.sendMessage(tb.id, { type: inspecting ? 'TOKOTTER_INSPECT_ON' : 'TOKOTTER_INSPECT_OFF' }).catch(() => {});
      await render();
    } else if (el.dataset.act === 'clear') {
      await dbClear();
      await chrome.storage.local.remove('tokotter.locale');
      toast('OK');
      await render();
    } else if (el.dataset.libDl) {
      const rows = await dbAll();
      const cap = rows.find((r) => r.id === el.dataset.libDl);
      if (cap) {
        const { makeZipBytes } = await import('../../src/zip');
        const bytes = makeZipBytes(cap.files.map((f) => ({ name: f.name, data: fromBase64(f.base64) })));
        await downloadZip(`${slug(cap.title).slice(0, 40) || 'tokotter'}-${cap.kind}.zip`, bytes).catch(() => toast(T('error.download')));
      }
    } else if (el.dataset.libDel) {
      await dbDel(el.dataset.libDel);
      await render();
    } else if (el.dataset.copy !== undefined) {
      await navigator.clipboard.writeText(el.dataset.copy).catch(() => {});
      toast(T('inspect.copied'));
    }
  });

  view().addEventListener('change', async (e) => {
    if ((e.target as HTMLElement).id === 'lang2') {
      locale = ((e.target as HTMLSelectElement).value as Locale);
      await chrome.storage.local.set({ 'tokotter.locale': locale });
      await render();
    }
  });

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg?.type === 'TOKOTTER_INSPECTED' && msg.detail) {
      pins.unshift(msg.detail as Record<string, string>);
      if (tab === 'inspect') render().catch(() => {});
    }
  });

  await render();
}

void boot();
