import {
  Address,
  Article,
  Aside,
  Description,
  Details,
  Fieldset,
  Figcaption,
  Figure,
  Footer,
  Header,
  Heading,
  Legend,
  Main,
  Nav,
  Paragraph,
  Search,
  Section,
  Summary,
  Term,
  TermList,
  Text,
  Time,
  View,
} from '@hozo/core'
import type { Meta, StoryObj } from '@storybook/react-vite'

function SemanticsDemo() {
  return (
    <View className="max-w-3xl w-full space-y-10 rounded-2xl bg-white p-8 shadow-sm">
      {/* Page Header Landmark */}
      <Header className="border-b border-slate-200 pb-6 space-y-3">
        <View className="flex flex-row items-center justify-between">
          <Heading level={1} className="text-2xl font-extrabold text-slate-900 tracking-tight">
            Hozo Semantic Showcase
          </Heading>
          <Search className="text-sm text-slate-700">
            <Text className="bg-slate-100 px-2 py-1 rounded border border-slate-200">
              Quick Search (Ctrl+K)
            </Text>
          </Search>
        </View>
        <Nav className="flex flex-row space-x-4 text-sm font-medium text-slate-700">
          <Text className="text-indigo-700 font-semibold">Overview</Text>
          <Text className="hover:text-slate-900">Landmarks</Text>
          <Text className="hover:text-slate-900">Forms</Text>
          <Text className="hover:text-slate-900">Term Lists</Text>
        </Nav>
      </Header>

      {/* Main Landmark */}
      <Main className="space-y-8">
        {/* Section & Article */}
        <Section className="space-y-4">
          <Heading level={2} className="text-xl font-bold text-slate-900">
            Article & Figures
          </Heading>
          <Article className="rounded-xl border border-slate-200 bg-slate-50 p-6 space-y-4">
            <View className="flex flex-row items-center justify-between text-xs text-slate-600">
              <Text className="font-semibold text-indigo-700 uppercase tracking-wider">
                Architecture Note
              </Text>
              <Time dateTime="2026-09-03">September 3, 2026</Time>
            </View>
            <Heading level={3} className="text-lg font-bold text-slate-800">
              Universal Document Semantics
            </Heading>
            <Paragraph className="text-sm leading-relaxed text-slate-700">
              Semantic primitives lower directly to HTML5 structural landmarks on Web and accessible
              Views on React Native without runtime overhead.
            </Paragraph>
            <Figure className="rounded-lg border border-slate-200 bg-white p-4 space-y-2">
              <View className="h-16 rounded bg-indigo-50 border border-indigo-100 flex items-center justify-center">
                <Text className="text-xs font-mono text-indigo-900 font-semibold">
                  Style IR &rarr; Lowered Output
                </Text>
              </View>
              <Figcaption className="text-xs text-slate-600 text-center">
                Figure 1: Hozo compilation pipeline visualization
              </Figcaption>
            </Figure>
          </Article>
        </Section>

        {/* Aside Landmark */}
        <Aside className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950 space-y-1">
          <Heading level={4} className="font-semibold text-amber-950">
            Complementary Note
          </Heading>
          <Paragraph className="text-xs text-amber-900">
            Lowered to &lt;aside&gt; on Web and role=&quot;complementary&quot; on React Native.
          </Paragraph>
        </Aside>

        {/* Structural Form: Fieldset & Legend */}
        <Section className="space-y-4 border-t border-slate-200 pt-6">
          <Heading level={2} className="text-xl font-bold text-slate-900">
            Form Grouping (Fieldset & Legend)
          </Heading>
          <Fieldset className="rounded-xl border border-slate-200 p-5 space-y-3">
            <Legend className="px-2 text-sm font-bold text-slate-800">
              Notification Preferences
            </Legend>
            <Paragraph className="text-sm text-slate-700">
              Fieldset groups related form inputs with an accessible caption.
            </Paragraph>
            <View className="space-y-2 text-sm text-slate-800">
              <Text className="block">&bull; Push Notifications: Enabled</Text>
              <Text className="block">&bull; Email Digest: Weekly</Text>
            </View>
          </Fieldset>
        </Section>

        {/* Disclosure: Details & Summary */}
        <Section className="space-y-4 border-t border-slate-200 pt-6">
          <Heading level={2} className="text-xl font-bold text-slate-900">
            Native Disclosure (Details & Summary)
          </Heading>
          <Details className="rounded-xl border border-slate-200 overflow-hidden" open>
            <Summary className="bg-slate-100 px-4 py-3 text-sm font-semibold text-slate-800 cursor-pointer select-none">
              Click to toggle component architecture details
            </Summary>
            <View className="p-4 bg-white text-sm text-slate-700 space-y-2">
              <Paragraph>
                On Web, this uses native zero-runtime &lt;details&gt; and &lt;summary&gt; elements.
              </Paragraph>
              <Paragraph className="text-xs text-slate-600">
                On React Native, it provides interactive toggle state via an accessible Pressable
                with expanded state.
              </Paragraph>
            </View>
          </Details>
        </Section>

        {/* Term Lists (TermList, Term, Description) */}
        <Section className="space-y-4 border-t border-slate-200 pt-6">
          <Heading level={2} className="text-xl font-bold text-slate-900">
            Term Lists (Metadata & Specifications)
          </Heading>
          <TermList className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm">
            <View className="py-2 flex flex-row justify-between items-center">
              <Term className="font-semibold text-slate-800">Project Engine</Term>
              <Description className="text-slate-900">Rust (hozo_web / hozo_native)</Description>
            </View>
            <View className="py-2 flex flex-row justify-between items-center">
              <TermList.Term className="font-semibold text-slate-800">
                Target Frameworks
              </TermList.Term>
              <TermList.Description className="text-slate-900">
                React, Next.js, React Native
              </TermList.Description>
            </View>
            <View className="py-2 flex flex-row justify-between items-center">
              <TermList.Term className="font-semibold text-slate-800">License</TermList.Term>
              <TermList.Description className="text-slate-900 font-mono text-xs bg-slate-200 px-1.5 py-0.5 rounded">
                MIT
              </TermList.Description>
            </View>
          </TermList>
        </Section>
      </Main>

      {/* Footer Landmark & Address */}
      <Footer className="border-t border-slate-200 pt-6 flex flex-row items-center justify-between text-xs text-slate-600">
        <Text>&copy; 2026 Hozo Framework Project</Text>
        <Address className="not-italic">
          Contact: <Text className="text-indigo-700">team@hozo.dev</Text>
        </Address>
      </Footer>
    </View>
  )
}

const meta = {
  title: 'Core/Semantics',
  component: SemanticsDemo,
} satisfies Meta<typeof SemanticsDemo>

export default meta
export const Default: StoryObj<typeof meta> = {}
