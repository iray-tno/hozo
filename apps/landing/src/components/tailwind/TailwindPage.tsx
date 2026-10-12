import {
  Code,
  Heading,
  Link,
  Paragraph,
  Preformatted,
  Section,
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Text,
  View,
} from '@hozo/core'
import type { ReactNode } from 'react'
import type { CompiledSample, NativeGap, Outcome, VariantRow } from './compiled.ts'

// The /tailwind/ page around its demo, in Hozo primitives.
//
// The page this replaced described the lowering in prose that had drifted:
// `box-border` as Native's no-op (it is `whitespace-normal`), `@theme`
// tokens as `var()` on Native, and a sample that would not build there
// (`transition-all` is refused). The compiler output and the variant table
// below are compiled when the site is built, and the numbers come from the
// conformance snapshot, so neither can drift that way again.

export function TailwindIntro({ tailwind }: { tailwind: string }) {
  return (
    <Section className="mb-12 max-w-4xl">
      <View className="self-start inline-flex flex-row flex-wrap items-center gap-2 px-3 py-1 rounded-full bg-hinoki/10 border border-hinoki/18 text-hinoki text-xs font-mono mb-4">
        <Text>Tailwind CSS {tailwind}</Text>
        <Text className="text-stone-600">•</Text>
        <Text>compiled in Rust</Text>
      </View>
      <Heading
        level={1}
        className="text-3xl sm:text-5xl font-extrabold tracking-tight text-shikkui mb-5"
      >
        Tailwind classes, <Text className="text-hinoki">resolved before they ship</Text>
      </Heading>
      <Paragraph className="text-base sm:text-lg text-stone-300 leading-relaxed">
        Write <Code className="text-hinoki">className</Code> on a Hozo primitive. At build time the
        compiler turns it into scoped CSS on the Web and a{' '}
        <Code className="text-hinoki">StyleSheet</Code> object on iOS and Android. A class it cannot
        honour on a platform is named in a build diagnostic rather than dropped.
      </Paragraph>
    </Section>
  )
}

function Panel({
  title,
  detail,
  children,
}: {
  title: string
  detail?: ReactNode
  children: ReactNode
}) {
  return (
    <View className="min-w-0 rounded-xl border border-hinoki/18 bg-yakisugi-950 overflow-hidden">
      <View className="px-4 py-2.5 border-b border-hinoki/18 bg-yakisugi-900/60 gap-0.5">
        <Heading level={3} className="text-xs font-mono font-bold text-hinoki">
          {title}
        </Heading>
        {detail ? <Paragraph className="text-[11px] text-stone-400">{detail}</Paragraph> : null}
      </View>
      {children}
    </View>
  )
}

function Listing({ children }: { children: string }) {
  return (
    <Preformatted className="p-4 max-h-96 overflow-auto text-[11px] sm:text-xs font-mono text-stone-300 leading-relaxed whitespace-pre-wrap break-words">
      <Code>{children}</Code>
    </Preformatted>
  )
}

export function TailwindSampleIntro() {
  return (
    <View className="gap-2 mb-6">
      <Heading level={2} className="text-2xl sm:text-3xl font-bold text-shikkui tracking-tight">
        One component, compiled twice
      </Heading>
      <Paragraph className="text-sm text-stone-300 max-w-3xl leading-relaxed">
        The chips below are <Code className="text-hinoki">Chip.tsx</Code>, compiled by this site's
        own build. Under them is the same file through the Web and Native backends, run when this
        page was built.
      </Paragraph>
    </View>
  )
}

