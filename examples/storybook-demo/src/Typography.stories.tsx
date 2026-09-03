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

const meta = {
  title: 'Typography/Showcase',
  component: TypographyDemo,
} satisfies Meta<typeof TypographyDemo>

export default meta
export const Default: StoryObj<typeof meta> = {}
