import { Code, Heading, Link, Paragraph, Section, Text, View } from '@hozo/core'
import type { ReactNode } from 'react'
import snapshot from '../../../../../packages/tailwind-conformance/snapshot.json'

// The /conformance/ page, in Hozo primitives, every number read from the
// committed snapshot of `@hozo/tailwind-conformance`.
//
// The page this replaced hard-coded several of its verdicts, and they had
// drifted: "100%" beside figures it never computed, five Native refusals
// (four, plus one no-op), `box-border` as the no-op (`whitespace-normal`),
// "every primitive" under contract (some have none), and "all declared
// diagnostics fire" (one has no case, one is unreachable by design). Here a
// claim is either a number from the snapshot or prose that holds whatever
// the number is.

const n = (value: number) => value.toLocaleString('en-US')

export function ConformanceIntro() {
  const { versions } = snapshot
  return (
    <Section className="mb-12 max-w-4xl">
      <View className="self-start inline-flex flex-row flex-wrap items-center gap-2 px-3 py-1 rounded-full bg-hinoki/10 border border-hinoki/18 text-hinoki text-xs font-mono mb-4">
        <Text>Tailwind CSS {versions.tailwind}</Text>
        <Text className="text-stone-600">•</Text>
        <Text>React Native {versions.reactNative}</Text>
        <Text className="text-stone-600">•</Text>
        <Text>StyleX {versions.stylex}</Text>
      </View>
      <Heading
        level={1}
        className="text-3xl sm:text-5xl font-extrabold tracking-tight text-shikkui mb-5"
      >
        Conformance, <Text className="text-hinoki">measured against the originals</Text>
      </Heading>
      <Paragraph className="text-base sm:text-lg text-stone-300 leading-relaxed">
        Each number below comes from compiling the same input through Hozo and through the thing it
        stands in for: Tailwind&apos;s own engine, the official StyleX Babel plugin, React
        Native&apos;s type definitions, and the ARIA roles in <Code>aria-query</Code>.
      </Paragraph>
      <Paragraph className="mt-3 text-sm text-stone-400 leading-relaxed">
        They are read from <Code>packages/tailwind-conformance/snapshot.json</Code> as committed.
        The report runs on every push to <Code>main</Code> and weekly, and a number that differs
        from the snapshot fails that run until the change is committed with a reason.
      </Paragraph>
    </Section>
  )
}

