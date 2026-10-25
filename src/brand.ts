// tokotter brand — decided 2026-10-06.
// Otter + river: deep teal water, warm drift-amber accent on paper.
// White text on --toko-river passes WCAG AA (verified in tests).
export const brand = {
  river: '#0E7C86', // primary — links, active tab pill, key actions
  deep: '#103B40', // ink — headings, primary buttons
  amber: '#F59E0B', // accent — highlights, the otter
  paper: '#F7F5EF', // panel background
  card: '#FFFFFF', // cards
  line: '#E4DED2', // borders
  ink: '#17272A', // body text
  muted: '#5C6B6E', // secondary text
  success: '#15803D',
  danger: '#B91C1C',
} as const;

export type BrandKey = keyof typeof brand;

/** CSS custom properties emitted into the side panel (:root). */
export function brandCssVars(): string {
  const rows = (Object.keys(brand) as BrandKey[]).map(
    (k) => `  --toko-${k}: ${brand[k]};`,
  );
  return `:root {\n${rows.join('\n')}\n}`;
}
