import { describe, expect, it } from 'vitest';
import { contrast, onColor, parseColor, ramp, toHex } from './color';

describe('color', () => {
  it('parses hex and rgb()', () => {
    expect(parseColor('#5e6ad2')).toEqual({ r: 94, g: 106, b: 210 });
    expect(parseColor('#fff')).toEqual({ r: 255, g: 255, b: 255 });
    expect(parseColor('rgb(255, 0, 0)')).toEqual({ r: 255, g: 0, b: 0 });
    expect(parseColor('red')).toBeNull();
  });

  it('round-trips to hex', () => {
    expect(toHex({ r: 94, g: 106, b: 210 })).toBe('#5e6ad2');
  });

  it('computes WCAG contrast', () => {
    const black = { r: 0, g: 0, b: 0 };
    const white = { r: 255, g: 255, b: 255 };
    expect(contrast(black, white)).toBeCloseTo(21, 0);
    expect(contrast(white, white)).toBeCloseTo(1, 2);
  });

  it('picks readable text', () => {
    expect(onColor('#0e7c86')).toBe('#ffffff');
    expect(onColor('#f7f5ef')).toBe('#000000');
  });

  it('builds an 11-step ramp around the seed', () => {
    const r = ramp('#5e6ad2')!;
    expect(Object.keys(r)).toHaveLength(11);
    expect(r['500']).toBe('#5e6ad2');
  });
});
