import type { CompileDiagnostic } from './index.ts'

export type FontPlatform = 'web' | 'ios' | 'android'

export interface AvailableFontFace {
  platforms: readonly FontPlatform[]
  weightFrom: number
  weightTo: number
  style: 'normal' | 'italic' | 'oblique'
}

export interface AvailableFontFamily {
  id: string
  names: Readonly<Record<FontPlatform, string>>
  external: readonly FontPlatform[]
  faces: readonly AvailableFontFace[]
}

/** Serializable font facts used only for conservative build-time diagnostics. */
export interface FontAvailability {
  families: readonly AvailableFontFamily[]
}

function unquote(value: string): string {
  const trimmed = value.trim()
  const quote = trimmed[0]
  if ((quote === '"' || quote === "'") && trimmed.endsWith(quote)) {
    return trimmed.slice(1, -1).replaceAll(`\\${quote}`, quote).replaceAll('\\\\', '\\')
  }
  return trimmed
}

function cssFamily(value: string): string {
  const trimmed = value.trim()
  if (trimmed.startsWith('"') || trimmed.startsWith("'")) {
    const quote = trimmed[0]!
    let escaped = false
    for (let index = 1; index < trimmed.length; index++) {
      const character = trimmed[index]
      if (character === quote && !escaped) return unquote(trimmed.slice(0, index + 1))
      escaped = character === '\\' && !escaped
      if (character !== '\\') escaped = false
    }
  }
  return unquote(trimmed.split(',')[0] ?? trimmed)
}

interface StaticFontUse {
  family: string
  weight?: number
  style?: 'normal' | 'italic' | 'oblique'
}

function staticUses(output: string, target: 'web' | 'native'): StaticFontUse[] {
  const uses: StaticFontUse[] = []
  for (const match of output.matchAll(/\{([^{}]*)\}/gs)) {
    const block = match[1] ?? ''
    const family =
      target === 'web'
        ? /(?:^|\n)\s*font-family:\s*([^;\n]+);/.exec(block)?.[1]
        : /(?:^|\n)\s*fontFamily:\s*(['"])(.*?)\1,/.exec(block)?.[2]
    if (family === undefined) continue
    const weightText =
      target === 'web'
        ? /(?:^|\n)\s*font-weight:\s*(\d+);/.exec(block)?.[1]
        : /(?:^|\n)\s*fontWeight:\s*['"](\d+)['"],/.exec(block)?.[1]
    const styleText =
      target === 'web'
        ? /(?:^|\n)\s*font-style:\s*(normal|italic|oblique);/.exec(block)?.[1]
        : /(?:^|\n)\s*fontStyle:\s*['"](normal|italic|oblique)['"],/.exec(block)?.[1]
    uses.push({
      family: target === 'web' ? cssFamily(family) : family,
      ...(weightText === undefined ? {} : { weight: Number(weightText) }),
      ...(styleText === undefined ? {} : { style: styleText as StaticFontUse['style'] }),
    })
  }
  return uses
}

function diagnostic(
  code: string,
  message: string,
  spanStart: number,
  spanEnd: number,
): CompileDiagnostic {
  return { code, severity: 'warning', message, spanStart, spanEnd }
}

/**
 * Checks only generated declarations whose family and requested variant are literal.
 * Unknown families remain alone because they may be system fonts or host-owned loaders.
 */
export function diagnoseStaticFonts(
  output: string,
  target: 'web' | 'native',
  availability: FontAvailability | undefined,
  spanStart: number,
  spanEnd: number,
): CompileDiagnostic[] {
  if (!availability) return []
  const platforms: readonly FontPlatform[] = target === 'web' ? ['web'] : ['ios', 'android']
  const diagnostics = new Map<string, CompileDiagnostic>()

  for (const use of staticUses(output, target)) {
    for (const platform of platforms) {
      const family = availability.families.find(
        (candidate) => candidate.names[platform] === use.family,
      )
      if (!family || family.external.includes(platform)) continue
      const faces = family.faces.filter((face) => face.platforms.includes(platform))
      if (faces.length === 0) {
        const message = `Font ${JSON.stringify(family.id)} resolves to ${JSON.stringify(use.family)} on ${platform}, but the manifest registers no ${platform} source.`
        diagnostics.set(
          message,
          diagnostic('FONT_FAMILY_NOT_REGISTERED', message, spanStart, spanEnd),
        )
        continue
      }
      if (use.weight === undefined && use.style === undefined) continue
      const available = faces.some(
        (face) =>
          (use.weight === undefined ||
            (use.weight >= face.weightFrom && use.weight <= face.weightTo)) &&
          (use.style === undefined || use.style === face.style),
      )
      if (available) continue
      const requested = [
        use.weight === undefined ? undefined : `weight ${use.weight}`,
        use.style === undefined ? undefined : use.style,
      ]
        .filter(Boolean)
        .join(' and ')
      const message = `Font ${JSON.stringify(family.id)} has no ${platform} face for ${requested}. Add that face, mark ${platform} external, or change the static style.`
      diagnostics.set(
        message,
        diagnostic('FONT_VARIANT_NOT_REGISTERED', message, spanStart, spanEnd),
      )
    }
  }

  return [...diagnostics.values()]
}
