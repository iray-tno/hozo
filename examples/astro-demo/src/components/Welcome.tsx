import { Heading, Paragraph, View } from '@hozo/core'

// Static: rendered at build time with no `client:` directive, so the page
// gets its HTML and stylesheet and no JavaScript for it.
export function Welcome() {
  return (
    <View className="rounded-2xl bg-white p-8 shadow-xl">
      <Heading level={1} className="text-3xl font-bold text-brand">
        Hozo + Astro
      </Heading>
      <Paragraph className="mt-3 text-slate-600">
        Primitives compiled to semantic HTML at build time.
      </Paragraph>
    </View>
  )
}
