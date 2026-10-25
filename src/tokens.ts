// Design-system derivation: evidence -> token records -> pack files.
// Runs entirely on-device. Includes the "nice to have" extras:
// accessibility.md (contrast report), tokens.ts (typed constants),
// REBUILD.md (AI rebuild brief).
import { contrast, onColor, parseColor, ramp } from './color';
import type { PackMeta, ScanEvidence, TokenRecord } from './types';

export interface DesignSystem {
  colors: Record<string, Record<string, string> | null> & {
    roles: Record<string, string>;
  };
  fontFamily: { sans: string; display?: string; mono?: string };
  typeScale: {
    name: string;
    size: string;
    lineHeight: string;
    weight: string;
    letterSpacing: string;
    role: string;
    observed: boolean;
  }[];
  spacing: Record<string, string>;
  spacingBase: number | null;
  radii: Record<string, string>;
  shadows: Record<string, string>;
  gradients: Record<string, string>;
  warnings: string[];
}

const RAMP_GROUPS = ['primary', 'secondary', 'accent', 'neutral'] as const;
const STEPS = ['50', '100', '200', '300', '400', '500', '600', '700', '800', '900', '950'];

function topColors(ev: ScanEvidence, n: number): string[] {
  return [...ev.colors]
    .sort((a, b) => b.count - a.count)
    .slice(0, n)
    .map((c) => c.color)
    .filter((c) => parseColor(c));
}

function isGrayish(hex: string): boolean {
  const c = parseColor(hex);
  if (!c) return true;
  const mx = Math.max(c.r, c.g, c.b);
  const mn = Math.min(c.r, c.g, c.b);
  return mx - mn < 24;
}

export function deriveSystem(ev: ScanEvidence): DesignSystem {
  const warnings: string[] = [...ev.limitations];
  const seeds = topColors(ev, 12);
  const chromatic = seeds.filter((c) => !isGrayish(c));
  const grays = seeds.filter((c) => isGrayish(c));
  if (chromatic.length === 0) {
    warnings.push('No observed chromatic seed was available.');
  }

  const [pSeed = '#5e6ad2', sSeed = pSeed, aSeed = pSeed] = chromatic;
  const neutralSeed =
    grays[0] ?? (chromatic.length ? '#8a8f98' : '#8a8f98');

  const colors: DesignSystem['colors'] = {
    primary: ramp(pSeed),
    secondary: ramp(sSeed),
    accent: ramp(aSeed),
    neutral: ramp(neutralSeed),
    roles: {},
  };
  const roles = colors.roles;
  const primary500 = colors.primary?.['500'] ?? pSeed;
  roles['text'] = grays[0] ?? '#1f2937';
  roles['mutedText'] = grays[1] ?? '#6b7280';
  roles['action'] = primary500;
  roles['onAction'] = onColor(primary500);
  roles['focus'] = primary500;

  const fonts = ev.fonts;
  const body = fonts.find((f) => f.categories.includes('Body')) ?? fonts[0];
  const display = fonts.find((f) => f.categories.includes('Headings'));
  const mono = fonts.find((f) => f.categories.includes('Monospace'));
  const stack = (f?: { family: string }) =>
    f ? `${f.family}, system-ui, -apple-system, Segoe UI, sans-serif` : 'system-ui, sans-serif';

  const sizeCounts = new Map<number, number>();
  for (const f of fonts) for (const s of f.sizes) sizeCounts.set(s, (sizeCounts.get(s) ?? 0) + 1);
  const sizes = [...sizeCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([s]) => s);
  if (sizes.length === 0) warnings.push('The page exposed no measurable text sizes.');

  const typeScale = sizes.map((s, i) => ({
    name: i === 0 ? 'xs' : `step-${i + 1}`,
    size: `${s}px`,
    lineHeight: `${Math.round(s * 1.45)}px`,
    weight: body?.weights[0] ?? '400',
    letterSpacing: body?.letterSpacings[0] ?? '0px',
    role: i < Math.ceil(sizes.length * 0.35) ? 'heading' : 'body',
    observed: true,
  }));

  const spacing: Record<string, string> = {};
  const base = ev.spacingBase ?? 4;
  [...new Set(ev.spacings)].sort((a, b) => a - b).slice(0, 12).forEach((v) => {
    const k = Number.isInteger(v / base) ? String(v / base) : v.toFixed(1);
    spacing[k] = `${v}px`;
  });

  const radii: Record<string, string> = {};
  const rNames = ['sm', 'md', 'lg', 'xl', '2xl', '3xl', 'full'];
  [...new Set(ev.borderRadii)].sort((a, b) => a - b).slice(0, 7).forEach((v, i) => {
    radii[rNames[i] ?? `r${i + 1}`] = `${v}px`;
  });

  const shadows: Record<string, string> = {};
  const sNames = ['xs', 'sm', 'md', 'lg', 'xl'];
  ev.shadows.slice(0, 5).forEach((s, i) => {
    shadows[sNames[i] ?? `s${i + 1}`] = s.value;
  });

  const gradients: Record<string, string> = {};
  ev.gradients.slice(0, 8).forEach((g, i) => {
    gradients[`gradient-${i + 1}`] = g.value;
  });

  return {
    colors,
    fontFamily: {
      sans: stack(body),
      ...(display ? { display: stack(display) } : {}),
      ...(mono ? { mono: stack(mono) } : {}),
    },
    typeScale,
    spacing,
    spacingBase: ev.spacingBase,
    radii,
    shadows,
    gradients,
    warnings,
  };
}

