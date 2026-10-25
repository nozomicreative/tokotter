// Page-clone builder: DOM snapshot -> standalone archive.
// Runs on-device in the page context. Extra "nice to have" files:
// asset-manifest.json (image/font inventory) and README.md (provenance +
// rebuild instructions).
import type { ScanEvidence } from './types';

export interface CloneFile {
  name: string;
  data: Uint8Array;
}

export interface CloneInput {
  url: string;
  title: string;
  html: string; // serialized body HTML
  css: string; // collected/inlined stylesheet text
  width: number;
  assets: { kind: 'image' | 'font' | 'video' | 'svg' | 'other'; url: string; bytes?: number }[];
  states: { control: number; label: string; mutations: unknown[] }[];
}

const enc = new TextEncoder();
const toBytes = (s: string) => enc.encode(s);

function escapeHtml(s: string): string {
  return s.replace(/[<>&"]/g, '');
}

export function viewerHtml(title: string, width: number): string {
  const widths = [390, 834, 1280, 1600];
  if (!widths.includes(Math.round(width))) widths.push(Math.round(width));
  widths.sort((a, b) => a - b);
  const buttons = widths
    .map((w) => `<button type="button" data-width="${w}">${w === Math.round(width) ? 'As captured' : w}<small>${w}</small></button>`)
    .join('');
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)} — tokotter archive</title>
<style>
  :root { color-scheme: dark; --line: #2a3538; --ink: #eef4f4; --muted: #93a3a6; --ground: #101c1e; }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--ground); color: var(--ink);
         font: 400 13px/1.5 ui-sans-serif, system-ui, sans-serif;
         height: 100vh; display: flex; flex-direction: column; }
  header { display: flex; align-items: center; gap: 14px; padding: 10px 16px;
           border-bottom: 1px solid var(--line); flex-wrap: wrap; }
  .brand { font-weight: 700; color: #f5a524; }
  .widths { display: flex; flex-wrap: wrap; gap: 6px; margin-left: auto; }
  button { padding: 6px 11px; cursor: pointer; border: 1px solid var(--line);
           border-radius: 6px; background: transparent; color: var(--muted); font: inherit; }
  button small { font-weight: 700; color: #fff; }
  button[aria-pressed="true"] { background: var(--ink); color: var(--ground); }
  a { color: var(--muted); }
  .stage { flex: 1; min-height: 0; display: flex; justify-content: center; padding: 18px; }
  iframe { width: 1280px; height: 100%; border: 0; background: #fff; border-radius: 8px; }
</style>
</head>
<body>
<header><span class="brand">tokotter</span><a href="index.html">Open the page on its own</a><div class="widths">${buttons}</div></header>
<div class="stage"><iframe src="index.html" sandbox="allow-scripts" referrerpolicy="no-referrer" title="${escapeHtml(title)}"></iframe></div>
<script src="tokotter.js"></script>
</body>
</html>`;
}

export function stateSwitcherJs(): string {
  return `'use strict';
// tokotter state switcher: replays recorded attribute mutations.
(function () {
  var frame = document.querySelector('iframe');
  var buttons = Array.prototype.slice.call(document.querySelectorAll('[data-width]'));
  function fit(w) {
    frame.style.width = w + 'px';
    buttons.forEach(function (b) { b.setAttribute('aria-pressed', b.dataset.width === String(w) ? 'true' : 'false'); });
  }
  buttons.forEach(function (b) { b.addEventListener('click', function () { fit(Number(b.dataset.width)); }); });
  fetch('tokotter-states.json').then(function (r) { return r.json(); }).then(function (states) {
    if (frame) frame.addEventListener('load', function () {
      try {
        var doc = frame.contentDocument;
        var bar = doc.createElement('div');
        bar.textContent = states.length + ' recorded interaction state(s) — see tokotter-states.json';
        bar.setAttribute('style', 'position:fixed;left:8px;bottom:8px;z-index:99999;background:#0e7c86;color:#fff;font:12px sans-serif;padding:6px 10px;border-radius:6px');
        doc.body.appendChild(bar);
      } catch (e) { /* sandboxed */ }
    });
  }).catch(function () {});
})();
`;
}

export function indexHtml(input: CloneInput): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(input.title)}</title>
<!-- Captured on-device by tokotter from ${escapeHtml(input.url)}. Styles inlined where readable; see styles.css. -->
<link rel="stylesheet" href="styles.css">
</head>
<body>
${input.html}
</body>
</html>`;
}

export function assetManifest(input: CloneInput): string {
  return JSON.stringify(
    {
      source: input.url,
      capturedBy: 'tokotter (local, no server)',
      assets: input.assets,
    },
    null,
    2,
  );
}

export function cloneReadme(input: CloneInput, fileCount: number): string {
  return [
    `# Page clone — ${input.title}`, '',
    `Source: ${input.url}`, '',
    `Captured on-device by tokotter. ${fileCount} files. Open \`viewer.html\` to browse widths, or \`index.html\` directly.`,
    '',
    '## Rebuild with AI',
    '',
    'Attach the matching tokotter token pack (`DESIGN.md` + `tokens.json`) and ask:',
    '',
    '> Rebuild this page following the attached DESIGN.md. Use only the values it records.',
    '',
    'Font binaries are not redistributable: a family name is evidence, not a license. Use system fallbacks or a licensed webfont.',
    '',
  ].join('\n');
}

/** Assembles the clone archive entries (slug/folder prefix applied by caller). */
export function cloneEntries(folder: string, input: CloneInput): CloneFile[] {
  const files: CloneFile[] = [
    { name: `${folder}/index.html`, data: toBytes(indexHtml(input)) },
    { name: `${folder}/styles.css`, data: toBytes(input.css) },
    { name: `${folder}/tokotter-states.json`, data: toBytes(JSON.stringify(input.states, null, 1)) },
    { name: `${folder}/tokotter.js`, data: toBytes(stateSwitcherJs()) },
    { name: `${folder}/viewer.html`, data: toBytes(viewerHtml(input.title, input.width)) },
    { name: `${folder}/asset-manifest.json`, data: toBytes(assetManifest(input)) },
  ];
  const readme = cloneReadme(input, files.length + 1);
  files.push({ name: `${folder}/README.md`, data: toBytes(readme) });
  return files;
}

export function evidenceSummary(ev: ScanEvidence): string {
  return [
    `url: ${ev.url}`,
    `colors: ${ev.colors.length}, fonts: ${ev.fonts.length}, spacings: ${ev.spacings.length}`,
    `radii: ${ev.borderRadii.length}, shadows: ${ev.shadows.length}, gradients: ${ev.gradients.length}`,
  ].join('\n');
}
