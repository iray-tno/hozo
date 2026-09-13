import { Button, Heading, Link, Text, View } from '@hozo/core'
import { createExpoRouterNavigationPrimitives } from '@hozo/navigation/expo-router/typed'
import { Link as ExpoLink, type Href } from 'expo-router'

const Typed = createExpoRouterNavigationPrimitives<Href>(ExpoLink.resolveHref)

export default function Home() {
  return (
    <View className="flex-1 items-center justify-center gap-4 bg-white p-8">
      <Heading level={1} className="text-2xl font-bold text-slate-950">
        Hozo + Expo Router
      </Heading>
      <Text className="text-slate-600">
        This page was exported through Expo's real Metro stack.
      </Text>
      <Link href="/details">Open details</Link>
      <Button href="/details" replace prefetch>
        Replace with details
      </Button>
      <Typed.Link href={{ pathname: '/posts/[postId]', params: { postId: '42' } }}>
        Open typed post
      </Typed.Link>
    </View>
  )
}
