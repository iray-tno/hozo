import { Button, Heading, Paragraph, Text, View } from '@hozo/core'
import { Progress, Separator } from '@hozo/semantics'
import { Code, Rt, Ruby } from '@hozo/typography'

export function Welcome() {
  return (
    <View className="max-w-3xl w-full rounded-2xl bg-white p-8 shadow-sm space-y-8">
      {/* Hero Banner */}
      <View className="space-y-3 border-b border-slate-200 pb-6">
        <View className="flex flex-row items-center gap-3">
          <Heading level={1} className="text-3xl font-extrabold text-slate-900 tracking-tight">
            Hozo Storybook
          </Heading>
          <View className="rounded-full bg-indigo-100 px-3 py-0.5 text-xs font-bold text-indigo-700">
            Design System
          </View>
        </View>
        <Paragraph className="text-base text-slate-700 leading-relaxed">
          Zero-runtime universal UI framework named after traditional Japanese joinery{' '}
          <Ruby className="font-semibold text-slate-900">
            枘<Rt className="text-xs text-indigo-700 font-bold">ほぞ</Rt>
          </Ruby>{' '}
          (mortise &amp; tenon). Compiles JSX directly to native HTML5 semantic elements and React
          Native Fabric components with zero runtime overhead.
        </Paragraph>
        <View className="flex flex-row items-center gap-3 pt-2">
          <Button
            href="https://github.com/iray-tno/hozo"
            external
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 transition-colors"
          >
            GitHub Repository &rarr;
          </Button>
          <Button
            href="https://github.com/iray-tno/hozo/blob/main/docs/proposal.md"
            external
            className="rounded-lg bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-200 transition-colors"
          >
            Architecture Specification
          </Button>
        </View>
      </View>

      {/* Architecture Layer Map */}
      <View className="space-y-4">
        <Heading level={2} className="text-lg font-bold text-slate-900">
          Component Architecture &amp; Domain Packages
        </Heading>
        <Paragraph className="text-sm text-slate-600">
          Hozo structures universal UI across clean, orthogonal package boundaries:
        </Paragraph>

        <View className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
          {/* Typography */}
          <View className="rounded-xl border border-slate-200 bg-slate-50 p-5 space-y-2">
            <View className="flex flex-row items-center justify-between">
              <Text className="font-mono text-xs font-bold text-indigo-700">@hozo/typography</Text>
              <Text className="text-xs font-semibold text-slate-500">Layer 1</Text>
            </View>
            <Heading level={3} className="text-sm font-bold text-slate-900">
              Universal Typography &amp; Ruby
            </Heading>
            <Paragraph className="text-xs text-slate-600 leading-relaxed">
              Semantics-preserving text formatting (<Code>Heading</Code>, <Code>Strong</Code>,{' '}
              <Code>Code</Code>, <Code>Mark</Code>), universal <Code>Link</Code>, and CJK phonetic{' '}
              <Code>Ruby</Code> annotations.
            </Paragraph>
          </View>

          {/* Semantics */}
          <View className="rounded-xl border border-slate-200 bg-slate-50 p-5 space-y-2">
            <View className="flex flex-row items-center justify-between">
              <Text className="font-mono text-xs font-bold text-indigo-700">@hozo/semantics</Text>
              <Text className="text-xs font-semibold text-slate-500">Layer 1</Text>
            </View>
            <Heading level={3} className="text-sm font-bold text-slate-900">
              Document Structure &amp; Indicators
            </Heading>
            <Paragraph className="text-xs text-slate-600 leading-relaxed">
              HTML5 landmarks (<Code>Main</Code>, <Code>Header</Code>, <Code>Nav</Code>),{' '}
              <Code>Details</Code> disclosures, <Code>Separator</Code>, and accessible{' '}
              <Code>Progress</Code> indicators.
            </Paragraph>
          </View>

          {/* Core */}
          <View className="rounded-xl border border-slate-200 bg-slate-50 p-5 space-y-2">
            <View className="flex flex-row items-center justify-between">
              <Text className="font-mono text-xs font-bold text-indigo-700">@hozo/core</Text>
              <Text className="text-xs font-semibold text-slate-500">Layer 1 &amp; 3</Text>
            </View>
            <Heading level={3} className="text-sm font-bold text-slate-900">
              Primitives &amp; Universal Components
            </Heading>
            <Paragraph className="text-xs text-slate-600 leading-relaxed">
              Zero-runtime foundation (<Code>View</Code>, <Code>Text</Code>, <Code>Pressable</Code>,{' '}
              <Code>FlatList</Code>) plus accessible compound components (<Code>Dialog</Code>,{' '}
              <Code>Tabs</Code>, <Code>Menu</Code>, <Code>Toolbar</Code>, <Code>Popover</Code>).
            </Paragraph>
          </View>

          {/* Behaviors */}
          <View className="rounded-xl border border-slate-200 bg-slate-50 p-5 space-y-2">
            <View className="flex flex-row items-center justify-between">
              <Text className="font-mono text-xs font-bold text-indigo-700">@hozo/behaviors</Text>
              <Text className="text-xs font-semibold text-slate-500">Layer 2</Text>
            </View>
            <Heading level={3} className="text-sm font-bold text-slate-900">
              Headless Behaviors &amp; Positioning
            </Heading>
            <Paragraph className="text-xs text-slate-600 leading-relaxed">
              Universal headless mechanics: <Code>FocusScope</Code>, <Code>DismissableLayer</Code>,{' '}
              <Code>FloatingPositioner</Code>, <Code>LiveRegion</Code>, <Code>useHoverTrigger</Code>{' '}
              with safe polygon bridges, and delay warmup <Code>Tooltip</Code>.
            </Paragraph>
          </View>
        </View>
      </View>

      <Separator className="border-slate-200" />

      {/* Feature Highlights & Status */}
      <View className="space-y-4">
        <Heading level={2} className="text-base font-bold text-slate-900">
          Catalog Quality Standards
        </Heading>
        <View className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
          <View className="flex flex-row items-center justify-between text-xs font-semibold text-slate-700">
            <Text>Automated a11y Audit (axe-core)</Text>
            <Text className="font-bold text-emerald-700">0 Violations (39/39 Stories)</Text>
          </View>
          <Progress
            value={100}
            max={100}
            aria-label="Automated accessibility audit pass rate"
            className="w-full h-2.5 accent-emerald-600 rounded-full"
          />
          <Paragraph className="text-xs text-slate-600 pt-1">
            All 39 stories continuously pass axe-core in CI to prevent automated regressions in
            color contrast, ARIA role syntax, and missing labels. Complete accessibility conformance
            further requires ongoing empirical testing with screen readers (VoiceOver, TalkBack,
            NVDA).
          </Paragraph>
        </View>
      </View>
    </View>
  )
}
