import { Code, Heading, Paragraph, Preformatted, Section, Text, View } from '@hozo/core'

export function CodeShowcase() {
  return (
    <Section
      nativeID="code-showcase"
      className="py-24 border-t border-hinoki/18 relative bg-yakisugi-950"
    >
      <View className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 w-full min-w-0">
        <View className="text-center max-w-3xl mx-auto mb-16 flex flex-col items-center">
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

        {/* Code Comparison Box */}
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
            <Preformatted className="font-mono text-xs sm:text-sm text-shikkui-muted overflow-x-auto leading-relaxed max-w-full">
              <Code>
                <Text className="text-hinoki">import</Text> {'{ '}
                <Text className="text-shikkui">View</Text>,{' '}
                <Text className="text-shikkui">Heading</Text>,{' '}
                <Text className="text-shikkui">Paragraph</Text>,{' '}
                <Text className="text-shikkui">Button</Text>
                {' }'} <Text className="text-hinoki">from</Text>{' '}
                <Text className="text-tatami-light">'@hozo/core'</Text>
                {'\n\n'}
                <Text className="text-hinoki">export function</Text>{' '}
                <Text className="text-hinoki-light">NotificationCard</Text>
                {'({ '}
                <Text className="text-shikkui-muted">title</Text>,{' '}
                <Text className="text-shikkui-muted">message</Text>,{' '}
                <Text className="text-shikkui-muted">onDismiss</Text>
                {' }) {\n'}
                {'  '}
                <Text className="text-hinoki">return</Text> ({'\n'}
                {'    '}&lt;<Text className="text-shikkui">View</Text>{' '}
                <Text className="text-stone-400">role</Text>=
                <Text className="text-tatami-light">"alert"</Text>{' '}
                <Text className="text-stone-400">className</Text>=
                <Text className="text-tatami-light">
                  "p-6 rounded-2xl bg-yakisugi-800 border border-hinoki/20"
                </Text>
                &gt;{'\n'}
                {'      '}&lt;<Text className="text-shikkui">Heading</Text>{' '}
                <Text className="text-stone-400">level</Text>={'{'}
                <Text className="text-bengara">2</Text>
                {'}'} <Text className="text-stone-400">className</Text>=
                <Text className="text-tatami-light">"text-xl font-bold text-shikkui mb-2"</Text>
                &gt;{'{title}'}&lt;/<Text className="text-shikkui">Heading</Text>&gt;{'\n'}
                {'      '}&lt;<Text className="text-shikkui">Paragraph</Text>{' '}
                <Text className="text-stone-400">className</Text>=
                <Text className="text-tatami-light">"text-stone-400 text-sm mb-4"</Text>
                &gt;{'{message}'}&lt;/<Text className="text-shikkui">Paragraph</Text>&gt;{'\n'}
                {'      '}&lt;<Text className="text-shikkui">Button</Text>{' '}
                <Text className="text-stone-400">onPress</Text>={'{onDismiss}'}{' '}
                <Text className="text-stone-400">className</Text>=
                <Text className="text-tatami-light">
                  "bg-bengara px-4 py-2 rounded-lg text-shikkui font-medium"
                </Text>
                &gt;{'\n'}
                {'        '}Dismiss{'\n'}
                {'      '}&lt;/<Text className="text-shikkui">Button</Text>&gt;{'\n'}
                {'    '}&lt;/<Text className="text-shikkui">View</Text>&gt;{'\n'}
                {'  '}){'\n'}
                {'}'}
              </Code>
            </Preformatted>
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
              <Preformatted className="font-mono text-xs text-shikkui-muted overflow-x-auto leading-relaxed max-w-full">
                <Code>
                  <Text className="text-stone-500">
                    {'// Real compiler output: semantic DOM & scoped atomic CSS\n'}
                  </Text>
                  <Text className="text-hinoki">export function</Text>{' '}
                  <Text className="text-hinoki-light">NotificationCard</Text>
                  {'({ '}
                  <Text className="text-shikkui-muted">title</Text>,{' '}
                  <Text className="text-shikkui-muted">message</Text>,{' '}
                  <Text className="text-shikkui-muted">onDismiss</Text>
                  {' }) {\n'}
                  {'  '}
                  <Text className="text-hinoki">return</Text> ({'\n'}
                  {'    '}&lt;<Text className="text-tatami-light">div</Text>{' '}
                  <Text className="text-hinoki-light">className</Text>=
                  <Text className="text-tatami-light">"hozo-view hozo-0"</Text>{' '}
                  <Text className="text-hinoki-light">role</Text>=
                  <Text className="text-tatami-light">"alert"</Text>&gt;{'\n'}
                  {'      '}&lt;<Text className="text-tatami-light">h2</Text>{' '}
                  <Text className="text-hinoki-light">className</Text>=
                  <Text className="text-tatami-light">"hozo-1"</Text>&gt;{'{title}'}&lt;/
                  <Text className="text-tatami-light">h2</Text>&gt;{'\n'}
                  {'      '}&lt;<Text className="text-tatami-light">p</Text>{' '}
                  <Text className="text-hinoki-light">className</Text>=
                  <Text className="text-tatami-light">"hozo-2"</Text>&gt;{'{message}'}&lt;/
                  <Text className="text-tatami-light">p</Text>&gt;{'\n'}
                  {'      '}&lt;<Text className="text-tatami-light">button</Text>{' '}
                  <Text className="text-hinoki-light">className</Text>=
                  <Text className="text-tatami-light">"hozo-3"</Text>{' '}
                  <Text className="text-hinoki-light">type</Text>=
                  <Text className="text-tatami-light">"button"</Text>{' '}
                  <Text className="text-hinoki-light">onClick</Text>={'{onDismiss}'}&gt;{'\n'}
                  {'        '}Dismiss{'\n'}
                  {'      '}&lt;/<Text className="text-tatami-light">button</Text>&gt;{'\n'}
                  {'    '}&lt;/<Text className="text-tatami-light">div</Text>&gt;{'\n'}
                  {'  '}){'\n'}
                  {'}'}
                </Code>
              </Preformatted>
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
              <Preformatted className="font-mono text-xs text-shikkui-muted overflow-x-auto leading-relaxed max-w-full">
                <Code>
                  <Text className="text-stone-500">
                    {'// Real compiler output: StyleSheet & native primitives\n'}
                  </Text>
                  <Text className="text-hinoki">export function</Text>{' '}
                  <Text className="text-hinoki-light">NotificationCard</Text>
                  {'({ '}
                  <Text className="text-shikkui-muted">title</Text>,{' '}
                  <Text className="text-shikkui-muted">message</Text>,{' '}
                  <Text className="text-shikkui-muted">onDismiss</Text>
                  {' }) {\n'}
                  {'  '}
                  <Text className="text-hinoki">return</Text> ({'\n'}
                  {'    '}&lt;<Text className="text-shikkui">View</Text>{' '}
                  <Text className="text-stone-400">style</Text>={'{hozoStyles.hozo0}'}{' '}
                  <Text className="text-stone-400">role</Text>=
                  <Text className="text-tatami-light">"alert"</Text>&gt;{'\n'}
                  {'      '}&lt;<Text className="text-shikkui">Text</Text>{' '}
                  <Text className="text-stone-400">style</Text>={'{hozoStyles.hozo1}'}{' '}
                  <Text className="text-stone-400">accessibilityRole</Text>=
                  <Text className="text-tatami-light">"header"</Text>&gt;{'{title}'}&lt;/
                  <Text className="text-shikkui">Text</Text>&gt;{'\n'}
                  {'      '}&lt;<Text className="text-shikkui">Text</Text>{' '}
                  <Text className="text-stone-400">style</Text>={'{hozoStyles.hozo2}'}&gt;
                  {'{message}'}&lt;/<Text className="text-shikkui">Text</Text>&gt;{'\n'}
                  {'      '}&lt;<Text className="text-shikkui">Pressable</Text>{' '}
                  <Text className="text-stone-400">style</Text>={'{hozoStyles.hozo3}'}{' '}
                  <Text className="text-stone-400">accessibilityRole</Text>=
                  <Text className="text-tatami-light">"button"</Text>{' '}
                  <Text className="text-stone-400">onPress</Text>={'{onDismiss}'}&gt;{'\n'}
                  {'        '}&lt;<Text className="text-shikkui">Text</Text>{' '}
                  <Text className="text-stone-400">style</Text>={'{hozoStyles.hozo3_text}'}
                  &gt;Dismiss&lt;/
                  <Text className="text-shikkui">Text</Text>&gt;{'\n'}
                  {'      '}&lt;/<Text className="text-shikkui">Pressable</Text>&gt;{'\n'}
                  {'    '}&lt;/<Text className="text-shikkui">View</Text>&gt;{'\n'}
                  {'  '}){'\n'}
                  {'}'}
                </Code>
              </Preformatted>
            </View>
          </View>
        </View>
      </View>
    </Section>
  )
}
