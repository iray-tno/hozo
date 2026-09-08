export type FontPlatform = 'web' | 'ios' | 'android'
export type FontStyle = 'normal' | 'italic' | 'oblique'
export type FontDisplay = 'auto' | 'block' | 'swap' | 'fallback' | 'optional'
export type FontFormat = 'woff2' | 'woff' | 'truetype' | 'opentype'
export type FontWeight = number | 'normal' | 'bold' | `${number} ${number}`

export interface WebFontSource {
  /** A URL already resolved by the host bundler, or one valid from the emitted stylesheet. */
  url: string
  format?: FontFormat
}

export interface FontFaceSources {
  web?: readonly WebFontSource[]
  /** Project-relative file path used by Expo or a bare iOS project. */
  ios?: string
  /** Project-relative file path used by Expo or a bare Android project. */
  android?: string
}

export interface FontFaceDefinition {
  sources: FontFaceSources
  weight?: FontWeight
  style?: FontStyle
  display?: FontDisplay
  unicodeRange?: string | readonly string[]
}

export interface FontFamilyDefinition {
  /** CSS family name. It is also the Native fallback when no platform name is supplied. */
  family: string
  /** Native family/PostScript names when they differ from the logical Web family. */
  nativeFamily?: { ios?: string; android?: string }
  faces?: readonly FontFaceDefinition[]
  /** Platforms whose font availability is owned by the host, such as next/font or linked assets. */
  external?: true | readonly FontPlatform[]
}

export type FontManifest = Readonly<Record<string, FontFamilyDefinition>>

export interface FontAvailability {
  families: Array<{
    id: string
    names: Record<FontPlatform, string>
    external: FontPlatform[]
    faces: Array<{
      platforms: FontPlatform[]
      weightFrom: number
      weightTo: number
      style: FontStyle
    }>
  }>
}

function externalPlatforms(value: FontFamilyDefinition['external']): Set<FontPlatform> {
  return new Set(value === true ? ['web', 'ios', 'android'] : (value ?? []))
}

function printable(value: string, label: string): string {
  const trimmed = value.trim()
  const hasControlCharacter = [...trimmed].some((character) => {
    const code = character.charCodeAt(0)
    return code < 32 || code === 127
  })
  if (trimmed.length === 0 || hasControlCharacter) {
    throw new TypeError(`${label} must be a non-empty printable string`)
  }
  return trimmed
}

function normalizedWeight(weight: FontWeight | undefined): string {
  if (weight === undefined) return '400'
  if (weight === 'normal') return '400'
  if (weight === 'bold') return '700'
  if (typeof weight === 'number') {
    if (!Number.isInteger(weight) || weight < 1 || weight > 1000) {
      throw new TypeError(`Font weight ${weight} must be an integer from 1 through 1000`)
    }
    return String(weight)
  }
  const match = /^(\d+) (\d+)$/.exec(weight)
  if (!match) throw new TypeError(`Invalid variable font weight range ${JSON.stringify(weight)}`)
  const from = Number(match[1])
  const to = Number(match[2])
  if (from < 1 || to > 1000 || from >= to) {
    throw new TypeError(
      `Variable font weight range ${JSON.stringify(weight)} must increase within 1..1000`,
    )
  }
  return `${from} ${to}`
}

function ranges(value: FontFaceDefinition['unicodeRange']): string[] {
  const values = typeof value === 'string' ? [value] : (value ?? [])
  return values.map((range) => {
    const trimmed = range.trim()
    if (!/^U\+[0-9A-F?]+(?:-[0-9A-F]+)?$/i.test(trimmed)) {
      throw new TypeError(`Invalid Unicode range ${JSON.stringify(range)}`)
    }
    return trimmed.toUpperCase()
  })
}

function validateFace(id: string, face: FontFaceDefinition, external: Set<FontPlatform>): void {
  normalizedWeight(face.weight)
  const sources = face.sources
  const web = sources.web ?? []
  if (external.has('web') && web.length > 0) {
    throw new TypeError(
      `Font ${JSON.stringify(id)} is externally managed on Web but also has Web sources`,
    )
  }
  if (external.has('ios') && sources.ios !== undefined) {
    throw new TypeError(
      `Font ${JSON.stringify(id)} is externally managed on iOS but also has an iOS source`,
    )
  }
  if (external.has('android') && sources.android !== undefined) {
    throw new TypeError(
      `Font ${JSON.stringify(id)} is externally managed on Android but also has an Android source`,
    )
  }
  for (const source of web) printable(source.url, `Web source for font ${JSON.stringify(id)}`)
  if (sources.ios !== undefined) printable(sources.ios, `iOS source for font ${JSON.stringify(id)}`)
  if (sources.android !== undefined) {
    printable(sources.android, `Android source for font ${JSON.stringify(id)}`)
  }
  ranges(face.unicodeRange)
  if (web.length === 0 && sources.ios === undefined && sources.android === undefined) {
    throw new TypeError(`Font ${JSON.stringify(id)} has a face with no source`)
  }
}

