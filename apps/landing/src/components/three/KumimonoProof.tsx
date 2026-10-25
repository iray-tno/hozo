import { Heading, Paragraph, Text, View } from '@hozo/core'
import { Kumimono } from '../Kumimono.tsx'

// The /three/ page, in Hozo primitives. The Kumimono frame is its own island
// because the demo inside it is interactive; Astro hydrates a component, not a
// child of one rendered on the server. Its module is separate as well, so the
// browser does not load the page's static examples.

export function KumimonoProof({ baseUrl = '' }: { baseUrl?: string }) {
  return (
    <View className="mb-20 rounded-2xl border border-hinoki/18 bg-yakisugi-900/60 p-4 sm:p-8 backdrop-blur-sm shadow-xl">
      <View className="mb-6 border-b border-hinoki/10 pb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <View className="shrink">
          <Heading level={2} className="text-xl sm:text-2xl font-bold text-shikkui">
            Interactive Proof: Kumimono (組物)
          </Heading>
          <Paragraph className="text-xs sm:text-sm text-stone-400 mt-1">
            Live WebGL rendering of a traditional Japanese timber joinery bracket system using
            portable bounded shaders.
          </Paragraph>
        </View>
        <View className="flex flex-row items-center gap-2 text-xs font-mono text-hinoki">
          <View className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <Text>Zero idle frame draw</Text>
        </View>
      </View>
      <Kumimono baseUrl={baseUrl} />
    </View>
  )
}