function Group({ title, lede, children }: { title: string; lede: ReactNode; children: ReactNode }) {
  return (
    <Section className="mb-16 gap-6">
      <View className="gap-2 max-w-3xl">
        <Heading level={2} className="text-2xl sm:text-3xl font-bold text-shikkui tracking-tight">
          {title}
        </Heading>
        <Paragraph className="text-sm text-stone-300 leading-relaxed">{lede}</Paragraph>
      </View>
      <View className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5">{children}</View>
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

export function TailwindWeb() {
  const { web, catalogue, arbitrary, variants, candidateSheet, composed, render } = snapshot
  return (
    <Group
      title="Tailwind on the Web"
      lede="Hozo's CSS against Tailwind's for the same class, after both are normalised: custom properties resolved, calc() folded, shorthands expanded. A value that cannot be normalised with certainty is skipped, not guessed."
    >
      <Stat label="Curated classes" value={`${web.fidelity} / ${web.candidates}`}>
        A hand-picked slice of what app code uses. It shows the common path works; it is not a claim
        about Tailwind as a whole.
      </Stat>
      <Stat label="Full catalogue" value={`${n(catalogue.match)} / ${n(catalogue.comparable)}`}>
        Every class Tailwind&apos;s design system lists, {n(catalogue.entries)} entries. The rest
        produce no rule from Tailwind, or one that paints nothing until combined with another
        utility. {catalogue.mismatch} mismatches.
      </Stat>
      <Stat label="Arbitrary values" value={`${n(arbitrary.match)} / ${n(arbitrary.candidates)}`}>
        {arbitrary.mismatch} mismatches. The rest paint nothing on their own. {n(arbitrary.textual)}{' '}
        of the matches are compared as text, because only a browser can reduce the value.
      </Stat>
      <Stat label="Variants" value={`${n(variants.match)} / ${n(variants.total)}`}>
        Single and stacked, such as <Code>md:hover:flex</Code>. The selector and the at-rules around
        the rule are compared, not just its declarations.
      </Stat>
      <Stat label="Combined utilities" value={`${n(composed.match)} / ${n(composed.candidates)}`}>
        Gradients and their stops, ring and shadow layers, the filter chain and transform axes,
        compared once they are put together.
      </Stat>
      <Stat
        label="Rule order"
        value={`${n(candidateSheet.inOrder)} / ${n(candidateSheet.comparable)}`}
      >
        Rules in the candidate stylesheet in the order Tailwind writes them, which decides who wins
        the cascade. {render.dangling} classes reached the DOM with no rule behind them.
      </Stat>
    </Group>
  )
}

export function TailwindNative() {
  const { native, nativeVariants, arbitraryNative, nativeContextual, refusalAudit, nativeTypes } =
    snapshot
  return (
    <Group
      title="Tailwind on iOS and Android"
      lede="A class becomes a StyleSheet property, or the build names it and refuses it. The number that has to stay at zero is silent: a class that compiles to nothing without a diagnostic."
    >
      <Stat label="Curated classes" value={`${native.covered} / ${native.candidates}`}>
        {native.refused} refused with a diagnostic, {native.noOp} a deliberate no-op (
        <Code>whitespace-normal</Code>, which React Native already does), {native.silent} silent.
      </Stat>
      <Stat label="Variants" value={`${n(nativeVariants.covered)} / ${n(nativeVariants.total)}`}>
        {n(nativeVariants.refused)} refused, {nativeVariants.silent} silent.{' '}
        {n(nativeVariants.restricted)} of the covered ones work only on some elements, such as a
        state variant on a Pressable; using one elsewhere is a build error.
      </Stat>
      <Stat
        label="Arbitrary values"
        value={`${n(arbitraryNative.covered)} / ${n(arbitraryNative.candidates)}`}
      >
        Most are CSS properties React Native has no key for, so {n(arbitraryNative.refused)} are
        refused. {arbitraryNative.silent} silent.
      </Stat>
      <Stat
        label="Refusals checked"
        value={`${n(refusalAudit.confirmed)} / ${n(refusalAudit.checkable)}`}
      >
        Web-only refusals checked against React Native&apos;s types: confirmed impossible there.{' '}
        {refusalAudit.partial} are partly expressible, and {refusalAudit.suspect} looks fully
        expressible and is flagged to be re-read.
      </Stat>
      <Stat
        label="Conditions and transitions"
        value={`${nativeContextual.covered} / ${nativeContextual.cases}`}
      >
        Cases that need configuration or an interactive element, such as transitions and
        pressed-state transforms.
      </Stat>
      <Stat label="Type-checked output" value={`${n(nativeTypes.entries)}`}>
        Style objects emitted for every catalogue class that matches on the Web, type-checked
        against React Native&apos;s own declarations. {nativeTypes.rejected} rejected.
      </Stat>
    </Group>
  )
}

export function StylexSummary({ baseUrl }: { baseUrl: string }) {
  const { stylex, stylexCorpus, stylexSafety } = snapshot
  return (
    <Group
      title="StyleX"
      lede={
        <>
          Static <Code>stylex.create</Code> sheets, lowered by the same backends. The{' '}
          <Link href={`${baseUrl}/stylex/`} className="text-hinoki underline">
            StyleX page
          </Link>{' '}
          has the rest of these numbers and compiled samples.
        </>
      }
    >
      <Stat label="Property names" value={`${stylex.mapped} / ${stylex.properties}`}>
        Of every name StyleX&apos;s types publish. The other {stylex.nonActionableProperties} are
        shorthands StyleX rejects by default, <Code>@font-face</Code> descriptors, or obsolete.
      </Stat>
      <Stat label="Universal" value={`${stylex.mappedNative} / ${stylex.nativeProperties}`}>
        Names React Native has, or has an exact compile-time equivalent for.
      </Stat>
      <Stat label="Scenarios" value={`${stylexCorpus.covered} / ${stylexCorpus.cases}`}>
        Declarations whose Web output agrees with the official plugin. {stylexSafety.silent} silent
        failures.
      </Stat>
    </Group>
  )
}

export function Accessibility() {
  const { ariaRoles, a11yContracts, diagnostics, rnwFree } = snapshot
  return (
    <Group
      title="Accessibility and diagnostics"
      lede="Two halves: whether the checks stay quiet on correct code, and whether they speak at all. A check that cries wolf gets switched off; one that stopped firing looks like code with no defects."
    >
      <Stat label="ARIA roles, written correctly" value={`${ariaRoles.roles}`}>
        Every concrete role in <Code>aria-query</Code>: {ariaRoles.staticRoles} static,{' '}
        {ariaRoles.interactiveRoles} interactive. {ariaRoles.falsePositives} raised a warning.
      </Stat>
      <Stat label="Diagnostics that fire" value={`${diagnostics.fires} / ${diagnostics.declared}`}>
        Each provoked by a case. {diagnostics.silent} stayed silent, {diagnostics.noCase} has no
        case yet, and {diagnostics.unreachable} is a defensive branch nothing can reach.
      </Stat>
      <Stat label="Platform contracts" value={`${a11yContracts.covered} / ${a11yContracts.cases}`}>
        Cases that compile one source through both backends and state what each must produce. They
        cover{' '}
        {`${a11yContracts.primitives - a11yContracts.uncontracted} of ${a11yContracts.primitives} primitives`}
        .
      </Stat>
      <Stat label="Without react-native-web" value={`${rnwFree.covered} / ${rnwFree.cases}`}>
        Primitives checked to lower straight to DOM elements and CSS on the Web, and to React Native
        on iOS and Android, with no react-native-web in between.
      </Stat>
    </Group>
  )
}

export function Drawing() {
  const { canvas, canvasArbitrary, svgFilterWeb, svgFilterNative, svgFilterVersions } = snapshot
  return (
    <Group
      title="Canvas and SVG filters"
      lede="A canvas shape has a fill, a stroke, a stroke width and an opacity, so nearly every utility is refused there; what matters is that none is refused without saying so."
    >
      <Stat label="Canvas paint" value={`${n(canvas.covered)} / ${n(canvas.candidates)}`}>
        Catalogue utilities a canvas shape can paint. {canvas.silent} silent, {canvas.unresolvable}{' '}
        painted with a value no canvas resolves.
      </Stat>
      <Stat
        label="Canvas, arbitrary values"
        value={`${canvasArbitrary.covered} / ${n(canvasArbitrary.candidates)}`}
      >
        {canvasArbitrary.silent} silent, {canvasArbitrary.unresolvable} painted with a value no
        canvas resolves.
      </Stat>
      <Stat
        label="SVG filter elements"
        value={`${svgFilterWeb.covered} / ${svgFilterWeb.total} Web, ${svgFilterNative.covered} / ${svgFilterNative.total} Native`}
      >
        From react-native-svg {svgFilterVersions.reactNativeSvg}&apos;s exports. API, compiler and
        import routing only: not prop parity, pixel equivalence or device rendering. Its{' '}
        {svgFilterNative.upstreamStubs} warning-only Native stubs are not counted. See{' '}
        <Link
          href="https://github.com/iray-tno/hozo/blob/main/packages/tailwind-conformance/src/svg-filters.test.ts"
          className="text-hinoki underline"
        >
          packages/tailwind-conformance/src/svg-filters.test.ts
        </Link>
        .
      </Stat>
    </Group>
  )
}

export function RunIt() {
  return (
    <Section className="mb-16 p-6 sm:p-8 rounded-2xl border border-hinoki/30 bg-hinoki/5 gap-3">
      <Heading level={2} className="text-lg font-bold text-shikkui">
        Run it
      </Heading>
      <Paragraph className="text-xs sm:text-sm text-stone-300 leading-relaxed">
        <Code>pnpm --filter @hozo/tailwind-conformance report</Code>, after rebuilding the native
        addon. It prints each section with the classes behind every number that is not a match.
      </Paragraph>
      <Link
        href="https://github.com/iray-tno/hozo/tree/main/packages/tailwind-conformance"
        className="self-start text-xs sm:text-sm text-hinoki underline"
      >
        The harness on GitHub
      </Link>
    </Section>
  )
}
