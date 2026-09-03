import { View } from '@hozo/core'
import {
  Code,
  Emphasis,
  Heading,
  Mark,
  NoBreak,
  Paragraph,
  Rt,
  Ruby,
  Small,
  Strikethrough,
  Strong,
  Sub,
  Sup,
  Text,
  Underline,
} from '@hozo/typography'
import type { Meta, StoryObj } from '@storybook/react-vite'

function TypographyDemo() {
  return (
    <View className="max-w-2xl w-full space-y-8 rounded-2xl bg-white p-8 shadow-sm">
      <View className="space-y-4 border-b border-slate-200 pb-6">
        <Heading level={1} className="text-3xl font-extrabold text-slate-900 tracking-tight">
          Heading Level 1
        </Heading>
        <Heading level={2} className="text-2xl font-bold text-slate-800 tracking-tight">
          Heading Level 2
        </Heading>
        <Heading level={3} className="text-xl font-semibold text-slate-800">
          Heading Level 3
        </Heading>
        <Heading level={4} className="text-lg font-medium text-slate-700">
          Heading Level 4
        </Heading>
      </View>

      <View className="space-y-4">
        <Heading level={3} className="text-lg font-semibold text-slate-900">
          Paragraphs & Text Hierarchy
        </Heading>
        <Paragraph className="text-base leading-relaxed text-slate-700">
          Hozo lowers <Text className="font-semibold text-indigo-600">Paragraph</Text> and{' '}
          <Text className="font-semibold text-indigo-600">Heading</Text> to true semantic HTML tags
          (
          <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs text-slate-800 border border-slate-200 inline-block align-baseline">
            &lt;p&gt;
          </code>
          ,{' '}
          <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs text-slate-800 border border-slate-200 inline-block align-baseline">
            &lt;h1&gt;-&lt;h6&gt;
          </code>
          ) on Web, and to React Native{' '}
          <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs text-slate-800 border border-slate-200 inline-block align-baseline">
            Text
          </code>{' '}
          with header roles on Native.
        </Paragraph>
        <Paragraph className="text-sm leading-relaxed text-slate-500">
          Muted secondary description text rendered with native semantic document structure.
        </Paragraph>
      </View>

      <View className="space-y-4 border-t border-slate-200 pt-6">
        <Heading level={3} className="text-lg font-semibold text-slate-900">
          Inline Formatting & Semantics
        </Heading>
        <Paragraph className="text-base leading-relaxed text-slate-700 space-y-2">
          Universal text styling supports <Strong>strong importance</Strong>,{' '}
          <Emphasis>emphasis</Emphasis>, <Underline>underlined</Underline>, and{' '}
          <Strikethrough>deleted text</Strikethrough>.
        </Paragraph>
        <Paragraph className="text-base leading-relaxed text-slate-700">
          Inline code is rendered using{' '}
          <Code className="text-indigo-600 bg-slate-50 px-1 py-0.5 rounded">
            npm install @hozo/core
          </Code>
          .
        </Paragraph>
        <Paragraph className="text-base leading-relaxed text-slate-700">
          Important terms can be highlighted with{' '}
          <Mark className="bg-yellow-200 text-slate-900 px-1 rounded">Mark</Mark>, and numbers with
          units avoid wrapping via <NoBreak>100 km/h</NoBreak>.
        </Paragraph>
      </View>

      <View className="space-y-4 border-t border-slate-200 pt-6">
        <Heading level={3} className="text-lg font-semibold text-slate-900">
          Scripts, Annotations & Fine Print
        </Heading>
        <Paragraph className="text-base leading-relaxed text-slate-700">
          Formulas and subscripts: H<Sub>2</Sub>O, E = mc<Sup>2</Sup>, or reference notes
          <Sup>[1]</Sup>.
        </Paragraph>
        <Paragraph className="text-base leading-relaxed text-slate-700">
          Pronunciation guide with Ruby:{' '}
          <Ruby>
            漢字<Rt>かんじ</Rt>
          </Ruby>{' '}
          (Kanji).
        </Paragraph>
        <Paragraph className="text-slate-500">
          <Small>Copyright &copy; 2026 Hozo Universal UI. All rights reserved.</Small>
        </Paragraph>
      </View>
    </View>
  )
}

