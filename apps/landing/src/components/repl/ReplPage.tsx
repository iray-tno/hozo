import { Code, Heading, Paragraph, Preformatted, Section, Text, View } from '@hozo/core'

// The /repl/ page, in Hozo primitives. It is static HTML: `scripts/repl.ts`
// finds the editor, the panes and the status by id, loads the WebAssembly
// compiler, and fills them in. Nothing here hydrates.
//
// The editor is a plain View until the script runs. CodeJar makes it
// editable, and the script gives it its textbox role at the same moment, so
// a page whose script never ran does not announce a textbox that cannot be
// typed in.

const PANES = [
  { id: 'repl-web-jsx', title: 'Web', note: 'JSX' },
  { id: 'repl-web-css', title: 'Web', note: 'CSS' },
  { id: 'repl-native-jsx', title: 'React Native', note: 'JSX' },
  { id: 'repl-native-styles', title: 'React Native', note: 'StyleSheet' },
]

export function ReplIntro() {
  return (
    <Section className="mb-8 max-w-4xl">
      <Heading
        level={1}
        className="text-3xl sm:text-5xl font-extrabold tracking-tight text-shikkui mb-4"
      >
        The compiler, <Text className="text-hinoki">in your browser</Text>
      </Heading>
      <Paragraph className="text-base sm:text-lg text-stone-300 leading-relaxed">
        The same compiler <Code className="text-hinoki">@hozo/vite</Code> and{' '}
        <Code className="text-hinoki">@hozo/metro</Code> run, built to WebAssembly. Nothing is sent
        anywhere: it compiles here, in this tab.
      </Paragraph>
      <Paragraph className="mt-3 text-sm text-stone-400 leading-relaxed">
        Against the default Tailwind theme. A project&apos;s own theme is read from its
        configuration, and a page has no project.
      </Paragraph>
    </Section>
  )
}

export function Repl({ example }: { example: string }) {
  return (
    <View className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <Section className="min-w-0">
        <View className="flex-row items-baseline justify-between gap-2 mb-2">
          <Heading level={2} className="text-sm font-semibold text-stone-300">
            Source
          </Heading>
          <Text nativeID="repl-status" className="font-mono text-xs text-stone-500">
            Loading…
          </Text>
        </View>
        <View
          nativeID="repl-source"
          accessibilityLabel="TSX to compile"
          className="w-full h-[22rem] lg:h-[34rem] rounded-xl bg-yakisugi-950/80 border border-hinoki/18 p-4 font-mono text-sm text-stone-200 leading-relaxed overflow-auto"
        >
          {example}
        </View>
        <Heading level={2} className="text-sm font-semibold text-stone-300 mt-6 mb-2">
          Diagnostics
        </Heading>
        <View nativeID="repl-diagnostics" className="gap-2">
          <Paragraph className="text-sm text-stone-500">Compiling…</Paragraph>
        </View>
      </Section>

      <Section className="min-w-0 gap-4">
        {PANES.map((pane) => (
          <View
            key={pane.id}
            className="rounded-xl bg-yakisugi-950/80 border border-hinoki/18 overflow-hidden"
          >
            <View className="flex-row items-baseline gap-2 px-4 py-2 border-b border-hinoki/18 bg-hinoki/5">
              <Text className="text-sm font-semibold text-stone-200">{pane.title}</Text>
              <Text className="font-mono text-xs text-stone-500">{pane.note}</Text>
            </View>
            <Preformatted
              nativeID={pane.id}
              className="p-4 overflow-x-auto font-mono text-xs text-stone-300 leading-relaxed max-h-64"
            />
          </View>
        ))}
      </Section>
    </View>
  )
}
