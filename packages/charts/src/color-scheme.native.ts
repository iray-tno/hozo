// The device's colour scheme on Native, for a `{ light, dark }` palette.

import { useColorScheme } from 'react-native'
import type { ColorScheme } from './theme.tsx'

export function useSystemScheme(): ColorScheme {
  return useColorScheme() === 'dark' ? 'dark' : 'light'
}