function HeadingsHierarchyDemo() {
  return (
    <View className="max-w-2xl w-full space-y-6 rounded-2xl bg-white p-8 shadow-sm">
      <Heading level={1} className="text-3xl font-extrabold text-slate-900 tracking-tight">
        Heading Level 1 (32px / 2rem)
      </Heading>
      <Paragraph className="text-sm text-slate-600">Main page title or primary headline</Paragraph>

      <Heading
        level={2}
        className="text-2xl font-bold text-slate-900 tracking-tight border-t border-slate-100 pt-4"
      >
        Heading Level 2 (24px / 1.5rem)
      </Heading>
      <Paragraph className="text-sm text-slate-600">Major section title</Paragraph>

      <Heading
        level={3}
        className="text-xl font-semibold text-slate-800 border-t border-slate-100 pt-4"
      >
        Heading Level 3 (20px / 1.25rem)
      </Heading>
      <Paragraph className="text-sm text-slate-600">Subsection or group header</Paragraph>

      <Heading
        level={4}
        className="text-lg font-medium text-slate-800 border-t border-slate-100 pt-4"
      >
        Heading Level 4 (18px / 1.125rem)
      </Heading>
      <Paragraph className="text-sm text-slate-600">Deep subsection or component title</Paragraph>

      <Heading
        level={5}
        className="text-base font-semibold text-slate-700 border-t border-slate-100 pt-4"
      >
        Heading Level 5 (16px / 1rem)
      </Heading>
      <Paragraph className="text-sm text-slate-600">Minor panel or card label</Paragraph>

      <Heading
        level={6}
        className="text-sm font-semibold uppercase tracking-wider text-slate-600 border-t border-slate-100 pt-4"
      >
        Heading Level 6 (14px / 0.875rem)
      </Heading>
      <Paragraph className="text-sm text-slate-600">
        Eyebrow, category tag, or metadata header
      </Paragraph>
    </View>
  )
}

function InlineFormattingDemo() {
  return (
    <View className="max-w-2xl w-full space-y-6 rounded-2xl bg-white p-8 shadow-sm">
      <Heading
        level={2}
        className="text-xl font-bold text-slate-900 border-b border-slate-200 pb-3"
      >
        Inline Formatting Primitives
      </Heading>

      <View className="space-y-4 text-slate-800">
        <View className="flex flex-row items-baseline justify-between border-b border-slate-100 pb-2">
          <Text className="font-mono text-xs text-indigo-700 font-semibold">&lt;Strong&gt;</Text>
          <Paragraph className="text-sm">
            This sentence highlights <Strong>critical safety information</Strong> with semantic
            weight.
          </Paragraph>
        </View>

        <View className="flex flex-row items-baseline justify-between border-b border-slate-100 pb-2">
          <Text className="font-mono text-xs text-indigo-700 font-semibold">&lt;Emphasis&gt;</Text>
          <Paragraph className="text-sm">
            Authors use <Emphasis>subtle vocal emphasis</Emphasis> to convey tone.
          </Paragraph>
        </View>

        <View className="flex flex-row items-baseline justify-between border-b border-slate-100 pb-2">
          <Text className="font-mono text-xs text-indigo-700 font-semibold">&lt;Underline&gt;</Text>
          <Paragraph className="text-sm">
            Vocabulary words like <Underline>onomatopoeia</Underline> are underlined for glossary
            lookup.
          </Paragraph>
        </View>

        <View className="flex flex-row items-baseline justify-between border-b border-slate-100 pb-2">
          <Text className="font-mono text-xs text-indigo-700 font-semibold">
            &lt;Strikethrough&gt;
          </Text>
          <Paragraph className="text-sm">
            Original price: <Strikethrough className="text-slate-600">$120.00</Strikethrough>{' '}
            <Strong className="text-emerald-700 font-bold">$79.00</Strong>
          </Paragraph>
        </View>

        <View className="flex flex-row items-baseline justify-between border-b border-slate-100 pb-2">
          <Text className="font-mono text-xs text-indigo-700 font-semibold">&lt;Code&gt;</Text>
          <Paragraph className="text-sm">
            Run{' '}
            <Code className="bg-slate-100 text-indigo-700 px-1 py-0.5 rounded font-mono text-xs">
              cargo test
            </Code>{' '}
            to verify lowering.
          </Paragraph>
        </View>

        <View className="flex flex-row items-baseline justify-between border-b border-slate-100 pb-2">
          <Text className="font-mono text-xs text-indigo-700 font-semibold">&lt;Mark&gt;</Text>
          <Paragraph className="text-sm">
            Search results match{' '}
            <Mark className="bg-amber-200 text-slate-900 px-1 rounded">universal compiler</Mark>{' '}
            within query docs.
          </Paragraph>
        </View>

        <View className="flex flex-row items-baseline justify-between pb-2">
          <Text className="font-mono text-xs text-indigo-700 font-semibold">&lt;NoBreak&gt;</Text>
          <Paragraph className="text-sm">
            Preserves quantities across line wrapping:{' '}
            <NoBreak className="font-semibold text-slate-900">1,024 MB</NoBreak> or{' '}
            <NoBreak className="font-semibold text-slate-900">42 &deg;C</NoBreak>.
          </Paragraph>
        </View>
      </View>
    </View>
  )
}

