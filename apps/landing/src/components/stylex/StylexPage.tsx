import { Code, Heading, Link, Paragraph, Section, Text, View } from '@hozo/core'
import type { ReactNode } from 'react'

// The /stylex/ page around its samples, in Hozo primitives. Checked against
// the root README's StyleX section and the conformance snapshot.
//
// The page this replaced wrote its sample as `style={[styles.base, ...]}`
// (Hozo reads `{...stylex.props(...)}`), named a `@hozo/stylex` package that
// does not exist, promised atomic StyleX classes on the Web (the output is
// Hozo's own scoped class), and pitched it as a replacement for
// `StyleSheet.create`, Styled Components and Emotion, which nothing measures.

export function StylexIntro({ stylex }: { stylex: string }) {
  return (
    <Section className="mb-12 max-w-4xl">
      <View className="self-start inline-flex flex-row flex-wrap items-center gap-2 px-3 py-1 rounded-full bg-hinoki/10 border border-hinoki/18 text-hinoki text-xs font-mono mb-4">
        <Text>@stylexjs/stylex {stylex}</Text>
        <Text className="text-stone-600">•</Text>
        <Text>a second frontend</Text>
      </View>
      <Heading
        level={1}
        className="text-3xl sm:text-5xl font-extrabold tracking-tight text-shikkui mb-5"
      >
        StyleX, read into <Text className="text-hinoki">the same compiler</Text>
      </Heading>
      <Paragraph className="text-base sm:text-lg text-stone-300 leading-relaxed">
        Hozo reads static <Code className="text-hinoki">stylex.create</Code> sheets and{' '}
        <Code className="text-hinoki">stylex.props</Code> spreads into the IR its Tailwind classes
        go into, then lowers both through the same Web and Native backends. Whatever it does not
        lower stays with the official StyleX transform, which runs after it.
      </Paragraph>
    </Section>
  )
}

export function StylexSamplesIntro() {
  return (
    <View className="gap-2 mb-6">
      <Heading level={2} className="text-2xl sm:text-3xl font-bold text-shikkui tracking-tight">
        Six samples, compiled when this page was built
      </Heading>
      <Paragraph className="text-sm text-stone-300 max-w-3xl leading-relaxed">
        Each tab is one source file through both backends, with every diagnostic the compiler
        raised.
      </Paragraph>
    </View>
  )
}

function Point({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View className="p-6 rounded-xl border border-hinoki/18 bg-yakisugi-900/40 gap-2">
      <Heading level={3} className="text-lg font-bold text-shikkui">
        {title}
      </Heading>
      <Paragraph className="text-xs sm:text-sm text-stone-300 leading-relaxed">
        {children}
      </Paragraph>
    </View>
  )
}

export function StylexPoints() {
  return (
    <Section className="mb-16 gap-6">
      <Heading level={2} className="text-2xl sm:text-3xl font-bold text-shikkui tracking-tight">
        How the two transforms share a file
      </Heading>
      <View className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Point title="Hozo runs first">
          Hozo needs the <Code className="text-hinoki">stylex.props</Code> spread as written. Run
          StyleX first and the spread is already a second{' '}
          <Code className="text-hinoki">className</Code>, and JSX&apos;s last-one-wins has lost what
          was needed to combine the two. Put <Code className="text-hinoki">hozo()</Code> before the
          StyleX plugin in Vite; Metro&apos;s wrapper already hands its output on.
        </Point>
        <Point title="StyleX's order, kept">
          StyleX 0.19&apos;s property-specificity mode is resolved before the IR, so a physical
          longhand still beats a later shorthand on both platforms. There is no runtime priority
          machinery.
        </Point>
        <Point title="Half a rule is fine">
          When one rule mixes supported and unsupported properties, Hozo lowers what it can and
          rebuilds the rest as a smaller <Code className="text-hinoki">stylex.create</Code> for the
          official transform. Where the two halves would overlap, it leaves the whole rule alone
          rather than guess at the cascade.
        </Point>
        <Point title="Sheets from other files">
          A static sheet can live in another module and arrive through named, star or namespace
          re-exports. Vite, Next and Metro feed their own alias resolution into the module registry.
        </Point>
      </View>
      <Paragraph className="text-xs text-stone-400 leading-relaxed max-w-3xl">
        Still with StyleX: <Code>createTheme</Code>, dynamic styles, unsupported nested selectors
        and at-rules, <Code>sx</Code>, and conflicts whose Native answer depends on writing
        direction or a richer Grid model. Each is reported as <Code>STYLEX_NOT_LOWERED</Code>, not
        approximated.
      </Paragraph>
    </Section>
  )
}

