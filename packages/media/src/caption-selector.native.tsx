import { Pressable, Text, View } from 'react-native'
import { captionSelection, type MediaCaptionSelectorProps } from './caption-selection.ts'

export function MediaCaptionSelector(props: MediaCaptionSelectorProps) {
  const selection = captionSelection(props)
  return (
    // Keep each radio reachable instead of combining the entire selector.
    <View accessible={false} accessibilityRole="radiogroup" style={{ gap: 8 }}>
      <Text
        accessibilityRole="header"
        style={{ fontSize: 16, fontWeight: '600', color: '#0f172a' }}
      >
        {selection.name}
      </Text>
      <View accessible={false} style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {selection.choices.map((choice) => (
          <Pressable
            key={choice.key}
            accessible
            accessibilityRole="radio"
            accessibilityLabel={`${selection.name}: ${choice.label}`}
            accessibilityState={{ checked: choice.checked, disabled: choice.disabled }}
            disabled={choice.disabled}
            onPress={choice.activate}
            style={{ minHeight: 44, padding: 12, opacity: choice.disabled ? 0.5 : 1 }}
          >
            <Text style={{ color: '#0f172a', fontSize: 16 }}>
              {choice.checked ? '◉' : '○'} {choice.label}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  )
}
