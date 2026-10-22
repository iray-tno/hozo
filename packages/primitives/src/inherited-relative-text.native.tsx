import { HozoTextSizeContext } from '@hozo/engine/generated/text-size-context'
import { type ComponentPropsWithRef, useContext } from 'react'
import type { Text } from 'react-native'
import { HozoInheritedText } from './inherited-text.native.tsx'

/**
 * A semantic size ratio, not a second style resolver. The scope's legacy
 * size bridge comes from the same effective metrics as the seven-field frame.
 * Resolve the default once; the element's own class/explicit size wins after
 * it and the shared Text publishes the result for opaque descendants too.
 * Kept separate so passive Text pays no new hook or import for relative text.
 */
export function HozoInheritedRelativeText({
  hozoRelative,
  style,
  ...props
}: ComponentPropsWithRef<typeof Text> & { hozoRelative: number }) {
  const base = useContext(HozoTextSizeContext)
  return (
    <HozoInheritedText {...props} style={[{ fontSize: Math.round(base * hozoRelative) }, style]} />
  )
}
