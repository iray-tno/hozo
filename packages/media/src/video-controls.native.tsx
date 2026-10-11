import { Pressable, Text, View } from 'react-native'
import type { VideoControlsProps } from './control-types.ts'
import { useVideoControls } from './use-video-controls.ts'

export function VideoControls(props: VideoControlsProps) {
  const controls = useVideoControls(props)
  return (
    // Do not combine the descendant controls into one inaccessible group node.
    <View accessible={false} style={{ gap: 8 }}>
      <Text
        accessibilityRole="header"
        style={{ fontSize: 16, fontWeight: '600', color: '#0f172a' }}
      >
        {controls.name}
      </Text>
      <View accessible={false} style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {[controls.toggle, controls.backward, controls.forward].map((control) => (
          <Pressable
            key={control.key}
            accessibilityRole="button"
            accessibilityLabel={control.label}
            accessibilityState={{ disabled: control.disabled }}
            disabled={control.disabled}
            onPress={control.activate}
            style={{
              minHeight: 44,
              padding: 12,
              borderRadius: 4,
              backgroundColor: '#e2e8f0',
              opacity: control.disabled ? 0.5 : 1,
            }}
          >
            <Text style={{ color: '#0f172a', fontSize: 16 }}>{control.label}</Text>
          </Pressable>
        ))}
      </View>
      <Text style={{ color: '#0f172a', fontSize: 16 }}>{controls.position}</Text>
      {controls.error && (
        <Text accessibilityLiveRegion="polite" style={{ color: '#b91c1c', fontSize: 16 }}>
          {controls.error}
        </Text>
      )}
    </View>
  )
}
