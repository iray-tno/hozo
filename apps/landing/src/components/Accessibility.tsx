import { Heading, List, ListItem, Paragraph, Section, Text, View } from '@hozo/core'

export function Accessibility() {
  return (
    <Section
      nativeID="accessibility"
      className="py-24 border-t border-wood relative bg-gradient-to-b from-yakisugi-950 via-yakisugi-900 to-transparent"
    >
      <View className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <View className="text-center max-w-3xl mx-auto mb-16 flex flex-col items-center">
          <Text className="text-xs font-bold uppercase tracking-widest text-hinoki mb-3 block">
            Accessibility-First
          </Text>
          <Heading
            level={2}
            className="text-3xl sm:text-5xl font-extrabold text-shikkui tracking-tight mb-4"
          >
            Accessible by Structure, Not Afterthought
          </Heading>
          <Paragraph className="text-shikkui-muted text-base sm:text-lg leading-relaxed">
            Accessibility isn't decorative trim—it is the foundational joinery of software. Hozo
            validates supported WAI-ARIA role and attribute constraints at compile time and provides
            seamless cross-platform keyboard and focus behaviors.
          </Paragraph>
        </View>

        <View className="grid grid-cols-1 lg:grid-cols-2 gap-8 max-w-5xl mx-auto items-stretch">
          {/* Feature 1: Compile-time Diagnostics */}
          <View className="p-8 rounded-2xl timber-panel border border-wood flex flex-col justify-between">
            <View>
              <View className="w-10 h-10 rounded-xl bg-bengara-subtle border border-bengara-subtle flex items-center justify-center text-bengara mb-6">
                <svg
                  className="w-5 h-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                  />
                </svg>
              </View>
              <Heading level={3} className="text-xl font-bold text-shikkui mb-3">
                Compile-Time ARIA Verification
              </Heading>
              <Paragraph className="text-stone-400 text-sm leading-relaxed mb-6">
                Directly derived from the machine-readable W3C specification via{' '}
                <code className="text-shikkui-muted text-xs">aria-query</code>. Catches invalid
                roles, missing attributes, and malformed states during compilation before they ship
                to production.
              </Paragraph>

              <View className="p-4 rounded-xl bg-bengara-subtle border border-bengara-subtle font-mono text-xs text-shikkui">
                <Text className="text-bengara font-semibold mb-1 block">
                  ✕ Hozo Diagnostic [ARIA_INCOMPLETE_PATTERN]
                </Text>
                <Text className="text-stone-300 block">
                  `role="checkbox"` needs aria-checked to mean anything, and this element has none
                  of them.
                </Text>
              </View>
            </View>

            <List className="mt-6 text-xs text-stone-400 space-y-2 border-t border-wood pt-4 list-none p-0 m-0">
              <ListItem className="flex flex-row items-center gap-2">
                <Text className="text-tatami-light">✓</Text> Automatic semantic mapping (
                <code className="text-shikkui-muted">header &rarr; heading</code>,{' '}
                <code className="text-shikkui-muted">search &rarr; searchbox</code>)
              </ListItem>
              <ListItem className="flex flex-row items-center gap-2">
                <Text className="text-tatami-light">✓</Text> Abstract role warnings (
                <code className="text-shikkui-muted">role="widget"</code>)
              </ListItem>
            </List>
          </View>

          {/* Feature 2: @hozo/behaviors Primitives */}
          <View className="p-8 rounded-2xl timber-panel border border-wood flex flex-col justify-between">
            <View>
              <View className="w-10 h-10 rounded-xl bg-wood-subtle border border-wood-strong flex items-center justify-center text-hinoki mb-6">
                <svg
                  className="w-5 h-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122"
                  />
                </svg>
              </View>
              <Heading level={3} className="text-xl font-bold text-shikkui mb-3">
                Accessible Behaviors (@hozo/behaviors)
              </Heading>
              <Paragraph className="text-stone-400 text-sm leading-relaxed mb-6">
                Smooth, dependable interaction mechanics across Web and Native: focus management,
                keyboard navigation, roving tabindex, and collision-aware anchoring.
              </Paragraph>

              <View className="grid grid-cols-2 gap-3 font-mono text-xs">
                <View className="p-3 rounded-lg bg-yakisugi-950 border border-wood text-shikkui-muted flex flex-row items-center gap-2">
                  <View className="w-2 h-2 rounded-full bg-hinoki" /> Dialog & Modal
                </View>
                <View className="p-3 rounded-lg bg-yakisugi-950 border border-wood text-shikkui-muted flex flex-row items-center gap-2">
                  <View className="w-2 h-2 rounded-full bg-tatami-light" /> Combobox & Listbox
                </View>
                <View className="p-3 rounded-lg bg-yakisugi-950 border border-wood text-shikkui-muted flex flex-row items-center gap-2">
                  <View className="w-2 h-2 rounded-full bg-bengara" /> Tabs & Panels
                </View>
                <View className="p-3 rounded-lg bg-yakisugi-950 border border-wood text-shikkui-muted flex flex-row items-center gap-2">
                  <View className="w-2 h-2 rounded-full bg-hinoki-light" /> Menu & Toolbar
                </View>
              </View>
            </View>

            <List className="mt-6 text-xs text-stone-400 space-y-2 border-t border-wood pt-4 list-none p-0 m-0">
              <ListItem className="flex flex-row items-center gap-2">
                <Text className="text-tatami-light">✓</Text> WAI-ARIA compliant keyboard listeners
              </ListItem>
              <ListItem className="flex flex-row items-center gap-2">
                <Text className="text-tatami-light">✓</Text> Deterministic focus restoration on
                dismissal
              </ListItem>
            </List>
          </View>
        </View>
      </View>
    </Section>
  )
}