/**
 * Validates a font manifest while preserving its exact logical-family keys for inference.
 * Calling it does not register or load anything.
 */
export function defineFonts<const T extends FontManifest>(manifest: T): T {
  if (Object.keys(manifest).length === 0) throw new TypeError('A font manifest cannot be empty')
  for (const [id, definition] of Object.entries(manifest)) {
    if (!/^[A-Za-z][A-Za-z0-9_-]*$/.test(id)) {
      throw new TypeError(`Invalid logical font identifier ${JSON.stringify(id)}`)
    }
    printable(definition.family, `Family name for font ${JSON.stringify(id)}`)
    if (definition.nativeFamily?.ios !== undefined) {
      printable(definition.nativeFamily.ios, `iOS family for font ${JSON.stringify(id)}`)
    }
    if (definition.nativeFamily?.android !== undefined) {
      printable(definition.nativeFamily.android, `Android family for font ${JSON.stringify(id)}`)
    }
    const external = externalPlatforms(definition.external)
    if ((definition.faces?.length ?? 0) === 0 && external.size === 0) {
      throw new TypeError(
        `Font ${JSON.stringify(id)} needs a face or an explicitly external platform`,
      )
    }
    for (const face of definition.faces ?? []) validateFace(id, face, external)
  }
  return manifest
}

/** Resolves one logical family to the name authored in a platform style. */
export function fontFamily(
  manifest: FontManifest,
  id: string,
  platform: FontPlatform,
): string | undefined {
  const definition = manifest[id]
  if (!definition) return undefined
  if (platform === 'web') return definition.family
  return definition.nativeFamily?.[platform] ?? definition.family
}

function weightRange(weight: FontWeight | undefined): [number, number] {
  const normalized = normalizedWeight(weight)
  const [from, to = from] = normalized.split(' ').map(Number)
  return [from!, to!]
}

/** Creates the small serializable registry used by Hozo's conservative compiler diagnostics. */
export function createFontAvailability(manifest: FontManifest): FontAvailability {
  defineFonts(manifest)
  return {
    families: Object.entries(manifest).map(([id, definition]) => ({
      id,
      names: {
        web: definition.family,
        ios: definition.nativeFamily?.ios ?? definition.family,
        android: definition.nativeFamily?.android ?? definition.family,
      },
      external: [...externalPlatforms(definition.external)],
      faces: (definition.faces ?? []).map((face) => {
        const [weightFrom, weightTo] = weightRange(face.weight)
        return {
          platforms: (['web', 'ios', 'android'] as const).filter((platform) =>
            platform === 'web'
              ? (face.sources.web?.length ?? 0) > 0
              : face.sources[platform] !== undefined,
          ),
          weightFrom,
          weightTo,
          style: face.style ?? 'normal',
        }
      }),
    })),
  }
}

function quoted(value: string): string {
  return `"${value.replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"`
}

/** Creates deterministic, deduplicated `@font-face` CSS for Web-managed faces. */
export function createFontFaceCss(manifest: FontManifest): string {
  defineFonts(manifest)
  const rules = new Set<string>()
  for (const definition of Object.values(manifest)) {
    if (externalPlatforms(definition.external).has('web')) continue
    for (const face of definition.faces ?? []) {
      const sources = face.sources.web ?? []
      if (sources.length === 0) continue
      const src = sources
        .map(
          ({ url, format }) => `url(${quoted(url)})${format ? ` format(${quoted(format)})` : ''}`,
        )
        .join(', ')
      const descriptors = [
        `  font-family: ${quoted(definition.family)};`,
        `  src: ${src};`,
        `  font-style: ${face.style ?? 'normal'};`,
        `  font-weight: ${normalizedWeight(face.weight)};`,
        `  font-display: ${face.display ?? 'swap'};`,
      ]
      const unicode = ranges(face.unicodeRange)
      if (unicode.length > 0) descriptors.push(`  unicode-range: ${unicode.join(', ')};`)
      rules.add(`@font-face {\n${descriptors.join('\n')}\n}`)
    }
  }
  return rules.size === 0 ? '' : `${[...rules].join('\n\n')}\n`
}
