import { defineFonts } from '@hozo/typography/fonts'
import { createExpoFontOptions } from '@hozo/typography/fonts/expo'
import type { ExpoConfig } from 'expo/config'

const materialSymbols =
  './node_modules/@expo-google-fonts/material-symbols/400Regular/MaterialSymbols_400Regular.ttf'

const fonts = defineFonts({
  fixtureSymbols: {
    family: 'Material Symbols',
    nativeFamily: { android: 'material_symbols', ios: 'MaterialSymbols' },
    external: ['web'],
    faces: [
      {
        sources: { ios: materialSymbols, android: materialSymbols },
        weight: 400,
      },
    ],
  },
})

export default {
  name: 'Hozo Expo Router fixture',
  slug: 'hozo-expo-router-fixture',
  version: '1.0.0',
  orientation: 'portrait',
  plugins: [
    'expo-router',
    [
      '@hozo/navigation/expo-config',
      {
        scheme: 'hozofixture',
        domains: [{ host: 'app.example.com', pathPrefixes: ['/products'] }],
      },
    ],
    ['expo-font', createExpoFontOptions(fonts)],
  ],
  web: { bundler: 'metro' },
} satisfies ExpoConfig