export function TailwindSample({ source, compiled }: { source: string; compiled: CompiledSample }) {
  // The component body as the Native backend leaves it: its hooks, the JSX,
  // and the style object the JSX refers to.
  const native = [
    ...compiled.native.prelude,
    '',
    `return ${compiled.native.jsx}`,
    '',
    '// hozoStyles',
    compiled.native.styles,
  ].join('\n')
  return (
    <Section className="mb-16 gap-6">
      <Panel title="Chip.tsx" detail="As written.">
        <Listing>{source.trim()}</Listing>
      </Panel>
      <View className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Panel title="Web" detail="A button with a scoped class, and the CSS for it.">
          <Listing>{`${compiled.web.jsx}\n\n${compiled.web.css}`}</Listing>
        </Panel>
        <Panel title="iOS and Android" detail="A Pressable and a StyleSheet object.">
          <Listing>{native}</Listing>
        </Panel>
      </View>
      <View className="grid grid-cols-1 md:grid-cols-3 gap-5">
        <Tier name="A literal" title="Text">
          <Code className="text-hinoki">text-sm font-semibold md:text-base</Code> becomes one class
          and a media query on the Web, and one style plus a breakpoint hook on Native. Nothing is
          parsed at runtime.
        </Tier>
        <Tier name="A ternary" title="Button">
          Both branches are compiled. The Web keeps one class and switches a{' '}
          <Code className="text-hinoki">data-hozo-cond-*</Code> attribute; Native picks between two
          styles.
        </Tier>
        <Tier name="A value from outside" title="View">
          A <Code className="text-hinoki">className</Code> prop cannot be read at build time, and
          the compiler says so. Its classes come from a stylesheet of every class written literally
          in the project, or a lookup map on Native. Variants like{' '}
          <Code className="text-hinoki">hover:</Code> cannot travel that way on Native.
        </Tier>
      </View>
    </Section>
  )
}

function Tier({ name, title, children }: { name: string; title: string; children: ReactNode }) {
  return (
    <View className="p-5 rounded-xl border border-hinoki/10 bg-yakisugi-900/40 gap-2">
      <Text className="text-xs font-mono font-bold text-hinoki uppercase tracking-wider">
        {name}
      </Text>
      <Heading level={3} className="text-base font-bold text-shikkui">
        The {title}
      </Heading>
      <Paragraph className="text-xs text-stone-300 leading-relaxed">{children}</Paragraph>
    </View>
  )
}

function OutcomeCell({ outcome }: { outcome: Outcome }) {
  if (outcome.kind === 'compiled') {
    return (
      <TableCell className="px-3 py-2 align-top">
        <Text className="text-tatami-light font-semibold">Compiled</Text>
        {outcome.runtime.length ? (
          <Text className="text-stone-400"> · {outcome.runtime.join(', ')}</Text>
        ) : null}
      </TableCell>
    )
  }
  return (
    <TableCell className="px-3 py-2 align-top">
      <Text
        className={
          outcome.kind === 'refused'
            ? 'block text-[#e07a6c] font-semibold'
            : 'block text-amber-300 font-semibold'
        }
      >
        {outcome.kind === 'refused' ? 'Build error' : 'Warning: not compiled yet'}
      </Text>
      <Text className="block mt-1 text-stone-400 font-sans break-words">{outcome.message}</Text>
    </TableCell>
  )
}

