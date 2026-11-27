// The series colours when a series names none.
//
// Plain colour values rather than theme classes: a chart's series arrive as
// data at run time, and on Native `className` is compile-time input that a
// runtime string never reaches (RFC 015 §3). One set serves light and dark
// pages alike, because the renderer does not know which it is on: each is a
// Tailwind 600 shade that keeps 3:1 against white and against near-black,
// the non-text contrast WCAG asks of a graphic.
//
// The order is what keeps neighbours apart for a reader with a colour-vision
// deficiency, not the hues alone. The previous set put emerald beside pink,
// which simulated deuteranopia renders the same colour (OKLab ΔE 1.1). This
// order was chosen by searching every ordering of the eligible 600 shades:
// - each adjacent pair stays ΔE ≥ 16 under protanopia and deuteranopia, and
//   ≥ 15 for full colour vision across all pairs;
// - any two of the first three can be told apart, for a scatter's few groups.
// It keeps blue and amber first, so a two-series chart looks as it did.
export const DEFAULT_PALETTE = [
  '#2563eb', // blue
  '#d97706', // amber
  '#0891b2', // cyan
  '#e11d48', // rose
  '#9333ea', // purple
  '#16a34a', // green
] as const

export function seriesColor(index: number, given?: string): string {
  return given ?? (DEFAULT_PALETTE[index % DEFAULT_PALETTE.length] as string)
}
