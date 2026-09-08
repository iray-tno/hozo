import {
  defineFonts,
  type FontManifest,
  type FontStyle,
  type FontWeight,
  fontFamily,
} from './fonts.js'

export type NativeFontPlatform = 'ios' | 'android'

export interface NativeFontFacePlan {
  /** Project-relative path that the native project must register before React renders. */
  path: string
  /** The descriptor authored in the shared manifest, with aliases canonicalized. */
  weight: number | `${number} ${number}`
  style: FontStyle
}

export interface NativeFontFamilyPlan {
  /** Stable manifest key, useful to generators and validation tooling. */
  id: string
  /** The value to use as React Native's `fontFamily`. */
  family: string
  faces: NativeFontFacePlan[]
}

export interface NativeFontPlan {
  platform: NativeFontPlatform
  /** Deduplicated files that must be registered by the host project. */
  files: string[]
  families: NativeFontFamilyPlan[]
}

function canonicalWeight(weight: FontWeight | undefined): number | `${number} ${number}` {
  if (weight === undefined || weight === 'normal') return 400
  if (weight === 'bold') return 700
  return weight
}

function isExternal(
  external: true | readonly ('web' | NativeFontPlatform)[] | undefined,
  platform: NativeFontPlatform,
): boolean {
  return external === true || external?.includes(platform) === true
}

/**
 * Produces a deterministic description of the assets a bare React Native host must register.
 * It deliberately performs no filesystem or native-project mutation.
 */
export function createNativeFontPlan(
  manifest: FontManifest,
  platform: NativeFontPlatform,
): NativeFontPlan {
  defineFonts(manifest)
  const files = new Set<string>()
  const families: NativeFontFamilyPlan[] = []

  for (const [id, definition] of Object.entries(manifest)) {
    if (isExternal(definition.external, platform)) continue

    const seenFaces = new Set<string>()
    const faces: NativeFontFacePlan[] = []
    for (const face of definition.faces ?? []) {
      const path = face.sources[platform]
      if (path === undefined) continue
      const planned = {
        path: path.trim(),
        weight: canonicalWeight(face.weight),
        style: face.style ?? 'normal',
      } satisfies NativeFontFacePlan
      const key = JSON.stringify(planned)
      if (seenFaces.has(key)) continue
      seenFaces.add(key)
      files.add(planned.path)
      faces.push(planned)
    }

    if (faces.length > 0) {
      families.push({ id, family: fontFamily(manifest, id, platform)!, faces })
    }
  }

  return { platform, files: [...files], families }
}
