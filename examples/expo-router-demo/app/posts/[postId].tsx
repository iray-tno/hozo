import { Text, View } from '@hozo/core'
import { useLocalSearchParams } from 'expo-router'

export default function Post() {
  const { postId } = useLocalSearchParams<{ postId: string }>()

  return (
    <View className="p-6">
      <Text>Post {postId}</Text>
    </View>
  )
}
