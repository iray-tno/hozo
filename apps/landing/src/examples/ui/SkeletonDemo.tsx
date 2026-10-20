import { Text, View } from '@hozo/core'
import { Button, Skeleton } from '@hozo/ui'
import { useState } from 'react'

export function SkeletonDemo() {
  const [loaded, setLoaded] = useState(false)
  return (
    <View className="gap-4">
      {loaded ? (
        <View className="flex-row items-center gap-3">
          <View className="size-10 rounded-full bg-hozo-accent" />
          <Text className="text-sm text-hozo-text">Ada Lovelace replied to your comment.</Text>
        </View>
      ) : (
        <View className="flex-row items-center gap-3">
          <Skeleton className="size-10 rounded-full" />
          <Skeleton className="h-4 w-64" />
        </View>
      )}
      <View className="flex-row">
        <Button size="sm" onPress={() => setLoaded((done) => !done)}>
          {loaded ? 'Show the placeholder' : 'Finish loading'}
        </Button>
      </View>
    </View>
  )
}