function ScriptsAndAnnotationsDemo() {
  return (
    <View className="max-w-2xl w-full space-y-6 rounded-2xl bg-white p-8 shadow-sm">
      <Heading
        level={2}
        className="text-xl font-bold text-slate-900 border-b border-slate-200 pb-3"
      >
        Scripts, Ruby & Annotations
      </Heading>

      <View className="space-y-4 text-slate-800">
        <View className="space-y-1 border-b border-slate-100 pb-3">
          <Text className="font-mono text-xs text-indigo-700 font-semibold">
            Subscripts & Superscripts (&lt;Sub&gt;, &lt;Sup&gt;)
          </Text>
          <Paragraph className="text-sm leading-relaxed text-slate-700">
            Chemical reactions: 2H<Sub>2</Sub> + O<Sub>2</Sub> &rarr; 2H<Sub>2</Sub>O
          </Paragraph>
          <Paragraph className="text-sm leading-relaxed text-slate-700">
            Mathematics and physics: a<Sup>2</Sup> + b<Sup>2</Sup> = c<Sup>2</Sup>, or E = mc
            <Sup>2</Sup>
          </Paragraph>
          <Paragraph className="text-sm leading-relaxed text-slate-700">
            Citation references: The compiler removes runtime cost entirely<Sup>[42]</Sup>.
          </Paragraph>
        </View>

        <View className="space-y-1 border-b border-slate-100 pb-3">
          <Text className="font-mono text-xs text-indigo-700 font-semibold">
            East Asian Phonetic Guides (&lt;Ruby&gt;, &lt;Rt&gt;)
          </Text>
          <Paragraph className="text-base leading-loose text-slate-900">
            Japanese:{' '}
            <Ruby className="text-lg">
              東京<Rt className="text-xs text-indigo-700">とうきょう</Rt>
            </Ruby>
            へようこそ。
          </Paragraph>
          <Paragraph className="text-base leading-loose text-slate-900">
            Universal term:{' '}
            <Ruby className="text-lg">
              保蔵<Rt className="text-xs text-indigo-700">ほぞ</Rt>
            </Ruby>{' '}
            (Hozo).
          </Paragraph>
        </View>

        <View className="space-y-1 pt-1">
          <Text className="font-mono text-xs text-indigo-700 font-semibold">
            Fine Print & Legal Notices (&lt;Small&gt;)
          </Text>
          <Paragraph className="text-slate-600">
            <Small className="block">
              * Actual performance may vary based on platform target, host machine hardware, and
              browser environment.
            </Small>
            <Small className="block text-slate-600 mt-1">
              &copy; 2026 Hozo Framework Team. Licensed under the MIT License.
            </Small>
          </Paragraph>
        </View>
      </View>
    </View>
  )
}

const meta = {
  title: 'Typography',
  component: TypographyDemo,
} satisfies Meta<typeof TypographyDemo>

export default meta
export const Showcase: StoryObj<typeof meta> = {
  render: () => <TypographyDemo />,
}

export const HeadingsHierarchy: StoryObj<typeof meta> = {
  render: () => <HeadingsHierarchyDemo />,
}

export const InlineFormatting: StoryObj<typeof meta> = {
  render: () => <InlineFormattingDemo />,
}

export const ScriptsAndAnnotations: StoryObj<typeof meta> = {
  render: () => <ScriptsAndAnnotationsDemo />,
}
