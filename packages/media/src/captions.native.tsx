import { Text, View } from 'react-native'
import type { MediaCaptionsProps } from './caption-types.ts'
import { useCaption } from './use-caption.ts'

export function MediaCaptions(props: MediaCaptionsProps) {
  const text = useCaption(props)
  if (!text) return null
  return (
    <View
      accessible
      accessibilityLabel={`${props.accessibilityLabel}: ${text}`}
      style={{ backgroundColor: '#0f172b', padding: 12, borderRadius: 4 }}
    >
      <Text style={{ color: '#ffffff', fontSize: 16, lineHeight: 24 }}>{text}</Text>
    </View>
  )
}
