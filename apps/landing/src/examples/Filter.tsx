import { cx, Text, View } from '@hozo/core'

export function Filter({ label, active }: { label: string; active: boolean }) {
  return (
    <View className={cx('rounded-full px-3 py-1', active ? 'bg-blue-600' : 'bg-gray-200')}>
      <Text className={cx('text-sm font-medium', active && 'text-white')}>{label}</Text>
    </View>
  )
}
