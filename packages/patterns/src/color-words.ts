import type { useHozoMessage } from '@hozo/behaviors'
import { colorName, type Hsla } from './color-rules.ts'

type Message = ReturnType<typeof useHozoMessage>

const HUE_KEY = {
  red: 'hozo.color.red',
  orange: 'hozo.color.orange',
  yellow: 'hozo.color.yellow',
  green: 'hozo.color.green',
  cyan: 'hozo.color.cyan',
  blue: 'hozo.color.blue',
  purple: 'hozo.color.purple',
  pink: 'hozo.color.pink',
  gray: 'hozo.color.gray',
  black: 'hozo.color.black',
  white: 'hozo.color.white',
} as const

/** "dark blue", through the project's translations (decision 008). */
export function spokenName(message: Message, hsla: Hsla): string {
  const { hue, shade } = colorName(hsla)
  const word = message(HUE_KEY[hue])
  return shade === 'dark'
    ? message('hozo.color.dark', { color: word })
    : shade === 'light'
      ? message('hozo.color.light', { color: word })
      : word
}

/** "dark blue, #1e3a8a": the name for meaning, the hex for precision. */
export function describedColor(message: Message, hsla: Hsla, hex: string): string {
  return message('hozo.colorPicker.described', { name: spokenName(message, hsla), hex })
}
