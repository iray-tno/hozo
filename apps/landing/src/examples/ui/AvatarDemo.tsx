import { View } from '@hozo/core'
import { Avatar } from '@hozo/ui'

export function AvatarDemo() {
  return (
    <View className="flex-row flex-wrap items-center gap-4">
      <Avatar name="Ada Lovelace" status="online" size="lg" />
      <Avatar name="Grace Hopper" status="busy" />
      <Avatar name="Alan Turing" status="offline" />
      <Avatar name="田中太郎" size="sm" />
    </View>
  )
}
