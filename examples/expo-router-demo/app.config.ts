import { defineFonts, type FontManifest } from '@hozo/typography/fonts'
import { createExpoFontOptions } from '@hozo/typography/fonts/expo'
import type { ExpoConfig } from 'expo/config'

import manifest from './fonts.json'

const fonts = defineFonts(manifest as FontManifest)

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
  experiments: { typedRoutes: true },
  web: { bundler: 'metro' },
} satisfies ExpoConfig