export function TailwindVariants({ rows }: { rows: VariantRow[] }) {
  return (
    <Section className="mb-16 gap-4">
      <Heading level={2} className="text-2xl sm:text-3xl font-bold text-shikkui tracking-tight">
        Variants, platform by platform
      </Heading>
      <Paragraph className="text-sm text-stone-300 max-w-3xl leading-relaxed">
        Each class compiled on a Hozo <Code className="text-hinoki">Button</Code> when this page was
        built, with the state it depends on where it needs one. A name after "Compiled" is the
        runtime hook Native uses for it.
      </Paragraph>
      <View className="rounded-xl border border-hinoki/18 overflow-x-auto">
        <Table className="w-full min-w-[36rem] text-left text-xs font-mono text-stone-300">
          <TableCaption className="sr-only">
            Each Tailwind variant and what the Web and Native backends do with it
          </TableCaption>
          <TableHeader className="bg-yakisugi-900/60 text-stone-400">
            <TableRow>
              {['Class', 'Web', 'Native'].map((name) => (
                <TableHead key={name} className="px-3 py-2 border-b border-hinoki/18 font-semibold">
                  {name}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.className} className="border-b border-hinoki/10">
                <TableHead scope="row" className="px-3 py-2 align-top font-normal text-shikkui">
                  {row.className}
                </TableHead>
                <OutcomeCell outcome={row.web} />
                <OutcomeCell outcome={row.native} />
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </View>
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

const n = (value: number) => value.toLocaleString('en-US')

export interface TailwindNumbers {
  catalogue: { entries: number; comparable: number; match: number; mismatch: number }
  candidateSheet: { comparable: number; inOrder: number }
  arbitrary: { candidates: number; match: number; textual: number; mismatch: number }
  variants: { total: number; match: number; mismatch: number }
  native: { candidates: number; covered: number; refused: number; silent: number; noOp: number }
  nativeVariants: { total: number; covered: number; refused: number; silent: number }
  arbitraryNative: { candidates: number; covered: number; refused: number; silent: number }
  refusalAudit: { checkable: number; confirmed: number; partial: number; suspect: number }
}

export function TailwindMeasured({ numbers }: { numbers: TailwindNumbers }) {
  const { catalogue, candidateSheet, arbitrary, variants, native, nativeVariants } = numbers
  return (
    <Section className="mb-16 rounded-2xl border border-hinoki/18 bg-yakisugi-900/60 p-6 sm:p-8 shadow-xl gap-6">
      <View className="gap-2">
        <Heading level={2} className="text-xl sm:text-2xl font-bold text-shikkui tracking-tight">
          Measured against Tailwind itself
        </Heading>
        <Paragraph className="text-xs sm:text-sm text-stone-400 leading-relaxed">
          From the conformance snapshot (
          <Code>pnpm --filter @hozo/tailwind-conformance report</Code>). On the Web, Tailwind's own
          compiler is the oracle. On Native nothing defines what <Code>p-4</Code> should be, so the
          question there is only whether each class lowers or is refused out loud.
        </Paragraph>
      </View>
      <View className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5">
        <Stat
          label="Web · every class"
          value={`${n(catalogue.match)} / ${n(catalogue.comparable)}`}
        >
          Every class Tailwind's design system lists ({n(catalogue.entries)}), minus those it emits
          no standalone CSS for. {n(catalogue.mismatch)} mismatches.
        </Stat>
        <Stat label="Web · variants" value={`${n(variants.match)} / ${n(variants.total)}`}>
          Single and stacked variants. {n(variants.mismatch)} mismatches.
        </Stat>
        <Stat
          label="Web · arbitrary values"
          value={`${n(arbitrary.match)} / ${n(arbitrary.candidates)}`}
        >
          {n(arbitrary.mismatch)} mismatches; {n(arbitrary.textual)} of the matches are compared as
          text. The rest only mean something beside another class, and are measured in compositions.
        </Stat>
        <Stat
          label="Web · rule order"
          value={`${n(candidateSheet.inOrder)} / ${n(candidateSheet.comparable)}`}
        >
          Rules in the candidate stylesheet that keep Tailwind's cascade order.
        </Stat>
        <Stat label="Native · common classes" value={`${native.covered} / ${native.candidates}`}>
          A hand-picked list of what app code uses. {native.refused} refused, {native.noOp} no-op,{' '}
          {native.silent} silent: listed below.
        </Stat>
        <Stat
          label="Native · variants"
          value={`${n(nativeVariants.covered)} / ${n(nativeVariants.total)}`}
        >
          The same variant list as the Web. {n(nativeVariants.refused)} refused with a diagnostic,{' '}
          {n(nativeVariants.silent)} silent.
        </Stat>
        <Stat
          label="Native · arbitrary values"
          value={`${n(numbers.arbitraryNative.covered)} / ${n(numbers.arbitraryNative.candidates)}`}
        >
          {n(numbers.arbitraryNative.refused)} refused with a diagnostic,{' '}
          {n(numbers.arbitraryNative.silent)} silent.
        </Stat>
        <Stat
          label="Native · refusals checked"
          value={`${n(numbers.refusalAudit.confirmed)} / ${n(numbers.refusalAudit.checkable)}`}
        >
          Refusals confirmed against React Native's own type definitions;{' '}
          {numbers.refusalAudit.partial} partial, {numbers.refusalAudit.suspect} suspect.
        </Stat>
      </View>
    </Section>
  )
}

export function TailwindNativeGaps({ gaps }: { gaps: NativeGap[] }) {
  return (
    <Section className="mb-16 gap-4">
      <Heading level={2} className="text-xl sm:text-2xl font-bold text-shikkui tracking-tight">
        The common classes Native does not cover
      </Heading>
      <Paragraph className="text-sm text-stone-300 max-w-3xl leading-relaxed">
        With what the compiler says when you write them. Grid placement works inside a supported
        Hozo grid container, as the message says.
      </Paragraph>
      <View className="rounded-xl border border-hinoki/18 bg-yakisugi-950 overflow-hidden">
        {gaps.map((gap) => (
          <View
            key={gap.className}
            className="p-3.5 border-b border-hinoki/10 last:border-b-0 gap-1 sm:flex-row sm:gap-4"
          >
            <View className="flex-row gap-2 sm:w-56 shrink-0">
              <Text
                className={
                  gap.verdict === 'refused'
                    ? 'text-xs font-mono font-semibold text-amber-400'
                    : 'text-xs font-mono font-semibold text-hinoki'
                }
              >
                {gap.verdict === 'refused' ? 'REFUSED' : 'NO-OP'}
              </Text>
              <Text className="text-xs font-mono text-shikkui">{gap.className}</Text>
            </View>
            <Paragraph className="text-[11px] text-stone-400 leading-relaxed shrink">
              {gap.message}
            </Paragraph>
          </View>
        ))}
      </View>
    </Section>
  )
}

export function TailwindTheme() {
  return (
    <Section className="mb-16 grid grid-cols-1 md:grid-cols-2 gap-6">
      <View className="p-6 rounded-xl border border-hinoki/18 bg-yakisugi-900/40 gap-2">
        <Heading level={3} className="text-lg font-bold text-shikkui">
          Your theme, read by Tailwind
        </Heading>
        <Paragraph className="text-xs sm:text-sm text-stone-300 leading-relaxed">
          Hozo loads your entry stylesheet through Tailwind's own resolver, so{' '}
          <Code className="text-hinoki">@theme</Code>, <Code className="text-hinoki">@import</Code>{' '}
          and <Code className="text-hinoki">@plugin</Code> mean what they mean to Tailwind. Colours
          come back as <Code className="text-hinoki">oklch()</Code> for the Web and as hex for
          Native, which has no <Code className="text-hinoki">oklch()</Code>.
        </Paragraph>
      </View>
      <View className="p-6 rounded-xl border border-hinoki/18 bg-yakisugi-900/40 gap-2">
        <Heading level={3} className="text-lg font-bold text-shikkui">
          Spacing stays a scale
        </Heading>
        <Paragraph className="text-xs sm:text-sm text-stone-300 leading-relaxed">
          <Code className="text-hinoki">p-4</Code> is four spacing steps, not 16 pixels. Set{' '}
          <Code className="text-hinoki">--spacing</Code> and every step moves together, on both
          platforms.
        </Paragraph>
      </View>
    </Section>
  )
}

export function TailwindConformanceLink({ baseUrl }: { baseUrl: string }) {
  return (
    <Section className="mb-16 p-6 sm:p-8 rounded-2xl border border-hinoki/30 bg-hinoki/5 gap-4 sm:flex-row sm:items-center sm:justify-between">
      <View className="gap-1 shrink">
        <Heading level={2} className="text-lg font-bold text-shikkui">
          Every number on this page, and the rest
        </Heading>
        <Paragraph className="text-xs sm:text-sm text-stone-300">
          The conformance page covers StyleX, ARIA roles and the Native component tree too.
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
