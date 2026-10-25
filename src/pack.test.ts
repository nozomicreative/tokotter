import { describe, expect, it } from 'vitest';
import { unzipSync } from 'fflate';
import { cloneEntries, type CloneInput } from './clone';
import { deriveSystem, renderThemeCss, tokenPackEntries, tokensJson, toRecords } from './tokens';
import { makeZip } from './zip';
import type { ScanEvidence } from './types';

function syntheticEvidence(): ScanEvidence {
  return {
    url: 'https://example.com/page',
    title: 'Example',
    scannedAt: '2026-10-06T00:00:00.000Z',
    viewport: { width: 1314, height: 903, deviceScaleFactor: 1 },
    colors: [
      { color: 'rgb(14, 124, 134)', count: 50 },
      { color: 'rgb(31, 41, 55)', count: 30 },
      { color: 'rgb(107, 114, 128)', count: 12 },
    ],
    fonts: [
      {
        family: 'Inter',
        weights: ['500'],
        sizes: [14],
        lineHeights: ['20px'],
        letterSpacings: ['-0.07px'],
        categories: ['Body'],
      },
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

const EXPECTED_TOKEN_SUFFIXES = [
  'DESIGN.md',
  'tokens/tokens.json',
  'tokens/HOW-TO-USE.md',
  'tokens/theme.css',
  'tokens/tailwind-v4.css',
  'tokens/_tokens.scss',
  'tokens/tokens.ts',
  'extras/accessibility.md',
  'extras/REBUILD.md',
];

const EXPECTED_CLONE_SUFFIXES = [
  'index.html',
  'styles.css',
  'tokotter-states.json',
  'tokotter.js',
  'viewer.html',
  'asset-manifest.json',
  'README.md',
];

describe('pack (token pack + clone archive static shape)', () => {
  it('tokenPackEntries() returns 9 entries with expected filenames', () => {
    const ev = syntheticEvidence();
    const system = deriveSystem(ev);
    const records = toRecords(system);
    const pack = {
      records,
      system,
      meta: {
        url: ev.url,
        host: 'example.com',
        generatedAt: ev.scannedAt,
        viewport: { width: 1314, height: 903, scale: 1 },
      },
    };
    const entries = tokenPackEntries(pack);
    expect(entries).toHaveLength(9);
    for (const suffix of EXPECTED_TOKEN_SUFFIXES) {
      expect(
        entries.some((e) => e.name.endsWith(suffix)),
        `missing token entry suffix: ${suffix} in ${entries.map((e) => e.name).join(', ')}`,
      ).toBe(true);
    }
  });

  it('makeZip() round-trips through fflate unzipSync with the same 9 names', () => {
    const ev = syntheticEvidence();
    const system = deriveSystem(ev);
    const records = toRecords(system);
    const pack = {
      records,
      system,
      meta: {
        url: ev.url,
        host: 'example.com',
        generatedAt: ev.scannedAt,
        viewport: { width: 1314, height: 903, scale: 1 },
      },
    };
    const entries = tokenPackEntries(pack);
    const zip = makeZip(entries);
    expect(zip.length).toBeGreaterThan(0);
    const unzipped = unzipSync(zip);
    const names = Object.keys(unzipped).sort();
    const expected = entries.map((e) => e.name).sort();
    expect(names).toEqual(expected);
    expect(names).toHaveLength(9);
  });

  it('tokens.json parses with schemaVersion 1.1; theme.css has primary ramp, no type-scale vars', () => {
    const ev = syntheticEvidence();
    const system = deriveSystem(ev);
    const records = toRecords(system);
    const pack = {
      records,
      system,
      meta: {
        url: ev.url,
        host: 'example.com',
        generatedAt: ev.scannedAt,
        viewport: { width: 1314, height: 903, scale: 1 },
      },
    };
    const entries = tokenPackEntries(pack);
    const jsonEntry = entries.find((e) => e.name.endsWith('tokens/tokens.json'));
    expect(jsonEntry).toBeDefined();
    const parsed = JSON.parse(jsonEntry!.text);
    expect(parsed.schemaVersion).toBe('1.1');

    const themeEntry = entries.find((e) => e.name.endsWith('tokens/theme.css'));
    expect(themeEntry).toBeDefined();
    const css = themeEntry!.text;
    // Also cross-check the standalone renderer over the same records.
    const css2 = renderThemeCss(records);
    expect(css).toBe(css2);
    expect(css).toContain('--color-primary-500');
    // Type-scale steps (e.g. --font-xs / --font-step-*) must stay out of CSS
    // variables; --font-family-* is intentionally kept (valid declaration).
    expect(css).not.toContain('--font-xs');
    expect(css).not.toMatch(/--font-(?!family-)/);
  });

  it('cloneEntries() returns 7 entries with expected filenames', () => {
    const input: CloneInput = {
      url: 'https://example.com/page',
      title: 'Example',
      html: '<p>hello</p>',
      css: 'p { color: red; }',
      width: 1314,
      assets: [],
      states: [],
    };
    const files = cloneEntries('tokotter-example-com-clone', input);
    expect(files).toHaveLength(7);
    for (const suffix of EXPECTED_CLONE_SUFFIXES) {
      expect(
        files.some((f) => f.name.endsWith(suffix)),
        `missing clone entry suffix: ${suffix} in ${files.map((f) => f.name).join(', ')}`,
      ).toBe(true);
    }
  });
});
