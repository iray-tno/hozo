import {
  defineFonts,
  type FontFamilyDefinition,
  type FontManifest,
  type FontStyle,
  type FontWeight,
} from './fonts.ts'

export interface ExpoAndroidFontDefinition {
  path: string
  weight: number
  style?: 'normal' | 'italic'
}

export interface ExpoAndroidFontFamily {
  fontFamily: string
  fontDefinitions: ExpoAndroidFontDefinition[]
}

/** The public option shape accepted by Expo's `expo-font` config plugin. */
export interface ExpoFontPluginOptions {
  ios?: { fonts: string[] }
  android?: { fonts: ExpoAndroidFontFamily[] }
}

function isExternal(definition: FontFamilyDefinition, platform: 'ios' | 'android'): boolean {
  return definition.external === true || definition.external?.includes(platform) === true
}

function androidWeight(weight: FontWeight | undefined, id: string): number {
  if (weight === undefined || weight === 'normal') return 400
  if (weight === 'bold') return 700
  if (typeof weight === 'number') return weight
  throw new TypeError(
    `Font ${JSON.stringify(id)} uses variable weight ${JSON.stringify(weight)}; Expo Android XML needs one static face per weight`,
  )
}

function androidStyle(style: FontStyle | undefined, id: string): 'normal' | 'italic' {
  if (style === undefined || style === 'normal') return 'normal'
  if (style === 'italic') return 'italic'
  throw new TypeError(
    `Font ${JSON.stringify(id)} uses oblique style; Expo Android XML supports normal or italic`,
  )
}

/**
 * Derives options for Expo's official `expo-font` config plugin.
 *
 * This function does not import Expo. Keep `expo-font` in the application and
 * pass the returned value as its plugin options from `app.config.ts`.
 */
export function createExpoFontOptions(manifest: FontManifest): ExpoFontPluginOptions {
  defineFonts(manifest)
  const ios = new Set<string>()
  const android = new Map<string, Map<string, ExpoAndroidFontDefinition>>()

  for (const [id, definition] of Object.entries(manifest)) {
    for (const face of definition.faces ?? []) {
      if (!isExternal(definition, 'ios') && face.sources.ios !== undefined) {
        ios.add(face.sources.ios)
      }
      if (isExternal(definition, 'android') || face.sources.android === undefined) continue

      const family = definition.nativeFamily?.android ?? definition.family
      const font = {
        path: face.sources.android,
        weight: androidWeight(face.weight, id),
        style: androidStyle(face.style, id),
      } satisfies ExpoAndroidFontDefinition
      const definitions = android.get(family) ?? new Map<string, ExpoAndroidFontDefinition>()
      definitions.set(JSON.stringify(font), font)
      android.set(family, definitions)
    }
  }

  return {
    ...(ios.size === 0 ? {} : { ios: { fonts: [...ios] } }),
    ...(android.size === 0
      ? {}
      : {
          android: {
            fonts: [...android].map(([fontFamily, definitions]) => ({
              fontFamily,
              fontDefinitions: [...definitions.values()],
            })),
          },
        }),
  }
}
