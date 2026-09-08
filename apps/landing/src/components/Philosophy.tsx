import { Heading, Paragraph, Section, Text, View } from '@hozo/core'

export function Philosophy() {
  return (
    <Section nativeID="philosophy" className="py-24 border-t border-wood relative bg-yakisugi-900">
      <View className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <View className="text-center max-w-3xl mx-auto mb-16 flex flex-col items-center">
          <Text className="text-xs font-bold uppercase tracking-widest text-hinoki mb-3 block">
            Core Principles
          </Text>
          <Heading
            level={2}
            className="text-3xl sm:text-5xl font-extrabold text-shikkui tracking-tight mb-4"
          >
            Performant by Design. Accessible by Structure.
          </Heading>
          <Paragraph className="text-shikkui-muted text-base sm:text-lg leading-relaxed">
            Cross-platform UI usually forces an unwanted compromise: heavy client-side wrappers on
            the Web, or inflexible WebViews on Mobile. Hozo eliminates unnecessary runtime
            wrappers—compiling standard React Native components directly into each platform's native
            primitives.
          </Paragraph>
        </View>

        <View className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-5xl mx-auto">
          {/* Pillar 1 */}
          <View className="p-8 rounded-2xl timber-panel relative overflow-hidden group hover:border-wood-strong transition-all border border-wood">
            <View className="w-12 h-12 rounded-xl bg-yakisugi-800 timber-grain timber-plank border border-wood-strong flex items-center justify-center text-hinoki font-bold text-base mb-6 group-hover:scale-105 transition-transform font-mono shadow-sm">
              01
            </View>
            <Heading level={3} className="text-xl font-bold text-shikkui mb-3">
              Existing Source First
            </Heading>
            <Paragraph className="text-stone-400 text-sm leading-relaxed mb-4">
              Write standard components imported from{' '}
              <code className="text-shikkui-muted text-xs font-mono">react-native</code> or{' '}
              <code className="text-shikkui-muted text-xs font-mono">@hozo/core</code>. No
              proprietary DSL, no framework rewrites. Adopt incrementally in existing production
              codebases without breaking a line of business logic.
            </Paragraph>
            <View className="p-3 rounded-lg bg-yakisugi-950 border border-wood text-xs text-shikkui-muted font-mono">
              <Text className="text-hinoki">import</Text> {'{ View, Text }'}{' '}
              <Text className="text-hinoki">from</Text>{' '}
              <Text className="text-tatami-light">'react-native'</Text>
            </View>
          </View>

          {/* Pillar 2 */}
          <View className="p-8 rounded-2xl timber-panel relative overflow-hidden group hover:border-wood-strong transition-all border border-wood">
            <View className="w-12 h-12 rounded-xl bg-yakisugi-800 timber-grain timber-plank border border-bengara-subtle flex items-center justify-center text-bengara font-bold text-base mb-6 group-hover:scale-105 transition-transform font-mono shadow-sm">
              02
            </View>
            <Heading level={3} className="text-xl font-bold text-shikkui mb-3">
              First-Class Accessibility
            </Heading>
            <Paragraph className="text-stone-400 text-sm leading-relaxed mb-4">
              ARIA is not an afterthought or runtime patch. Hozo treats W3C ARIA as a foundational
              grammar, validating roles and required attributes at build time via{' '}
              <code className="text-shikkui-muted text-xs font-mono">aria-query</code> before code
              ever reaches production.
            </Paragraph>
            <View className="p-3 rounded-lg bg-yakisugi-950 border border-wood text-xs text-shikkui-muted font-mono">
              Build-time W3C ARIA validation + Zero div-soup
            </View>
          </View>

          {/* Pillar 3 */}
          <View className="p-8 rounded-2xl timber-panel relative overflow-hidden group hover:border-wood-strong transition-all border border-wood">
            <View className="w-12 h-12 rounded-xl bg-yakisugi-800 timber-grain timber-plank border border-tatami-subtle flex items-center justify-center text-tatami-light font-bold text-base mb-6 group-hover:scale-105 transition-transform font-mono shadow-sm">
              03
            </View>
            <Heading level={3} className="text-xl font-bold text-shikkui mb-3">
              Zero-Runtime Static Paths
            </Heading>
            <Paragraph className="text-stone-400 text-sm leading-relaxed mb-4">
              All static styles compile to zero-runtime CSS classes on Web and precomputed
              StyleSheets on Native. Static utilities cost 0ms at runtime; finite dynamic branches
              are precompiled so runtime work is reduced to the remaining condition.
            </Paragraph>
            <View className="p-3 rounded-lg bg-yakisugi-950 border border-wood text-xs text-tatami-light font-mono">
              Static (0 JS) &rarr; Structural (Boolean fold) &rarr; Dynamic fallback
            </View>
          </View>

          {/* Pillar 4 */}
          <View className="p-8 rounded-2xl timber-panel relative overflow-hidden group hover:border-wood-strong transition-all border border-wood">
            <View className="w-12 h-12 rounded-xl bg-yakisugi-800 timber-grain timber-plank border border-wood-strong flex items-center justify-center text-hinoki-light font-bold text-base mb-6 group-hover:scale-105 transition-transform font-mono shadow-sm">
              04
            </View>
            <Heading level={3} className="text-xl font-bold text-shikkui mb-3">
              True Platform Primitives
            </Heading>
            <Paragraph className="text-stone-400 text-sm leading-relaxed mb-4">
              Semantic primitives from{' '}
              <code className="text-shikkui-muted text-xs font-mono">@hozo/core</code> lower
              cleanly:
              <code className="text-shikkui-muted text-xs font-mono"> Heading</code> becomes genuine{' '}
              <code className="text-shikkui-muted text-xs font-mono">&lt;h1&gt;-&lt;h6&gt;</code>,{' '}
              <code className="text-shikkui-muted text-xs font-mono">Section</code> becomes{' '}
              <code className="text-shikkui-muted text-xs font-mono">&lt;section&gt;</code>, and on
              Mobile they lower to native React Native primitives rendered by Fabric.
            </Paragraph>
            <View className="p-3 rounded-lg bg-yakisugi-950 border border-wood text-xs text-hinoki-light font-mono">
              <Text className="text-hinoki">import</Text> {'{ Heading, Section, Button }'}{' '}
              <Text className="text-hinoki">from</Text>{' '}
              <Text className="text-bengara">'@hozo/core'</Text>
            </View>
          </View>
        </View>
      </View>
    </Section>
  )
}