export function toRecords(sys: DesignSystem): TokenRecord[] {
  const out: TokenRecord[] = [];
  for (const group of RAMP_GROUPS) {
    const r = sys.colors[group];
    if (!r) continue;
    for (const step of STEPS) {
      const v = r[step];
      if (!v) continue;
      out.push({
        name: `color-${group}-${step}`,
        value: v,
        role: `${group} ramp ${step}`,
        sourceType: 'inferred',
        source: 'designSystem.colors',
        confidence: 0.72,
        evidence: [`designSystem.colors.${group}.${step}`],
      });
    }
  }
  const roleEvidence: Record<string, string> = {
    text: 'semantic text',
    mutedText: 'semantic muted-text',
    action: 'semantic action',
    onAction: 'semantic on-action',
    focus: 'semantic focus',
  };
  for (const [k, v] of Object.entries(sys.colors.roles)) {
    out.push({
      name: `color-${k.replace(/([A-Z])/g, '-$1').toLowerCase()}`,
      value: v,
      role: roleEvidence[k] ?? `semantic ${k}`,
      sourceType: k === 'onAction' ? 'inferred' : 'observed',
      source: 'designSystem.colors.roles',
      confidence: k === 'onAction' ? 0.72 : 1,
      evidence: [`designSystem.colors.roles.${k}`],
    });
  }
  const famEntries: [string, string][] = [['sans', sys.fontFamily.sans]];
  if (sys.fontFamily.display) famEntries.push(['display', sys.fontFamily.display]);
  if (sys.fontFamily.mono) famEntries.push(['mono', sys.fontFamily.mono]);
  for (const [k, v] of famEntries) {
    out.push({
      name: `font-family-${k}`,
      value: v,
      role: `${k} font family`,
      sourceType: 'observed',
      source: 'designSystem.typography',
      confidence: 1,
      evidence: [`designSystem.typography.fontFamily.${k}`],
    });
  }
  sys.typeScale.forEach((st, i) => {
    out.push({
      name: `font-${st.name}`,
      value: `${st.size} / ${st.lineHeight} / ${st.weight} / ${st.letterSpacing}`,
      role: `${st.role} type step`,
      sourceType: st.observed ? 'observed' : 'inferred',
      source: 'designSystem.typography.scale',
      confidence: st.observed ? 1 : 0.72,
      evidence: [`designSystem.typography.scale[${i}]`],
    });
  });
  for (const [k, v] of Object.entries(sys.spacing)) {
    out.push({
      name: `space-${k}`,
      value: v,
      role: `spacing ${k}`,
      sourceType: 'observed',
      source: 'designSystem.spacing',
      confidence: 1,
      evidence: [`designSystem.spacing.${k}`],
    });
  }
  for (const [k, v] of Object.entries(sys.radii)) {
    out.push({
      name: `radius-${k}`,
      value: v,
      role: `radius ${k}`,
      sourceType: 'observed',
      source: 'designSystem.borderRadius',
      confidence: 1,
      evidence: [`designSystem.borderRadius.${k}`],
    });
  }
  for (const [k, v] of Object.entries(sys.shadows)) {
    out.push({
      name: `shadow-${k}`,
      value: v,
      role: `shadow ${k}`,
      sourceType: 'observed',
      source: 'designSystem.shadows',
      confidence: 1,
      evidence: [`designSystem.shadows.${k}`],
    });
  }
  for (const [k, v] of Object.entries(sys.gradients)) {
    out.push({
      name: `gradient-${k}`,
      value: v,
      role: `gradient ${k}`,
      sourceType: 'observed',
      source: 'designSystem.gradients',
      confidence: 1,
      evidence: [`designSystem.gradients.${k}`],
    });
  }
  return out;
}