function Stat({ label, value, children }: { label: string; value: string; children: ReactNode }) {
  return (
    <View className="p-5 rounded-xl border border-hinoki/10 bg-yakisugi-950/80 gap-1">
      <Text className="text-xs font-mono text-stone-400">{label}</Text>
      <Text className="text-2xl font-bold text-shikkui">{value}</Text>
      <Paragraph className="text-xs text-stone-400 leading-relaxed">{children}</Paragraph>
    </View>
  )
}

export interface StylexNumbers {
  stylex: {
    properties: number
    mapped: number
    compilerRelevantProperties: number
    mappedCompilerRelevant: number
    nonActionableProperties: number
    nativeProperties: number
    mappedNative: number
    contextualProperties: number
    mappedContextual: number
    webOnlyProperties: number
    mappedWebOnly: number
  }
  stylexValues: { cases: number; covered: number }
  stylexConstructs: { cases: number; covered: number }
  stylexCorpus: { cases: number; covered: number }
  stylexSafety: { silent: number }
}

export function StylexMeasured({ numbers }: { numbers: StylexNumbers }) {
  const { stylex, stylexValues, stylexConstructs, stylexCorpus, stylexSafety } = numbers
  return (
    <Section className="mb-16 rounded-2xl border border-hinoki/18 bg-yakisugi-900/60 p-6 sm:p-8 shadow-xl gap-6">
      <View className="gap-2">
        <Heading level={2} className="text-xl sm:text-2xl font-bold text-shikkui tracking-tight">
          Measured against StyleX
        </Heading>
        <Paragraph className="text-xs sm:text-sm text-stone-400 leading-relaxed">
          From the conformance snapshot (
          <Code>pnpm --filter @hozo/tailwind-conformance report</Code>). Property names are an upper
          bound: each property still accepts only the static values the IR can represent. The
          practical corpus is the stricter measure, because a case counts only when the Web output
          agrees with the official StyleX Babel plugin.
        </Paragraph>
      </View>
      <View className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-5">
        <Stat label="Property names" value={`${stylex.mapped} / ${stylex.properties}`}>
          Of every name StyleX&apos;s types publish. The other {stylex.nonActionableProperties} are
          shorthands StyleX itself rejects by default, <Code>@font-face</Code> descriptors, or
          obsolete.
        </Stat>
        <Stat
          label="Compiler-relevant"
          value={`${stylex.mappedCompilerRelevant} / ${stylex.compilerRelevantProperties}`}
        >
          The reviewed surface, without the optional Native <Code>backdropFilter</Code> adapter.
        </Stat>
        <Stat label="Universal" value={`${stylex.mappedNative} / ${stylex.nativeProperties}`}>
          Names React Native has, or has an exact compile-time equivalent for.
        </Stat>
        <Stat label="Web-only" value={`${stylex.mappedWebOnly} / ${stylex.webOnlyProperties}`}>
          Lowered on the Web; on Native, refused by name.
        </Stat>
        <Stat
          label="Contextual"
          value={`${stylex.mappedContextual} / ${stylex.contextualProperties}`}
        >
          Names that need a runtime on Native: Grid tracks, containers, transitions.
        </Stat>
        <Stat label="Values" value={`${stylexValues.covered} / ${stylexValues.cases}`}>
          Representative values, each through both compilers and the official plugin.
        </Stat>
        <Stat label="Constructs" value={`${stylexConstructs.covered} / ${stylexConstructs.cases}`}>
          Common ways of writing <Code>create</Code> and <Code>props</Code>.
        </Stat>
        <Stat label="Scenarios" value={`${stylexCorpus.covered} / ${stylexCorpus.cases}`}>
          Declarations across card, typography, input, scroll, motion, grid and border scenarios.{' '}
          {stylexSafety.silent} silent failures.
        </Stat>
      </View>
    </Section>
  )
}

export function StylexConformanceLink({ baseUrl }: { baseUrl: string }) {
  return (
    <Section className="mb-16 p-6 sm:p-8 rounded-2xl border border-hinoki/30 bg-hinoki/5 gap-4 sm:flex-row sm:items-center sm:justify-between">
      <View className="gap-1 shrink">
        <Heading level={2} className="text-lg font-bold text-shikkui">
          The full report
        </Heading>
        <Paragraph className="text-xs sm:text-sm text-stone-300">
          The conformance page has these numbers beside Tailwind, ARIA and the Native component
          tree.
        </Paragraph>
      </View>
      <Link
        href={`${baseUrl}/conformance/`}
        className="self-start sm:self-auto px-5 py-2.5 rounded-lg bg-hinoki text-yakisugi-950 font-bold text-xs sm:text-sm hover:bg-hinoki-light shrink-0 text-center"
      >
        See the conformance report →
      </Link>
    </Section>
  )
}
