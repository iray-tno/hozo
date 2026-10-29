import { useAnnounce, useHozoMessage } from '@hozo/behaviors'
import { hozoAuthoredStyle } from '@hozo/engine/generated/gap-styles'
import { hozoClasses } from '@hozo/engine/project'
import { useContext, useEffect, useRef, useState } from 'react'
import { type StyleProp, Text, type ViewStyle } from 'react-native'
import { CodeClipboardContext } from './code-clipboard.tsx'
import { Pressable } from './pressable.native.tsx'
import { splitTextStyle } from './text-style.native.ts'

export function CodeCopy({
  text,
  className,
  style,
}: {
  text: string
  className?: string
  style?: StyleProp<ViewStyle>
}) {
  const provider = useContext(CodeClipboardContext)
  const message = useHozoMessage()
  const announce = useAnnounce()
  const [copied, setCopied] = useState<string | null>(null)
  const serial = useRef(0)
  const current = useRef({ text, provider })
  current.current = { text, provider }
  // biome-ignore lint/correctness/useExhaustiveDependencies: changed content or connection retires pending copy feedback
  useEffect(() => {
    setCopied(null)
    return () => {
      serial.current++
    }
  }, [text, provider])
  if (!provider) return null
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={message('hozo.code.copy')}
      style={(state) =>
        splitTextStyle([hozoClasses(className, { ...state }), hozoAuthoredStyle(style)])[0]
      }
      onPress={async () => {
        const operation = ++serial.current
        const active = () =>
          operation === serial.current &&
          current.current.text === text &&
          current.current.provider === provider
        try {
          await provider.writeText(text)
          if (active()) {
            setCopied(text)
            announce(message('hozo.code.copied'))
          }
        } catch {
          if (active()) announce(message('hozo.code.copyFailed'))
        }
      }}
    >
      {(state) => (
        <Text style={splitTextStyle([hozoClasses(className, { ...state }), style])[1]}>
          {message(copied === text ? 'hozo.code.copied' : 'hozo.code.copy')}
        </Text>
      )}
    </Pressable>
  )
}
