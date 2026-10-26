import { Pressable, Text, View } from '@hozo/core'

export function Chip({
  label,
  selected,
  onPress,
  className,
}: {
  label: string
  selected: boolean
  onPress: () => void
  className?: string
}) {
  return (
    <View className={className}>
      <Pressable
        onPress={onPress}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: selected }}
        className={
          selected
            ? 'px-4 py-2 rounded-full bg-emerald-700'
            : 'px-4 py-2 rounded-full border border-stone-500'
        }
      >
        <Text className="text-sm font-semibold text-stone-100 md:text-base">{label}</Text>
      </Pressable>
    </View>
  )
}
