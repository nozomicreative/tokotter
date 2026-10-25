import { describe, expect, it } from 'vitest';
import { brand, brandCssVars } from './brand';
import { contrast as wcagContrast, parseColor as parseTestColor } from './color';
import { contrastRows, deriveSystem, renderAccessibilityMd, renderRebuildMd, renderScss, renderTailwindCss, renderThemeCss, renderTokensTs, toRecords, tokenPackEntries, tokensJson } from './tokens';
import type { ScanEvidence } from './types';

function evidence(): ScanEvidence {
  return {
    url: 'https://example.com/page',
    title: 'Example',
    scannedAt: '2026-10-06T00:00:00.000Z',
    viewport: { width: 1314, height: 903, deviceScaleFactor: 1 },
    colors: [
      { color: 'rgb(94, 106, 210)', count: 40 },
      { color: 'rgb(31, 41, 55)', count: 30 },
      { color: 'rgb(107, 114, 128)', count: 12 },
    ],
    fonts: [
      { family: 'Inter', weights: ['500'], sizes: [14], lineHeights: ['20px'], letterSpacings: ['-0.07px'], categories: ['Body'] },
    ],
    spacings: [10],
    spacingBase: 10,
    borderRadii: [],
    shadows: [],
    gradients: [],
    themedVariables: {},
    limitations: [],
  };
}

describe('tokens', () => {
  it('derives a system with ramps and roles', () => {
    const sys = deriveSystem(evidence());
    expect(sys.colors.primary?.['500']).toBeTruthy();
    expect(sys.colors.roles['action']).toBeTruthy();
    expect(sys.colors.roles['onAction']).toBeTruthy();
  });

  it('renders the 6-file pack plus extras', () => {
    const ev = evidence();
    const system = deriveSystem(ev);
    const records = toRecords(system);
    const pack = {
      records,
      system,
      meta: { url: ev.url, host: 'example.com', generatedAt: ev.scannedAt, viewport: { width: 1314, height: 903, scale: 1 } },
    };
    const entries = tokenPackEntries(pack);
    const names = entries.map((e) => e.name);
    expect(names.some((n) => n.endsWith('/DESIGN.md'))).toBe(true);
    expect(names.some((n) => n.endsWith('/tokens.json'))).toBe(true);
    expect(names.some((n) => n.endsWith('/theme.css'))).toBe(true);
    expect(names.some((n) => n.endsWith('/tailwind-v4.css'))).toBe(true);
    expect(names.some((n) => n.endsWith('/_tokens.scss'))).toBe(true);
    expect(names.some((n) => n.endsWith('/tokens.ts'))).toBe(true);
    expect(names.some((n) => n.endsWith('/accessibility.md'))).toBe(true);
    expect(names.some((n) => n.endsWith('/REBUILD.md'))).toBe(true);

    const json = JSON.parse(tokensJson(pack));
    expect(json.schemaVersion).toBe('1.1');
    expect(json.colors.length).toBeGreaterThan(0);

    // type-scale steps stay out of the CSS variables (not valid declarations)
    const css = renderThemeCss(records);
    expect(css).toContain('--color-primary-500');
    expect(css).not.toContain('--font-xs');
    expect(renderTailwindCss(records)).toContain('@theme');
    expect(renderScss(records)).toContain('$color-primary-500');
    expect(renderTokensTs(records)).toContain('export const tokens');
    expect(renderAccessibilityMd(pack)).toContain('AA normal');
    expect(renderRebuildMd(pack)).toContain('Rebuild');
    expect(contrastRows(system).length).toBeGreaterThan(0);
  });

  it('keeps white-on-river at AA', () => {
    const ratio = wcagContrast(parseTestColor('#ffffff')!, parseTestColor(brand.river)!);
    expect(ratio).toBeGreaterThanOrEqual(4.5);
    expect(brandCssVars()).toContain('--toko-river');
  });
});
