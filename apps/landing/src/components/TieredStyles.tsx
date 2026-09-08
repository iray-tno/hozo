import { Heading, Paragraph, Section, Text, View } from '@hozo/core'

export function TieredStyles() {
  return (
    <Section
      nativeID="tiered-styles"
      className="py-24 border-t border-wood relative bg-gradient-to-b from-transparent via-yakisugi-950 to-transparent"
    >
      <View className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <View className="text-center max-w-3xl mx-auto mb-16 flex flex-col items-center">
          <Text className="text-xs font-bold uppercase tracking-widest text-hinoki mb-3 block">
            Style Engine
          </Text>
          <Heading
            level={2}
            className="text-3xl sm:text-5xl font-extrabold text-shikkui tracking-tight mb-4"
          >
            Tiered Style Resolution
          </Heading>
          <Paragraph className="text-shikkui-muted text-base sm:text-lg leading-relaxed">
            Even with dynamic class names, Hozo never compromises. From compile-time static
            extraction to structural boolean toggles and incremental candidate caching, three
            interlocking tiers eliminate runtime overhead.
          </Paragraph>
        </View>

        <View className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Tier 1 */}
          <View className="rounded-2xl timber-panel p-6 border-t-2 border-t-tatami-light border-x border-b border-wood flex flex-col justify-between">
            <View>
              <View className="flex items-center justify-between mb-4">
                <Text className="text-xs font-bold px-2.5 py-1 rounded bg-tatami-subtle text-tatami-light border border-tatami-subtle">
                  Tier 1 • Static
                </Text>
                <Text className="text-xs font-mono text-tatami-light font-semibold">
                  0ms Runtime
                </Text>
              </View>
              <Heading level={3} className="text-lg font-bold text-shikkui mb-2">
                Pure Elimination
              </Heading>
              <Paragraph className="text-stone-400 text-sm mb-6">
                Literal class names are extracted during build time. Emitted as genuine CSS classes
                on Web and precomputed StyleSheet objects on Native.
              </Paragraph>
              <div className="rounded-xl bg-yakisugi-950 border border-wood p-4 font-mono text-xs text-shikkui-muted mb-4 overflow-x-auto">
                <Text className="text-stone-500 block mb-1">{'// Input (Source)'}</Text>
                <Text className="text-shikkui block mb-3">
                  &lt;<Text className="text-hinoki">View</Text>{' '}
                  <Text className="text-hinoki-light">className</Text>=
                  <Text className="text-tatami-light">"p-4 bg-blue-500"</Text> /&gt;
                </Text>
                <Text className="text-stone-500 block mb-1">{'// Web Output (Pure HTML & scoped CSS)'}</Text>
                <Text className="text-tatami-light block">
                  &lt;<Text className="text-hinoki">div</Text>{' '}
                  <Text className="text-hinoki-light">className</Text>=
                  <Text className="text-tatami-light">"hozo-view hozo-0"</Text> /&gt;
                </Text>
              </div>
            </View>
            <View className="text-xs text-stone-400 border-t border-wood pt-4">
              &bull; Zero JavaScript runtime cost
              <br />
              &bull; Browser-native CSS cascade
            </View>
          </View>

          {/* Tier 2 */}
          <View className="rounded-2xl timber-panel p-6 border-t-2 border-t-hinoki border-x border-b border-wood flex flex-col justify-between">
            <View>
              <View className="flex items-center justify-between mb-4">
                <Text className="text-xs font-bold px-2.5 py-1 rounded bg-wood-subtle text-hinoki-light border border-wood">
                  Tier 2 • Structural
                </Text>
                <Text className="text-xs font-mono text-hinoki font-semibold">Boolean Toggle</Text>
              </View>
              <Heading level={3} className="text-lg font-bold text-shikkui mb-2">
                Precompiled Branching
              </Heading>
              <Paragraph className="text-stone-400 text-sm mb-6">
                Conditionals like{' '}
                <code className="text-shikkui-muted text-xs font-mono">cn(...)</code> are
                pre-compiled for both branches while preserving AST shape. At runtime, only a fast
                boolean toggle remains.
              </Paragraph>
              <div className="rounded-xl bg-yakisugi-950 border border-wood p-4 font-mono text-xs text-shikkui-muted mb-4 overflow-x-auto">
                <Text className="text-stone-500 block mb-1">{'// Input (Source)'}</Text>
                <Text className="text-shikkui block mb-3">
                  &lt;<Text className="text-hinoki">View</Text>{' '}
                  <Text className="text-hinoki-light">className</Text>=
                  {`={cn('p-4', active && 'bg-blue-500')}`} /&gt;
                </Text>
                <Text className="text-stone-500 block mb-1">{'// Web Output (Precompiled Branch)'}</Text>
                <Text className="text-hinoki block">
                  &lt;<Text className="text-hinoki">div</Text>{' '}
                  <Text className="text-hinoki-light">className</Text>=
                  {`={"hozo-view " + (active ? "hozo-1" : "hozo-0")}`} /&gt;
                </Text>
              </div>
            </View>
            <View className="text-xs text-stone-400 border-t border-wood pt-4">
              &bull; Precalculated CSS class names
              <br />
              &bull; Zero runtime style recalculation
            </View>
          </View>

          {/* Tier 3 */}
          <View className="rounded-2xl timber-panel p-6 border-t-2 border-t-bengara border-x border-b border-wood flex flex-col justify-between">
            <View>
              <View className="flex items-center justify-between mb-4">
                <Text className="text-xs font-bold px-2.5 py-1 rounded bg-bengara-subtle text-bengara-hover border border-bengara-subtle">
                  Tier 3 • Dynamic
                </Text>
                <Text className="text-xs font-mono text-bengara font-semibold">
                  Cached Fallback
                </Text>
              </View>
              <Heading level={3} className="text-lg font-bold text-shikkui mb-2">
                Whole-Project Cache
              </Heading>
              <Paragraph className="text-stone-400 text-sm mb-6">
                For props and unknown dynamic variables, Hozo analyzes candidate classes across the
                project and pre-generates them into a high-speed cached lookup.
              </Paragraph>
              <div className="rounded-xl bg-yakisugi-950 border border-wood p-4 font-mono text-xs text-shikkui-muted mb-4 overflow-x-auto">
                <Text className="text-stone-500 block mb-1">{'// Input (Source)'}</Text>
                <Text className="text-shikkui block mb-3">
                  &lt;<Text className="text-hinoki">View</Text>{' '}
                  <Text className="text-hinoki-light">className</Text>={`={props.className}`} /&gt;
                </Text>
                <Text className="text-stone-500 block mb-1">{'// Web Output (Cached Resolver)'}</Text>
                <Text className="text-bengara block">
                  &lt;<Text className="text-hinoki">div</Text>{' '}
                  <Text className="text-hinoki-light">className</Text>={`={hozoClasses(props.className)}`}{' '}
                  /&gt;
                </Text>
              </div>
            </View>
            <View className="text-xs text-stone-400 border-t border-wood pt-4">
              &bull; Incremental candidate caching
              <br />
              &bull; Zero missing CSS rules
            </View>
          </View>
        </View>
      </View>
    </Section>
  )
}
