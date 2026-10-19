import { Code, Heading, Paragraph, Section, Text, View } from '@hozo/core'
import { StaticCard } from './StaticCard.tsx'

export function TieredStyles() {
  return (
    <Section
      nativeID="performance"
      className="py-24 border-t border-hinoki/18 relative bg-gradient-to-b from-transparent via-yakisugi-950 to-transparent"
    >
      <View className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <View className="text-center max-w-3xl mx-auto mb-16 flex flex-col items-center">
          <Text className="text-xs font-bold uppercase tracking-widest text-hinoki mb-3 block">
            Performance
          </Text>
          <Heading
            level={2}
            className="text-3xl sm:text-5xl font-extrabold text-shikkui tracking-tight mb-4"
          >
            Tiered Style Resolution
          </Heading>
          <Paragraph className="text-shikkui-muted text-base sm:text-lg leading-relaxed">
            A dynamic class name is not all-or-nothing. Hozo compiles what it can read, compiles
            each branch of what it can partly read, and leaves a runtime lookup only for the rest.
            Only the third tier costs anything at runtime.
          </Paragraph>
        </View>

        <View className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Tier 1 */}
          <View className="rounded-2xl timber-panel p-6 border-t-2 border-t-tatami-light border-x border-b border-hinoki/18 flex flex-col justify-between">
            <View>
              <View className="flex flex-row items-center justify-between mb-4">
                <Text className="text-xs font-bold px-2.5 py-1 rounded bg-tatami/15 text-tatami-light border border-tatami/30">
                  Tier 1 • Static
                </Text>
                <Text className="text-xs font-mono text-tatami-light font-semibold">
                  No runtime work
                </Text>
              </View>
              <Heading level={3} className="text-lg font-bold text-shikkui mb-2">
                Pure Elimination
              </Heading>
              <Paragraph className="text-stone-400 text-sm mb-6">
                Literal class names are extracted during build time. Emitted as genuine CSS classes
                on Web and precomputed StyleSheet objects on Native.
              </Paragraph>
              <View className="rounded-xl bg-yakisugi-950 border border-hinoki/18 p-4 font-mono text-xs text-shikkui-muted mb-4 overflow-x-auto">
                <Text className="text-stone-500 block mb-1">{'// Input (Source)'}</Text>
                <Text className="text-shikkui block mb-3">
                  &lt;<Text className="text-hinoki">View</Text>{' '}
                  <Text className="text-hinoki-light">className</Text>=
                  <Text className="text-tatami-light">"p-4 bg-blue-500"</Text> /&gt;
                </Text>
                <Text className="text-stone-500 block mb-1">
                  {'// Web Output (Pure HTML & scoped CSS)'}
                </Text>
                <Text className="text-tatami-light block">
                  &lt;<Text className="text-hinoki">div</Text>{' '}
                  <Text className="text-hinoki-light">className</Text>=
                  <Text className="text-tatami-light">"hozo-view hozo-0"</Text> /&gt;
                </Text>
              </View>
            </View>
            <View className="text-xs text-stone-400 border-t border-hinoki/18 pt-4">
              <Text>&bull; Zero JavaScript runtime cost</Text>
              <Text>&bull; Browser-native CSS cascade</Text>
            </View>
          </View>

          {/* Tier 2 */}
          <View className="rounded-2xl timber-panel p-6 border-t-2 border-t-hinoki border-x border-b border-hinoki/18 flex flex-col justify-between">
            <View>
              <View className="flex flex-row items-center justify-between mb-4">
                <Text className="text-xs font-bold px-2.5 py-1 rounded bg-hinoki/10 text-hinoki-light border border-hinoki/18">
                  Tier 2 • Structural
                </Text>
                <Text className="text-xs font-mono text-hinoki font-semibold">Boolean Toggle</Text>
              </View>
              <Heading level={3} className="text-lg font-bold text-shikkui mb-2">
                Precompiled Branching
              </Heading>
              <Paragraph className="text-stone-400 text-sm mb-6">
                Conditionals like{' '}
                <Code className="text-shikkui-muted text-xs font-mono">cn(...)</Code> are
                pre-compiled for both branches while preserving AST shape. At runtime, only a fast
                boolean toggle remains.
              </Paragraph>
              <View className="rounded-xl bg-yakisugi-950 border border-hinoki/18 p-4 font-mono text-xs text-shikkui-muted mb-4 overflow-x-auto">
                <Text className="text-stone-500 block mb-1">{'// Input (Source)'}</Text>
                <Text className="text-shikkui block mb-3">
                  &lt;<Text className="text-hinoki">View</Text>{' '}
                  <Text className="text-hinoki-light">className</Text>=
                  {`={cn('p-4', active && 'bg-blue-500')}`} /&gt;
                </Text>
                <Text className="text-stone-500 block mb-1">
                  {'// Web Output (Precompiled Branch)'}
                </Text>
                <Text className="text-hinoki block">
                  &lt;<Text className="text-hinoki">div</Text>{' '}
                  <Text className="text-hinoki-light">className</Text>=
                  {`={"hozo-view " + (active ? "hozo-1" : "hozo-0")}`} /&gt;
                </Text>
              </View>
            </View>
            <View className="text-xs text-stone-400 border-t border-hinoki/18 pt-4">
              <Text>&bull; Precalculated CSS class names</Text>
              <Text>&bull; Zero runtime style recalculation</Text>
            </View>
          </View>

          {/* Tier 3 */}
          <View className="rounded-2xl timber-panel p-6 border-t-2 border-t-bengara border-x border-b border-hinoki/18 flex flex-col justify-between">
            <View>
              <View className="flex flex-row items-center justify-between mb-4">
                <Text className="text-xs font-bold px-2.5 py-1 rounded bg-bengara/12 text-bengara-hover border border-bengara/30">
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
                project and emits them ahead of time, so the runtime only looks them up.
              </Paragraph>
              <View className="rounded-xl bg-yakisugi-950 border border-hinoki/18 p-4 font-mono text-xs text-shikkui-muted mb-4 overflow-x-auto">
                <Text className="text-stone-500 block mb-1">{'// Input (Source)'}</Text>
                <Text className="text-shikkui block mb-3">
                  &lt;<Text className="text-hinoki">View</Text>{' '}
                  <Text className="text-hinoki-light">className</Text>={`={props.className}`} /&gt;
                </Text>
                <Text className="text-stone-500 block mb-1">
                  {'// Web Output (Cached Resolver)'}
                </Text>
                <Text className="text-bengara block">
                  &lt;<Text className="text-hinoki">div</Text>{' '}
                  <Text className="text-hinoki-light">className</Text>=
                  {`={hozoClasses(props.className)}`} /&gt;
                </Text>
              </View>
            </View>
            <View className="text-xs text-stone-400 border-t border-hinoki/18 pt-4">
              <Text>&bull; Incremental candidate caching</Text>
              <Text>&bull; Any class written in the project is defined</Text>
            </View>
          </View>
        </View>

        {/* The proof, on this page: rendered by Astro with no island. */}
        <View className="mt-12 max-w-3xl mx-auto">
          <StaticCard />
        </View>
      </View>
    </Section>
  )
}
