// tokotter content scanner. Runs in the page (ISOLATED world), collects
// design evidence and builds page clones. No network calls.
import type { ScanEvidence } from '../src/types';

const MAX_ELEMENTS = 6000;

function px(v: string): number | null {
  const m = /^(-?[\d.]+)px$/.exec(v.trim());
  return m ? parseFloat(m[1]) : null;
}

function famKey(family: string): string {
  return family.split(',')[0]?.trim().replace(/^["']|["']$/g, '') || family;
}

function category(el: Element, family: string): string[] {
  const out: string[] = [];
  const tag = el.tagName.toLowerCase();
  if (/^h[1-6]$/.test(tag)) out.push('Headings');
  if (tag === 'code' || tag === 'pre' || /mono/i.test(family)) out.push('Monospace');
  if (out.length === 0) out.push('Body');
  return out;
}

export function scanPage(): ScanEvidence {
  const els = Array.from(document.querySelectorAll('*')).slice(0, MAX_ELEMENTS);
  const colorCounts = new Map<string, number>();
  const fontMap = new Map<
    string,
    { weights: Set<string>; sizes: Set<number>; lineHeights: Set<string>; letterSpacings: Set<string>; categories: Set<string> }
  >();
  const spacingSet = new Set<number>();
  const radiiSet = new Set<number>();
  const shadowCounts = new Map<string, number>();
  const gradientCounts = new Map<string, number>();

  const bump = (m: Map<string, number>, k: string) => m.set(k, (m.get(k) ?? 0) + 1);

  for (const el of els) {
    let cs: CSSStyleDeclaration;
    try {
      cs = getComputedStyle(el);
    } catch {
      continue;
    }
    for (const prop of [cs.color, cs.backgroundColor, cs.borderTopColor]) {
      if (prop && !/rgba?\(0,\s*0,\s*0,\s*0\)|transparent/i.test(prop)) bump(colorCounts, prop);
    }
    const family = famKey(cs.fontFamily || 'system-ui');
    let f = fontMap.get(family);
    if (!f) {
      f = { weights: new Set(), sizes: new Set(), lineHeights: new Set(), letterSpacings: new Set(), categories: new Set() };
      fontMap.set(family, f);
    }
    f.weights.add(cs.fontWeight || '400');
    const size = parseFloat(cs.fontSize);
    if (Number.isFinite(size)) f.sizes.add(Math.round(size * 10) / 10);
    if (cs.lineHeight && cs.lineHeight !== 'normal') f.lineHeights.add(cs.lineHeight);
    if (cs.letterSpacing && cs.letterSpacing !== 'normal') f.letterSpacings.add(cs.letterSpacing);
    for (const c of category(el, cs.fontFamily)) f.categories.add(c);

    for (const p of [cs.paddingTop, cs.paddingRight, cs.paddingBottom, cs.paddingLeft]) {
      const v = p ? px(p) : null;
      if (v !== null && v > 0 && v <= 240) spacingSet.add(v);
    }
    const r = cs.borderTopLeftRadius ? px(cs.borderTopLeftRadius.split(' ')[0] ?? '') : null;
    if (r !== null && r > 0) radiiSet.add(r);
    if (cs.boxShadow && cs.boxShadow !== 'none') bump(shadowCounts, cs.boxShadow);
    const bg = cs.backgroundImage;
    if (bg && /gradient/.test(bg)) bump(gradientCounts, bg.length > 500 ? bg.slice(0, 500) : bg);
  }

  const spacings = [...spacingSet].sort((a, b) => a - b);
  const spacingBase = detectBase(spacings);

  return {
    url: location.href,
    title: document.title || location.hostname,
    scannedAt: new Date().toISOString(),
    viewport: {
      width: window.innerWidth,
      height: window.innerHeight,
      deviceScaleFactor: Math.min(3, Math.max(1, window.devicePixelRatio || 1)),
    },
    colors: [...colorCounts.entries()]
      .map(([color, count]) => ({ color: toHex(color), count }))
      .filter((c) => c.color)
      .sort((a, b) => b.count - a.count)
      .slice(0, 60),
    fonts: [...fontMap.entries()].map(([family, f]) => ({
      family,
      weights: [...f.weights].slice(0, 6),
      sizes: [...f.sizes].sort((a, b) => a - b).slice(0, 12),
      lineHeights: [...f.lineHeights].slice(0, 6),
      letterSpacings: [...f.letterSpacings].slice(0, 6),
      categories: [...f.categories],
    })),
    spacings,
    spacingBase,
    borderRadii: [...radiiSet].sort((a, b) => a - b).slice(0, 12),
    shadows: [...shadowCounts.entries()]
      .map(([value, count]) => ({ value, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10),
    gradients: [...gradientCounts.entries()]
      .map(([value, count]) => ({ value, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10),
    themedVariables: {},
    limitations: document.querySelector('iframe') ? ['Cross-origin iframes were not scanned.'] : [],
  };
}

function detectBase(values: number[]): number | null {
  if (values.length === 0) return null;
  for (const base of [8, 4]) {
    const hits = values.filter((v) => Math.abs(v / base - Math.round(v / base)) < 0.01).length;
    if (hits / values.length >= 0.6) return base;
  }
  return null;
}

function toHex(color: string): string {
  const m = /^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/.exec(color);
  if (!m) {
    return /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(color.trim()) ? color.trim().toLowerCase() : '';
  }
  const h = (n: string) => Number(n).toString(16).padStart(2, '0');
  return `#${h(m[1])}${h(m[2])}${h(m[3])}`;
}

// NOTE: cross-origin alternate themes are intentionally not collected —
// themedVariables stays empty so no unreadable style data is fabricated.

// --- element inspector (hover overlay, MAIN-world safe subset) ---

let overlay: HTMLDivElement | null = null;
let inspectOn = false;

function ensureOverlay(): HTMLDivElement {
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.setAttribute('data-tokotter', 'overlay');
    overlay.style.cssText =
      'position:fixed;z-index:2147483647;pointer-events:none;border:2px solid #0e7c86;background:rgba(14,124,134,.12);border-radius:4px;';
    document.documentElement.appendChild(overlay);
  }
  return overlay;
}

function describe(el: Element): Record<string, string> {
  const cs = getComputedStyle(el);
  const pick = (o: Record<string, string>, k: string, v: string) => {
    o[k] = v;
  };
  const out: Record<string, string> = {};
  pick(out, 'selector', selectorOf(el));
  pick(out, 'color', cs.color);
  pick(out, 'background', cs.backgroundColor);
  pick(out, 'font', `${cs.fontFamily} ${cs.fontSize}/${cs.lineHeight} ${cs.fontWeight}`);
  pick(out, 'padding', cs.padding);
  pick(out, 'margin', cs.margin);
  pick(out, 'size', `${el.getBoundingClientRect().width.toFixed(0)}×${el.getBoundingClientRect().height.toFixed(0)}`);
  return out;
}

function selectorOf(el: Element): string {
  const parts: string[] = [];
  let cur: Element | null = el;
  while (cur && parts.length < 3 && cur.tagName.toLowerCase() !== 'html') {
    let s = cur.tagName.toLowerCase();
    if (cur.id) {
      s += `#${cur.id}`;
      parts.unshift(s);
      break;
    }
    const rawClass = (cur as unknown as { className?: unknown }).className;
    const clsText =
      typeof rawClass === 'string'
        ? rawClass
        : String((rawClass as { baseVal?: unknown } | null)?.baseVal ?? '');
    const cls = clsText.split(/\s+/).filter(Boolean)[0];
    if (cls) s += `.${cls}`;
    parts.unshift(s);
    cur = cur.parentElement;
  }
  return parts.join(' > ');
}

function onMove(e: MouseEvent) {
  if (!inspectOn) return;
  const el = document.elementFromPoint(e.clientX, e.clientY) as Element | null;
  if (!el || el === ensureOverlay()) return;
  const r = el.getBoundingClientRect();
  const o = ensureOverlay();
  o.style.left = `${r.left}px`;
  o.style.top = `${r.top}px`;
  o.style.width = `${r.width}px`;
  o.style.height = `${r.height}px`;
}

function onClick(e: MouseEvent) {
  if (!inspectOn) return;
  e.preventDefault();
  e.stopPropagation();
  const el = document.elementFromPoint(e.clientX, e.clientY) as Element | null;
  if (el) chrome.runtime.sendMessage({ type: 'TOKOTTER_INSPECTED', detail: describe(el) }).catch(() => {});
}

// --- clone serialization ---

function collectCss(): string {
  const parts: string[] = [];
  for (const sheet of Array.from(document.styleSheets)) {
    try {
      const rules = sheet.cssRules;
      if (!rules) continue;
      const text: string[] = [];
      for (const r of Array.from(rules)) text.push(r.cssText);
      parts.push(text.join('\n'));
    } catch {
      parts.push(`/* skipped cross-origin stylesheet: ${(sheet as CSSStyleSheet).href ?? 'inline'} */`);
    }
  }
  return parts.join('\n\n').slice(0, 2_000_000);
}

function bodyHtml(): string {
  const clone = document.body.cloneNode(true) as HTMLElement;
  clone.querySelectorAll('script,style,[data-tokotter]').forEach((n) => n.remove());
  return clone.innerHTML.slice(0, 3_000_000);
}

function collectAssets(): { kind: 'image' | 'font' | 'video' | 'svg' | 'other'; url: string }[] {
  const out: { kind: 'image' | 'font' | 'video' | 'svg' | 'other'; url: string }[] = [];
  const seen = new Set<string>();
  const push = (kind: 'image' | 'font' | 'video' | 'svg' | 'other', url: string) => {
    if (!url || seen.has(url) || url.startsWith('data:')) return;
    seen.add(url);
    out.push({ kind, url: url.slice(0, 2048) });
  };
  document.querySelectorAll('img[src]').forEach((el) => push('image', (el as HTMLImageElement).src));
  document.querySelectorAll('video[src],video source[src]').forEach((el) =>
    push('video', (el as HTMLSourceElement).src),
  );
  for (const sheet of Array.from(document.styleSheets)) {
    try {
      for (const r of Array.from(sheet.cssRules ?? [])) {
        const m = /url\(["']?(https?[^)"']+)/.exec(r.cssText);
        if (m) push(r.cssText.includes('@font-face') ? 'font' : 'image', m[1]);
      }
    } catch {
      /* cross-origin */
    }
  }
  return out.slice(0, 500);
}

function collectStates(): { control: number; label: string; mutations: unknown[] }[] {
  const out: { control: number; label: string; mutations: unknown[] }[] = [];
  let i = 0;
  document
    .querySelectorAll('button[aria-expanded], [aria-controls], details, [data-state]')
    .forEach((el) => {
      i += 1;
      out.push({
        control: i,
        label: (el.textContent ?? '').trim().slice(0, 60) || el.tagName.toLowerCase(),
        mutations: [
          { node: i, attribute: { name: 'aria-expanded', from: el.getAttribute('aria-expanded'), to: '<toggled>' } },
        ],
      });
    });
  return out.slice(0, 100);
}

export default defineContentScript({
  matches: ['http://*/*', 'https://*/*'],
  runAt: 'document_idle',
  main() {
    chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
      handle(msg)
        .then((data) => sendResponse({ ok: true, data }))
        .catch((e) => sendResponse({ ok: false, error: e instanceof Error ? e.message : 'Failed.' }));
      return true;
    });
  },
});

async function handle(msg: unknown): Promise<unknown> {
  const type = (msg as { type?: string })?.type;
  if (type === 'TOKOTTER_SCAN') return scanPage();
  if (type === 'TOKOTTER_INSPECT_ON') {
    inspectOn = true;
    document.addEventListener('mousemove', onMove, true);
    document.addEventListener('click', onClick, true);
    return { ok: true };
  }
  if (type === 'TOKOTTER_INSPECT_OFF') {
    inspectOn = false;
    document.removeEventListener('mousemove', onMove, true);
    document.removeEventListener('click', onClick, true);
    overlay?.remove();
    overlay = null;
    return { ok: true };
  }
  if (type === 'TOKOTTER_CLONE') {
    return {
      url: location.href,
      title: document.title || location.hostname,
      html: bodyHtml(),
      css: collectCss(),
      width: window.innerWidth,
      assets: collectAssets(),
      states: collectStates(),
    };
  }
  throw new Error('Unknown message.');
}