const byPrefix = (recs: TokenRecord[], p: string) => recs.filter((r) => r.name.startsWith(p));

export interface TokenPack {
  records: TokenRecord[];
  system: DesignSystem;
  meta: PackMeta;
}

export function tokensJson(pack: TokenPack): string {
  const recs = pack.records;
  return JSON.stringify(
    {
      schemaVersion: '1.1',
      source: pack.meta.url,
      derivation: 'stored-design-system',
      colors: byPrefix(recs, 'color-'),
      gradients: byPrefix(recs, 'gradient-'),
      typography: byPrefix(recs, 'font-'),
      spacing: byPrefix(recs, 'space-'),
      radii: byPrefix(recs, 'radius-'),
      borderWidths: [],
      shadows: byPrefix(recs, 'shadow-'),
      motion: [],
      breakpoints: [],
      quality: {
        observedTextStyles: pack.system.typeScale.length,
        actionContrast: contrastOf(pack.system.colors.roles['onAction'], pack.system.colors.roles['action']),
        warnings: pack.system.warnings,
      },
    },
    null,
    2,
  );
}

function contrastOf(a?: string, b?: string): number | null {
  if (!a || !b) return null;
  const ca = parseColor(a);
  const cb = parseColor(b);
  if (!ca || !cb) return null;
  return contrast(ca, cb);
}

/** CSS-variable set for theme.css / tailwind / scss (type steps excluded). */
export function cssVars(records: TokenRecord[]): { name: string; value: string }[] {
  return records
    .filter((r) => !r.name.startsWith('font-') || r.name.startsWith('font-family-'))
    .map((r) => ({ name: `--${r.name}`, value: r.value }));
}

export function renderThemeCss(records: TokenRecord[]): string {
  const lines = ['/* Generated on-device by tokotter. Review inferred tokens. */', ':root {'];
  for (const v of cssVars(records)) lines.push(`  ${v.name}: ${v.value};`);
  lines.push('}');
  return lines.join('\n') + '\n';
}

export function renderTailwindCss(records: TokenRecord[]): string {
  const lines = ['/* Tailwind CSS-first starting point. Review inferred tokens. */', '@theme {'];
  for (const v of cssVars(records)) lines.push(`  ${v.name}: ${v.value};`);
  lines.push('}');
  return lines.join('\n') + '\n';
}

export function renderScss(records: TokenRecord[]): string {
  const lines = ['// tokotter design tokens. Review inferred values before shipping.'];
  for (const v of cssVars(records)) lines.push(`$${v.name.slice(2)}: ${v.value};`);
  return lines.join('\n') + '\n';
}

export function renderTokensTs(records: TokenRecord[]): string {
  const lines = [
    '// tokotter design tokens as typed constants.',
    '// Anything marked "inferred" was derived, not measured — check before shipping.',
    'export const tokens = {',
  ];
  for (const r of records) {
    lines.push(`  '${r.name}': '${r.value}', // ${r.role} · ${r.sourceType} · confidence ${r.confidence}`);
  }
  lines.push('} as const;', '', 'export type TokenName = keyof typeof tokens;', '');
  return lines.join('\n');
}

