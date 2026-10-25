import { Heading, Paragraph, Section, Text, View } from '@hozo/core'
import { CodeBlock } from '@hozo/patterns'
import type { CodeShowcaseSamples } from '../lib/code-showcase.ts'

export function CodeShowcase({ samples }: { samples: CodeShowcaseSamples }) {
  return (
    <Section
      nativeID="code-showcase"
      className="py-20 border-t border-hinoki/18 relative bg-yakisugi-950"
    >
      <View className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 w-full min-w-0">
        <View className="text-center max-w-3xl mx-auto mb-10 flex flex-col items-center">
          <Text className="text-xs font-bold uppercase tracking-widest text-hinoki mb-3 block">
            Side-by-Side Lowering
          </Text>
          <Heading
            level={2}
            className="text-3xl sm:text-5xl font-extrabold text-shikkui tracking-tight mb-4"
          >
            One Source, Two True Primitives
          </Heading>
          <Paragraph className="text-shikkui-muted text-base sm:text-lg leading-relaxed">
            From a single universal component, Hozo lowers directly to genuine Semantic HTML and CSS
            on the Web, and native React Native primitives and StyleSheet on Mobile.
          </Paragraph>
        </View>

        {/* Source comparison box */}
        <View className="rounded-2xl border border-hinoki/18 bg-yakisugi-950 overflow-hidden shadow-2xl max-w-6xl mx-auto w-full min-w-0">
          {/* Top Bar: Source Input (Architectural Wooden Lintel / Nageshi) */}
          <View className="border-b border-hinoki/18 p-4 sm:p-6 bg-yakisugi-900 timber-grain timber-plank min-w-0">
            <View className="flex flex-row flex-wrap items-center justify-between gap-2 mb-3">
              <View className="flex flex-row items-center gap-2 min-w-0">
                <View className="w-3 h-3 rounded-full bg-bengara shrink-0" />
                <View className="w-3 h-3 rounded-full bg-hinoki shrink-0" />
                <View className="w-3 h-3 rounded-full bg-tatami-light shrink-0" />
                <Text className="text-xs font-mono text-stone-400 ml-2 truncate">
                  Universal Source: NotificationCard.tsx
                </Text>
              </View>
              <Text className="text-xs px-2.5 py-0.5 rounded bg-hinoki/10 text-hinoki border border-hinoki/35 font-mono shrink-0">
                React Native / @hozo/core
              </Text>
            </View>
            <CodeBlock
              lines={samples.source.lines}
              title="Universal Source: NotificationCard.tsx"
              wrap
              captionClassName="sr-only"
              className="text-xs sm:text-sm text-shikkui-muted min-w-0"
              lineStyle={{
                fontFamily: '"JetBrains Mono", ui-monospace, monospace',
                lineHeight: 1.625,
              }}
            />
          </View>

          {/* Split Bottom: Web vs Native Output */}
          <View className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-stone-800 min-w-0">
            {/* Left: Web Output */}
            <View className="p-4 sm:p-6 bg-yakisugi-950 min-w-0">
              <View className="flex flex-row flex-wrap items-center justify-between gap-2 mb-3">
                <View className="text-xs font-semibold text-hinoki flex flex-row items-center gap-1.5 min-w-0">
                  <svg
                    className="w-4 h-4 shrink-0"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    aria-hidden="true"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9"
                    />
                  </svg>
                  <Text className="truncate">Web Lowering (DOM + CSS + W3C ARIA)</Text>
                </View>
                <Text className="text-[10px] font-mono px-2 py-0.5 rounded bg-hinoki/10 text-hinoki-light border border-hinoki/18 shrink-0">
                  No RNW Wrapper
                </Text>
              </View>
              <CodeBlock
                lines={samples.web.lines}
                title="Web Lowering (DOM + CSS + W3C ARIA)"
                wrap
                captionClassName="sr-only"
                className="text-xs text-shikkui-muted min-w-0"
                lineStyle={{
                  fontFamily: '"JetBrains Mono", ui-monospace, monospace',
                  lineHeight: 1.625,
                }}
              />
            </View>

            {/* Right: Native Output */}
            <View className="p-4 sm:p-6 bg-yakisugi-950 min-w-0">
              <View className="flex flex-row flex-wrap items-center justify-between gap-2 mb-3">
                <View className="text-xs font-semibold text-tatami-light flex flex-row items-center gap-1.5 min-w-0">
                  <svg
                    className="w-4 h-4 shrink-0"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    aria-hidden="true"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z"
                    />
                  </svg>
                  <Text className="truncate">Native Lowering (Fabric / StyleSheet)</Text>
                </View>
                <Text className="text-[10px] font-mono px-2 py-0.5 rounded bg-tatami/15 text-tatami-light border border-tatami/30 shrink-0">
                  React Native / Fabric
                </Text>
              </View>
              <CodeBlock
                lines={samples.native.lines}
                title="Native Lowering (Fabric / StyleSheet)"
                wrap
                captionClassName="sr-only"
                className="text-xs text-shikkui-muted min-w-0"
                lineStyle={{
                  fontFamily: '"JetBrains Mono", ui-monospace, monospace',
                  lineHeight: 1.625,
                }}
              />
            </View>
          </View>
        </View>
      </View>
    </Section>
  )
}
