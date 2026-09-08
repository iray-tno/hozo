import { Link, Paragraph, View } from '@hozo/core'

export default function Details() {
  return (
    <View className="flex-1 gap-4 bg-slate-50 p-8">
      <Paragraph className="text-slate-900">Expo Router accepted navigation from Hozo.</Paragraph>
      <Link href="/">Return home</Link>
    </View>
  )
}
