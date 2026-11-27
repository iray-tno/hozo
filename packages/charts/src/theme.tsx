// What a user can change about how a chart looks (RFC 015 §3.1): the series
// colours, the bars' shape, the line's weight and how far the frame recedes.
// What keeps a chart readable is not here: the key, the tick label contrast
// and the palette's checks are defaults no theme turns off.
//
// Plain values, not class names: on Native `className` is compile-time
// input, and a theme arrives at run time (RFC 015 §3).

import { createContext, type ReactNode, useContext, useMemo } from 'react'
import { DEFAULT_PALETTE } from './palette.ts'

export type ColorScheme = 'light' | 'dark'

/**
 * One set of series colours for light and dark pages, or one for each. A
 * single set must hold 3:1 against both backgrounds, as the default does.
 */
export type ChartPalette =
  | readonly string[]
  | { readonly light: readonly string[]; readonly dark: readonly string[] }

export interface ChartTheme {
  palette?: ChartPalette
  bar?: {
    /** The rounding of a bar's value end; 0 for square bars. */
    radius?: number
    /** The thickest a bar gets; the rest of its band is left as air. */
    maxWidth?: number
    /** Between touching bars and between stacked segments. */
    gap?: number
  }
  line?: { width?: number; pointRadius?: number }
  /** Gridlines and the baseline, as a fraction of the text colour. */
  frame?: { grid?: number; axis?: number }
}

export interface ResolvedChartTheme {
  /** The set for the colour scheme in use. */
  palette: readonly string[]
  bar: { radius: number; maxWidth: number; gap: number }
  line: { width: number; pointRadius: number }
  frame: { grid: number; axis: number }
}

export const DEFAULT_THEME: ResolvedChartTheme = {
  palette: DEFAULT_PALETTE,
  bar: { radius: 4, maxWidth: 24, gap: 2 },
  line: { width: 2, pointRadius: 4 },
  frame: { grid: 0.1, axis: 0.3 },
}

/** `over` on top of `base`, field by field, so a theme can change one thing. */
export function mergeTheme(base: ChartTheme, over?: ChartTheme): ChartTheme {
  if (!over) return base
  return {
    palette: over.palette ?? base.palette,
    bar: { ...base.bar, ...over.bar },
    line: { ...base.line, ...over.line },
    frame: { ...base.frame, ...over.frame },
  }
}

/** Every value filled in, with the palette picked for `scheme`. */
export function resolveTheme(theme: ChartTheme, scheme: ColorScheme): ResolvedChartTheme {
  const given = theme.palette
  const palette = given === undefined ? undefined : 'light' in given ? given[scheme] : given
  const defined = <T extends object>(values: T | undefined) =>
    Object.fromEntries(
      Object.entries(values ?? {}).filter(([, value]) => value !== undefined),
    ) as Partial<T>
  return {
    // An empty set would leave every series without a colour.
    palette: palette?.length ? palette : DEFAULT_THEME.palette,
    bar: { ...DEFAULT_THEME.bar, ...defined(theme.bar) },
    line: { ...DEFAULT_THEME.line, ...defined(theme.line) },
    frame: { ...DEFAULT_THEME.frame, ...defined(theme.frame) },
  }
}

interface Ambient {
  theme: ChartTheme
  colorScheme?: ColorScheme
}

const AmbientTheme = createContext<Ambient>({ theme: {} })

export interface ChartThemeProviderProps {
  theme?: ChartTheme
  /**
   * Which of a `{ light, dark }` palette to use. The system setting by
   * default; set it when the app has its own light and dark switch.
   */
  colorScheme?: ColorScheme
  children?: ReactNode
}

/**
 * The theme for every chart inside it. A provider inside another changes
 * only what it names, and a chart's own `theme` prop goes on top of both.
 */
export function ChartThemeProvider({ theme, colorScheme, children }: ChartThemeProviderProps) {
  const outer = useContext(AmbientTheme)
  const value = useMemo(
    () => ({
      theme: mergeTheme(outer.theme, theme),
      colorScheme: colorScheme ?? outer.colorScheme,
    }),
    [outer, theme, colorScheme],
  )
  return <AmbientTheme.Provider value={value}>{children}</AmbientTheme.Provider>
}

/**
 * The theme a chart draws with: the providers above it, then its own
 * `theme`. `useSystemScheme` is the platform's, passed in by each entry
 * point the way the chart box is.
 */
export function useChartTheme(
  own: ChartTheme | undefined,
  useSystemScheme: () => ColorScheme,
): ResolvedChartTheme {
  const ambient = useContext(AmbientTheme)
  const system = useSystemScheme()
  const scheme = ambient.colorScheme ?? system
  return useMemo(() => resolveTheme(mergeTheme(ambient.theme, own), scheme), [ambient, own, scheme])
}
