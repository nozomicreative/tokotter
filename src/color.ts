// Minimal color math: parse, luminance, contrast, ramp interpolation.
// Dependency-free so it runs in content scripts, panels and tests.
export interface Rgb {
  r: number;
  g: number;
  b: number;
}

export function parseColor(input: string): Rgb | null {
  const s = input.trim().toLowerCase();
  const hex = /^#([0-9a-f]{3,8})$/.exec(s);
  if (hex) {
    let h = hex[1];
    if (h.length === 3) h = h.split('').map((c) => c + c).join('');
    if (h.length === 6 || h.length === 8) {
      return {
        r: parseInt(h.slice(0, 2), 16),
        g: parseInt(h.slice(2, 4), 16),
        b: parseInt(h.slice(4, 6), 16),
      };
    }
    return null;
  }
  const m = /^rgba?\(\s*([^)]+)\)$/.exec(s);
  if (m) {
    const parts = m[1].split(/[\s,/]+/).filter(Boolean);
    if (parts.length >= 3) {
      const conv = (v: string) =>
        v.endsWith('%') ? (parseFloat(v) * 255) / 100 : parseFloat(v);
      const [r, g, b] = parts.map(conv);
      if ([r, g, b].every((n) => Number.isFinite(n))) {
        return {
          r: Math.max(0, Math.min(255, r)),
          g: Math.max(0, Math.min(255, g)),
          b: Math.max(0, Math.min(255, b)),
        };
      }
    }
  }
  return null;
}

export function toHex(c: Rgb): string {
  const h = (n: number) =>
    Math.round(Math.max(0, Math.min(255, n)))
      .toString(16)
      .padStart(2, '0');
  return `#${h(c.r)}${h(c.g)}${h(c.b)}`;
}

function lin(v: number): number {
  const s = v / 255;
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

/** WCAG relative luminance. */
export function luminance(c: Rgb): number {
  return 0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b);
}

/** WCAG contrast ratio, 1–21. */
export function contrast(a: Rgb, b: Rgb): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

function mix(a: Rgb, b: Rgb, t: number): Rgb {
  return {
    r: a.r + (b.r - a.r) * t,
    g: a.g + (b.g - a.g) * t,
    b: a.b + (b.b - a.b) * t,
  };
}

const WHITE: Rgb = { r: 255, g: 255, b: 255 };
const BLACK: Rgb = { r: 0, g: 0, b: 0 };

/**
 * Eleven-step ramp interpolated around an observed seed color.
 * Lighter steps mix toward white, darker steps toward black.
 */
export function ramp(seed: string): Record<string, string> | null {
  const base = parseColor(seed);
  if (!base) return null;
  const steps: Record<string, number> = {
    '50': 0.9,
    '100': 0.78,
    '200': 0.62,
    '300': 0.44,
    '400': 0.24,
    '500': 0,
    '600': -0.18,
    '700': -0.36,
    '800': -0.54,
    '900': -0.7,
    '950': -0.84,
  };
  const out: Record<string, string> = {};
  for (const [step, t] of Object.entries(steps)) {
    out[step] =
      t === 0
        ? toHex(base)
        : toHex(t > 0 ? mix(base, WHITE, t) : mix(base, BLACK, -t));
  }
  return out;
}

/** Pick black or white text for a background, preserving contrast. */
export function onColor(bg: string): string {
  const c = parseColor(bg);
  if (!c) return '#ffffff';
  return contrast(c, WHITE) >= contrast(c, BLACK) ? '#ffffff' : '#000000';
}
