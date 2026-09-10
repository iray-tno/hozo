import { Heading, Paragraph, Section, Text, View } from '@hozo/core'

export function CodeShowcase() {
  return (
    <Section
      nativeID="code-showcase"
      className="py-24 border-t border-wood relative bg-yakisugi-950"
    >
      <View className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
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
        <View className="rounded-2xl border border-wood bg-yakisugi-950 overflow-hidden shadow-2xl max-w-6xl mx-auto">
          {/* Top Bar: Source Input (Architectural Wooden Lintel / Nageshi) */}
          <View className="border-b border-wood p-4 sm:p-6 bg-yakisugi-900 timber-grain timber-plank">
            <View className="flex flex-row items-center justify-between mb-3">
              <View className="flex flex-row items-center gap-2">
                <View className="w-3 h-3 rounded-full bg-bengara" />
                <View className="w-3 h-3 rounded-full bg-hinoki" />
                <View className="w-3 h-3 rounded-full bg-tatami-light" />
                <Text className="text-xs font-mono text-stone-400 ml-2">
                  Universal Source: NotificationCard.tsx
                </Text>
              </View>
              <Text className="text-xs px-2.5 py-0.5 rounded bg-wood-subtle text-hinoki border border-wood-strong font-mono">
                React Native / @hozo/core
              </Text>
            </View>
            <pre className="font-mono text-xs sm:text-sm text-shikkui-muted overflow-x-auto leading-relaxed">
              <code>
                <span className="text-hinoki">import</span> {'{ '}
                <span className="text-shikkui">View</span>,{' '}
                <span className="text-shikkui">Heading</span>,{' '}
                <span className="text-shikkui">Paragraph</span>,{' '}
                <span className="text-shikkui">Button</span>
                {' }'} <span className="text-hinoki">from</span>{' '}
                <span className="text-tatami-light">'@hozo/core'</span>
                {'\n\n'}
                <span className="text-hinoki">export function</span>{' '}
                <span className="text-hinoki-light">NotificationCard</span>
                {'({ '}
                <span className="text-shikkui-muted">title</span>,{' '}
                <span className="text-shikkui-muted">message</span>,{' '}
                <span className="text-shikkui-muted">onDismiss</span>
                {' }) {\n'}
                {'  '}
                <span className="text-hinoki">return</span> (\n
                {'    '}&lt;<span className="text-shikkui">View</span>{' '}
                <span className="text-stone-400">role</span>=
                <span className="text-tatami-light">"alert"</span>{' '}
                <span className="text-stone-400">className</span>=
                <span className="text-tatami-light">
                  "p-6 rounded-2xl bg-yakisugi-800 border border-hinoki/20"
                </span>
                &gt;\n
                {'      '}&lt;<span className="text-shikkui">Heading</span>{' '}
                <span className="text-stone-400">level</span>={'{'}
                <span className="text-bengara">2</span>
                {'}'} <span className="text-stone-400">className</span>=
                <span className="text-tatami-light">"text-xl font-bold text-shikkui mb-2"</span>
                &gt;{'{title}'}&lt;/<span className="text-shikkui">Heading</span>&gt;\n
                {'      '}&lt;<span className="text-shikkui">Paragraph</span>{' '}
                <span className="text-stone-400">className</span>=
                <span className="text-tatami-light">"text-stone-400 text-sm mb-4"</span>
                &gt;{'{message}'}&lt;/<span className="text-shikkui">Paragraph</span>&gt;\n
                {'      '}&lt;<span className="text-shikkui">Button</span>{' '}
                <span className="text-stone-400">onPress</span>={'{onDismiss}'}{' '}
                <span className="text-stone-400">className</span>=
                <span className="text-tatami-light">
                  "bg-bengara px-4 py-2 rounded-lg text-shikkui font-medium"
                </span>
                &gt;\n
                {'        '}Dismiss\n
                {'      '}&lt;/<span className="text-shikkui">Button</span>&gt;\n
                {'    '}&lt;/<span className="text-shikkui">View</span>&gt;\n
                {'  '})\n
                {'}'}
              </code>
            </pre>
          </View>

          {/* Split Bottom: Web vs Native Output */}
          <View className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-stone-800">
            {/* Left: Web Output */}
            <View className="p-4 sm:p-6 bg-yakisugi-950">
              <View className="flex flex-row items-center justify-between mb-3">
                <View className="text-xs font-semibold text-hinoki flex flex-row items-center gap-1.5">
                  <svg
                    className="w-4 h-4"
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
                  <Text>Web Lowering (DOM + CSS + W3C ARIA)</Text>
                </View>
                <Text className="text-[10px] font-mono px-2 py-0.5 rounded bg-wood-subtle text-hinoki-light border border-wood">
                  No RNW Wrapper
                </Text>
              </View>
              <pre className="font-mono text-xs text-shikkui-muted overflow-x-auto leading-relaxed">
                <code>
                  <span className="text-stone-500">
                    {'// Real compiler output: semantic DOM & scoped atomic CSS\n'}
                  </span>
                  <span className="text-hinoki">export function</span>{' '}
                  <span className="text-hinoki-light">NotificationCard</span>
                  {'({ '}
                  <span className="text-shikkui-muted">title</span>,{' '}
                  <span className="text-shikkui-muted">message</span>,{' '}
                  <span className="text-shikkui-muted">onDismiss</span>
                  {' }) {\n'}
                  {'  '}
                  <span className="text-hinoki">return</span> (\n
                  {'    '}&lt;<span className="text-tatami-light">div</span>{' '}
                  <span className="text-hinoki-light">className</span>=
                  <span className="text-tatami-light">"hozo-view hozo-0"</span>{' '}
                  <span className="text-hinoki-light">role</span>=
                  <span className="text-tatami-light">"alert"</span>&gt;\n
                  {'      '}&lt;<span className="text-tatami-light">h2</span>{' '}
                  <span className="text-hinoki-light">className</span>=
                  <span className="text-tatami-light">"hozo-1"</span>&gt;{'{title}'}&lt;/
                  <span className="text-tatami-light">h2</span>&gt;\n
                  {'      '}&lt;<span className="text-tatami-light">p</span>{' '}
                  <span className="text-hinoki-light">className</span>=
                  <span className="text-tatami-light">"hozo-2"</span>&gt;{'{message}'}&lt;/
                  <span className="text-tatami-light">p</span>&gt;\n
                  {'      '}&lt;<span className="text-tatami-light">button</span>{' '}
                  <span className="text-hinoki-light">className</span>=
                  <span className="text-tatami-light">"hozo-3"</span>{' '}
                  <span className="text-hinoki-light">type</span>=
                  <span className="text-tatami-light">"button"</span>{' '}
                  <span className="text-hinoki-light">onClick</span>={'{onDismiss}'}&gt;\n
                  {'        '}Dismiss\n
                  {'      '}&lt;/<span className="text-tatami-light">button</span>&gt;\n
                  {'    '}&lt;/<span className="text-tatami-light">div</span>&gt;\n
                  {'  '})\n
                  {'}'}
                </code>
              </pre>
            </View>

            {/* Right: Native Output */}
            <View className="p-4 sm:p-6 bg-yakisugi-950">
              <View className="flex flex-row items-center justify-between mb-3">
                <View className="text-xs font-semibold text-tatami-light flex flex-row items-center gap-1.5">
                  <svg
                    className="w-4 h-4"
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
                  <Text>Native Lowering (Fabric / StyleSheet)</Text>
                </View>
                <Text className="text-[10px] font-mono px-2 py-0.5 rounded bg-tatami-subtle text-tatami-light border border-tatami-subtle">
                  React Native / Fabric
                </Text>
              </View>
              <pre className="font-mono text-xs text-shikkui-muted overflow-x-auto leading-relaxed">
                <code>
                  <span className="text-stone-500">
                    {'// Real compiler output: StyleSheet & native primitives\n'}
                  </span>
                  <span className="text-hinoki">export function</span>{' '}
                  <span className="text-hinoki-light">NotificationCard</span>
                  {'({ '}
                  <span className="text-shikkui-muted">title</span>,{' '}
                  <span className="text-shikkui-muted">message</span>,{' '}
                  <span className="text-shikkui-muted">onDismiss</span>
                  {' }) {\n'}
                  {'  '}
                  <span className="text-hinoki">return</span> (\n
                  {'    '}&lt;<span className="text-shikkui">View</span>{' '}
                  <span className="text-stone-400">style</span>={'{hozoStyles.hozo0}'}{' '}
                  <span className="text-stone-400">role</span>=
                  <span className="text-tatami-light">"alert"</span>&gt;\n
                  {'      '}&lt;<span className="text-shikkui">Text</span>{' '}
                  <span className="text-stone-400">style</span>={'{hozoStyles.hozo1}'}{' '}
                  <span className="text-stone-400">accessibilityRole</span>=
                  <span className="text-tatami-light">"header"</span>&gt;{'{title}'}&lt;/
                  <span className="text-shikkui">Text</span>&gt;\n
                  {'      '}&lt;<span className="text-shikkui">Text</span>{' '}
                  <span className="text-stone-400">style</span>={'{hozoStyles.hozo2}'}&gt;
                  {'{message}'}&lt;/<span className="text-shikkui">Text</span>&gt;\n
                  {'      '}&lt;<span className="text-shikkui">Pressable</span>{' '}
                  <span className="text-stone-400">style</span>={'{hozoStyles.hozo3}'}{' '}
                  <span className="text-stone-400">accessibilityRole</span>=
                  <span className="text-tatami-light">"button"</span>{' '}
                  <span className="text-stone-400">onPress</span>={'{onDismiss}'}&gt;\n
                  {'        '}&lt;<span className="text-shikkui">Text</span>{' '}
                  <span className="text-stone-400">style</span>={'{hozoStyles.hozo3_text}'}
                  &gt;Dismiss&lt;/
                  <span className="text-shikkui">Text</span>&gt;\n
                  {'      '}&lt;/<span className="text-shikkui">Pressable</span>&gt;\n
                  {'    '}&lt;/<span className="text-shikkui">View</span>&gt;\n
                  {'  '})\n
                  {'}'}
                </code>
              </pre>
            </View>
          </View>
        </View>
      </View>
    </Section>
  )
}