export function renderDesignMd(pack: TokenPack): string {
  const { system, meta } = pack;
  const L: string[] = [];
  L.push(`# Design brief: ${meta.host}`, '');
  L.push('## Overview and style personality', '');
  L.push('Measured on-device by tokotter from an approved capture. No page text or protected source is included. Named roles come from the stored design system.', '');
  const leading = pack.records.filter((r) => r.name.startsWith('color-primary')).slice(0, 6)
    .map((r) => `\`${r.name}\` (${r.value})`);
  L.push('## Colour roles and usage rules', '');
  L.push(`Leading recorded roles are ${leading.length ? leading.join(', ') : 'none recorded'}. Keep observed and inferred labels distinct. Preserve recorded gradients rather than approximating them.`, '');
  L.push('## Typography hierarchy', '');
  const fams = system.typeScale.length ? 'recorded steps' : 'none recorded';
  L.push(`Type scale holds ${system.typeScale.length} ${fams}. Keep size, line-height, weight and letter-spacing tuples together so wrapping does not drift. A font-family name is evidence, not a license to redistribute its binary.`, '');
  L.push('## Layout and spacing rules', '');
  const sp = Object.entries(system.spacing).map(([k, v]) => `${k}=${v}`);
  L.push(`Spacing values: ${sp.length ? sp.join(', ') : 'none recorded'}.${meta.viewport ? ` The only authoritative viewport is ${meta.viewport.width} × ${meta.viewport.height} at ${meta.viewport.scale}× device scale.` : ''}`, '');
  L.push('## Elevation and depth', '');
  const sh = Object.entries(system.shadows);
  L.push(sh.length ? `Recorded shadows: ${sh.map(([k, v]) => `\`${k}\` (${v})`).join(', ')}.` : 'No material shadow value was recorded; keep elevation flat until recaptured.', '');
  L.push('## Shapes and radii', '');
  const ra = Object.entries(system.radii);
  L.push(ra.length ? `Recorded radii: ${ra.map(([k, v]) => `\`${k}\` (${v})`).join(', ')}.` : 'Recorded radii: none recorded.', '');
  L.push('## Quality notes', '');
  const ac = contrastOf(system.colors.roles['onAction'], system.colors.roles['action']);
  L.push(`Recorded action contrast is ${ac != null ? ac.toFixed(2) : 'not measured'}. Observed text styles: ${system.typeScale.length}.`, '');
  for (const w of system.warnings) L.push(`- ${w}`);
  L.push('');
  return L.join('\n');
}

export function renderHowToUse(meta: PackMeta): string {
  const vp = meta.viewport ? ` at ${meta.viewport.width} × ${meta.viewport.height} at ${meta.viewport.scale}× device scale.` : '.';
  return [
    '# How to use these tokens', '',
    `Every file here holds the same design system, measured from **${meta.url}**${vp} Pick the one that matches the project you are building, and delete the rest.`, '',
    '| File | Use it when |', '| --- | --- |',
    '| `../DESIGN.md` | You are briefing an AI coding tool, or a person. |',
    '| `theme.css` | Plain CSS, any framework, no build step. |',
    '| `tailwind-v4.css` | The project already uses Tailwind v4. |',
    '| `tokens.json` | A script, a token pipeline, or a design tool reads it. |',
    '| `_tokens.scss` | The project compiles Sass. |',
    '| `tokens.ts` | A TypeScript codebase imports values with types. |',
    '| `../extras/accessibility.md` | You need contrast evidence for review. |',
    '| `../extras/REBUILD.md` | You are asking an AI tool to rebuild the page. |', '',
    '## DESIGN.md — for an AI coding tool', '',
    'Prose, not syntax: the measured values with the rules for applying them, and no page text or protected source.', '',
    '> Build a page following the attached DESIGN.md. Use only the values it records.', '',
    '## Provenance', '',
    'Tokens are measured from a live capture on this device. Colour ramps and type steps that could not be read directly are marked `inferred` with a confidence value.', '',
  ].join('\n');
}

// --- extras: the "I wish it also had this" files ---

export interface ContrastRow {
  fg: string;
  bg: string;
  ratio: number;
  aa: boolean;
  aaLarge: boolean;
}

export function contrastRows(system: DesignSystem): ContrastRow[] {
  const roles = system.colors.roles;
  const pairs: [string, string][] = [
    [roles['text'], '#ffffff'],
    [roles['mutedText'], '#ffffff'],
    [roles['onAction'], roles['action']],
    [roles['action'], '#ffffff'],
    [roles['focus'], '#ffffff'],
  ];
  const rows: ContrastRow[] = [];
  for (const [fg, bg] of pairs) {
    const a = fg ? parseColor(fg) : null;
    const b = bg ? parseColor(bg) : null;
    if (!a || !b) continue;
    const ratio = contrast(a, b);
    rows.push({ fg, bg, ratio, aa: ratio >= 4.5, aaLarge: ratio >= 3 });
  }
  return rows;
}

export function renderAccessibilityMd(pack: TokenPack): string {
  const rows = contrastRows(pack.system);
  const L = ['# Accessibility — contrast evidence', '', `Source: **${pack.meta.url}** · generated on-device by tokotter.`, ''];
  L.push('| Text | Background | Ratio | AA normal | AA large |', '| --- | --- | --- | --- | --- |');
  for (const r of rows) {
    L.push(`| ${r.fg} | ${r.bg} | ${r.ratio.toFixed(2)} | ${r.aa ? 'pass' : 'fail'} | ${r.aaLarge ? 'pass' : 'fail'} |`);
  }
  L.push('', 'Pairs below 4.5:1 should not be used for body text. `onAction` over `action` is chosen automatically to preserve AA where possible.', '');
  for (const w of pack.system.warnings) L.push(`- ${w}`);
  L.push('');
  return L.join('\n');
}

export function renderRebuildMd(pack: TokenPack): string {
  const recs = pack.records;
  const colors = byPrefix(recs, 'color-').slice(0, 12).map((r) => `${r.name}=${r.value}`).join(', ');
  return [
    `# Rebuild brief — ${pack.meta.host}`, '',
    'Give this file plus `../tokens/tokens.json` to an AI coding tool.', '',
    '> Rebuild this page using only the attached tokens. Do not invent colours, fonts or spacing.',
    '> Keep the recorded type tuples together. Preserve gradients verbatim.', '',
    `Palette (head): ${colors || 'none recorded'}`,
    `Type steps: ${pack.system.typeScale.length} · Spacing steps: ${Object.keys(pack.system.spacing).length} · Radii: ${Object.keys(pack.system.radii).length} · Shadows: ${Object.keys(pack.system.shadows).length}`,
    `Viewport: ${pack.meta.viewport ? `${pack.meta.viewport.width}×${pack.meta.viewport.height}@${pack.meta.viewport.scale}x` : 'unknown'}`, '',
    'A font-family name is evidence, not a license to redistribute its binary. Use a system fallback or a licensed webfont with matching metrics.', '',
  ].join('\n');
}

export function stamp(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function slug(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'page';
}

export function tokenPackEntries(pack: TokenPack): { name: string; text: string }[] {
  const folder = `tokotter-${slug(pack.meta.host)}-${stamp()}-tokens`;
  const recs = pack.records;
  return [
    { name: `${folder}/DESIGN.md`, text: renderDesignMd(pack) },
    { name: `${folder}/tokens/tokens.json`, text: tokensJson(pack) },
    { name: `${folder}/tokens/HOW-TO-USE.md`, text: renderHowToUse(pack.meta) },
    { name: `${folder}/tokens/theme.css`, text: renderThemeCss(recs) },
    { name: `${folder}/tokens/tailwind-v4.css`, text: renderTailwindCss(recs) },
    { name: `${folder}/tokens/_tokens.scss`, text: renderScss(recs) },
    { name: `${folder}/tokens/tokens.ts`, text: renderTokensTs(recs) },
    { name: `${folder}/extras/accessibility.md`, text: renderAccessibilityMd(pack) },
    { name: `${folder}/extras/REBUILD.md`, text: renderRebuildMd(pack) },
  ];
}
