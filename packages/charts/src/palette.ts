// The series colours when a series names none.
//
// Plain colour values rather than theme classes: a chart's series arrive as
// data at run time, and on Native `className` is compile-time input that a
// runtime string never reaches (RFC 015 §3). These are the Tailwind 600
// shades of six hues chosen to stay apart for the common colour-vision
// deficiencies, and each keeps 3:1 against white and against a near-black
// background, the non-text contrast WCAG asks of a graphic.
export const DEFAULT_PALETTE = [
  '#2563eb', // blue
  '#d97706', // amber
  '#059669', // emerald
  '#db2777', // pink
  '#7c3aed', // violet
  '#0891b2', // cyan
] as const

export function seriesColor(index: number, given?: string): string {
  return given ?? (DEFAULT_PALETTE[index % DEFAULT_PALETTE.length] as string)
}
