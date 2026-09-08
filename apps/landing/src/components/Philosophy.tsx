import { Heading, Paragraph, Section, Text, View } from '@hozo/core'

export function Philosophy() {
  return (
    <Section nativeID="philosophy" className="py-24 border-t border-wood relative bg-yakisugi-900">
      <View className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <View className="text-center max-w-3xl mx-auto mb-16 flex flex-col items-center">
          <Text className="text-xs font-bold uppercase tracking-widest text-hinoki mb-3 block">
            Core Philosophy
          </Text>
          <Heading
            level={2}
            className="text-3xl sm:text-5xl font-extrabold text-shikkui tracking-tight mb-4"
          >
            The Structural Aesthetics of Joinery
          </Heading>
          <Paragraph className="text-shikkui-muted text-base sm:text-lg leading-relaxed">
            Japanese mortise-and-tenon joinery (hozo-tsugi) connects timber with millimeter
            precision without nails or glue. Hozo brings this philosophy to software: uniting React
            Native, the Semantic Web, Tailwind CSS, and rigorous accessibility while stripping away
            unnecessary runtime glue.
          </Paragraph>
        </View>

        <View className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-5xl mx-auto">
          {/* Pillar 1 */}
          <View className="p-8 rounded-2xl timber-panel relative overflow-hidden group hover:border-wood-strong transition-all border border-wood">
            <View className="w-12 h-12 rounded-xl bg-wood-subtle border border-wood flex items-center justify-center text-hinoki font-bold text-base mb-6 group-hover:scale-105 transition-transform font-mono">
              01
            </View>
            <Heading level={3} className="text-xl font-bold text-shikkui mb-3">
              Existing Source First
            </Heading>
            <Paragraph className="text-stone-400 text-sm leading-relaxed mb-4">
              No proprietary syntax or rewrites required. Hozo parses and compiles existing
              components imported from{' '}
              <code className="text-shikkui-muted text-xs font-mono">react-native</code> directly.
              Adopt incrementally without breaking production codebases.
            </Paragraph>
            <View className="p-3 rounded-lg bg-yakisugi-950 border border-wood text-xs text-shikkui-muted font-mono">
              <Text className="text-hinoki">import</Text> {'{ View, Text }'}{' '}
              <Text className="text-hinoki">from</Text>{' '}
              <Text className="text-tatami-light">'react-native'</Text>
            </View>
          </View>

          {/* Pillar 2 */}
          <View className="p-8 rounded-2xl timber-panel relative overflow-hidden group hover:border-wood-strong transition-all border border-wood">
            <View className="w-12 h-12 rounded-xl bg-bengara-subtle border border-bengara-subtle flex items-center justify-center text-bengara font-bold text-base mb-6 group-hover:scale-105 transition-transform font-mono">
              02
            </View>
            <Heading level={3} className="text-xl font-bold text-shikkui mb-3">
              Golden Path for New Projects
            </Heading>
            <Paragraph className="text-stone-400 text-sm leading-relaxed mb-4">
              Standard semantic primitives from{' '}
              <code className="text-shikkui-muted text-xs font-mono">@hozo/core</code> (
              <code className="text-shikkui-muted text-xs font-mono">Heading</code>,{' '}
              <code className="text-shikkui-muted text-xs font-mono">Paragraph</code>,{' '}
              <code className="text-shikkui-muted text-xs font-mono">Section</code>,{' '}
              <code className="text-shikkui-muted text-xs font-mono">Button</code>) produce the
              fastest, most accessible structure from day one.
            </Paragraph>
            <View className="p-3 rounded-lg bg-yakisugi-950 border border-wood text-xs text-shikkui-muted font-mono">
              <Text className="text-hinoki">import</Text> {'{ Heading, Button }'}{' '}
              <Text className="text-hinoki">from</Text>{' '}
              <Text className="text-bengara">'@hozo/core'</Text>
            </View>
          </View>

          {/* Pillar 3 */}
          <View className="p-8 rounded-2xl timber-panel relative overflow-hidden group hover:border-wood-strong transition-all border border-wood">
            <View className="w-12 h-12 rounded-xl bg-tatami-subtle border border-tatami-subtle flex items-center justify-center text-tatami-light font-bold text-base mb-6 group-hover:scale-105 transition-transform font-mono">
              03
            </View>
            <Heading level={3} className="text-xl font-bold text-shikkui mb-3">
              Compile What You Can
            </Heading>
            <Paragraph className="text-stone-400 text-sm leading-relaxed mb-4">
              Every static style is pre-compiled into real CSS classes or native StyleSheets with
              zero runtime cost. Conditionals fold into booleans; only truly dynamic expressions
              fall back to a cached runtime.
            </Paragraph>
            <View className="p-3 rounded-lg bg-yakisugi-950 border border-wood text-xs text-tatami-light font-mono">
              Static (0ms) &rarr; Structural (Boolean fold) &rarr; Dynamic fallback
            </View>
          </View>

          {/* Pillar 4 */}
          <View className="p-8 rounded-2xl timber-panel relative overflow-hidden group hover:border-wood-strong transition-all border border-wood">
            <View className="w-12 h-12 rounded-xl bg-wood-subtle border border-wood flex items-center justify-center text-hinoki-light font-bold text-base mb-6 group-hover:scale-105 transition-transform font-mono">
              04
            </View>
            <Heading level={3} className="text-xl font-bold text-shikkui mb-3">
              Accessibility by Structure
            </Heading>
            <Paragraph className="text-stone-400 text-sm leading-relaxed mb-4">
              ARIA is treated as a first-class grammar. Build-time checks validate roles and
              required attributes via{' '}
              <code className="text-shikkui-muted text-xs font-mono">aria-query</code>, while{' '}
              <code className="text-shikkui-muted text-xs font-mono">@hozo/behaviors</code>{' '}
              guarantees focus traps and roving tabindex.
            </Paragraph>
            <View className="p-3 rounded-lg bg-yakisugi-950 border border-wood text-xs text-hinoki-light font-mono">
              Build-time W3C ARIA diagnostics + Native behavior layer
            </View>
          </View>
        </View>
      </View>
    </Section>
  )
}
