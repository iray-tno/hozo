import { Children, type ReactNode } from 'react'
import { type StyleProp, Text, type TextStyle } from 'react-native'
import { type HozoPressableState, HozoText } from './pressable.native.tsx'

export interface HozoFirstLetterProps {
  style?: StyleProp<TextStyle> | ((state: HozoPressableState) => StyleProp<TextStyle>)
  children?: ReactNode
}

// Mirrors CSS `::first-letter` for dynamic string children: optional leading
// whitespace, optional opening punctuation, then the first character plus any
// combining marks.
const FIRST_LETTER_RE =
  /^(\s*)((?:["'([{«‹“‘「『（【《〈]*[^\s])[\u0300-\u036f\u1ab0-\u1aff\u1dc0-\u1dff\u20d0-\u20ff\ufe00-\ufe0f\ufe20-\ufe2f]*)([\s\S]*)$/u

function splitFirstString(
  node: ReactNode,
  style: HozoFirstLetterProps['style'],
  done: { value: boolean },
): ReactNode {
  if (done.value || node == null || typeof node === 'boolean') return node
  if (typeof node === 'string' || typeof node === 'number') {
    const text = String(node)
    const match = FIRST_LETTER_RE.exec(text)
    if (!match) return node
    done.value = true
    const [, ws, head, tail] = match
    if (typeof style === 'function') {
      return (
        <>
          {ws}
          <HozoText style={style}>{head}</HozoText>
          {tail}
        </>
      )
    }
    return (
      <>
        {ws}
        <Text style={style}>{head}</Text>
        {tail}
      </>
    )
  }
  if (Array.isArray(node)) {
    return Children.map(node, (child) => splitFirstString(child, style, done))
  }
  return node
}

/**
 * Generated-code inline wrapper for `first-letter:` on dynamic Text children
 * whose first grapheme is not statically known at compile time. Static text
 * literals are split at compile time with zero runtime wrapper.
 */
export function HozoFirstLetter({ style, children }: HozoFirstLetterProps): ReactNode {
  return splitFirstString(children, style, { value: false })
}
