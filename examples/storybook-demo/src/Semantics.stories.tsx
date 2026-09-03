import { Text, View } from '@hozo/core'
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
  Legend,
  Main,
  Nav,
  Search,
  Section,
  Separator,
  Summary,
  Term,
  TermList,
  Time,
} from '@hozo/semantics'
import { Heading, Paragraph } from '@hozo/typography'
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

function DocumentLandmarksDemo() {
  return (
    <View className="max-w-2xl w-full space-y-6 rounded-2xl bg-white p-8 shadow-sm">
      <Heading
        level={2}
        className="text-xl font-bold text-slate-900 border-b border-slate-200 pb-3"
      >
        HTML5 Document Structure & Landmarks
      </Heading>
      <Paragraph className="text-sm text-slate-700">
        Landmarks provide screen reader navigation points and semantic structure for layout regions.
      </Paragraph>

      <View className="space-y-4 font-mono text-xs">
        <Header className="rounded-lg border-2 border-dashed border-indigo-300 bg-indigo-50 p-4 space-y-1">
          <Text className="font-bold text-indigo-900">&lt;Header&gt; (Banner Landmark)</Text>
          <Nav className="rounded border border-indigo-200 bg-white p-2 text-indigo-800">
            &lt;Nav&gt; Navigation Landmark
          </Nav>
        </Header>

        <Main className="rounded-lg border-2 border-dashed border-emerald-300 bg-emerald-50 p-4 space-y-3">
          <Text className="font-bold text-emerald-900">&lt;Main&gt; (Main Content Landmark)</Text>
          <Section className="rounded border border-emerald-200 bg-white p-3 space-y-2">
            <Text className="font-semibold text-emerald-800">
              &lt;Section&gt; Thematic Document Section
            </Text>
            <Article className="rounded border border-emerald-100 bg-slate-50 p-2 text-slate-800 font-sans text-xs">
              &lt;Article&gt; Self-contained syndicatable article block
            </Article>
          </Section>
        </Main>

        <Aside className="rounded-lg border-2 border-dashed border-amber-300 bg-amber-50 p-4 text-amber-950">
          <Text className="font-bold">&lt;Aside&gt; (Complementary Landmark / Sidebar)</Text>
        </Aside>

        <Footer className="rounded-lg border-2 border-dashed border-slate-300 bg-slate-50 p-4 text-slate-700 flex flex-row justify-between items-center">
          <Text className="font-bold text-slate-800">&lt;Footer&gt; (Contentinfo Landmark)</Text>
          <Address className="not-italic text-slate-600 font-sans">
            &lt;Address&gt; contact@hozo.dev
          </Address>
        </Footer>
      </View>
    </View>
  )
}

function DisclosuresDemo() {
  return (
    <View className="max-w-2xl w-full space-y-6 rounded-2xl bg-white p-8 shadow-sm">
      <Heading
        level={2}
        className="text-xl font-bold text-slate-900 border-b border-slate-200 pb-3"
      >
        Native Disclosures (&lt;Details&gt; & &lt;Summary&gt;)
      </Heading>
      <Paragraph className="text-sm text-slate-700">
        Zero-runtime HTML5 disclosures on Web, interactive accessible pressable widgets on React
        Native.
      </Paragraph>

      <View className="space-y-4">
        {/* Closed by default */}
        <Details className="rounded-xl border border-slate-200 overflow-hidden">
          <Summary className="bg-slate-100 px-4 py-3 text-sm font-semibold text-slate-800 cursor-pointer select-none">
            What is zero-runtime lowering?
          </Summary>
          <View className="p-4 bg-white text-sm text-slate-700 space-y-2 border-t border-slate-100">
            <Paragraph>
              Hozo analyzes components at build time and emits raw semantic HTML without bundling
              heavy disclosure component libraries.
            </Paragraph>
          </View>
        </Details>

        {/* Open by default */}
        <Details className="rounded-xl border border-slate-200 overflow-hidden" open>
          <Summary className="bg-slate-100 px-4 py-3 text-sm font-semibold text-slate-800 cursor-pointer select-none">
            Expanded by default (open=true)
          </Summary>
          <View className="p-4 bg-white text-sm text-slate-700 space-y-2 border-t border-slate-100">
            <Paragraph>
              This disclosure starts open to immediately reveal secondary settings or onboarding
              guides.
            </Paragraph>
            <Paragraph className="text-xs text-slate-600">
              On React Native, defaultOpen={true} initializes the component in the expanded state.
            </Paragraph>
          </View>
        </Details>
      </View>
    </View>
  )
}

function FormGroupingDemo() {
  return (
    <View className="max-w-2xl w-full space-y-6 rounded-2xl bg-white p-8 shadow-sm">
      <Heading
        level={2}
        className="text-xl font-bold text-slate-900 border-b border-slate-200 pb-3"
      >
        Form Grouping (&lt;Fieldset&gt; & &lt;Legend&gt;)
      </Heading>
      <Paragraph className="text-sm text-slate-700">
        Fieldset associates a caption (Legend) with grouped input controls for assistive
        technologies.
      </Paragraph>

      <View className="space-y-6">
        <Fieldset className="rounded-xl border border-slate-200 p-5 space-y-3">
          <Legend className="px-2 text-sm font-bold text-slate-800">Notification Delivery</Legend>
          <View className="space-y-2 text-sm text-slate-800">
            <Text className="block">&bull; In-app push notifications</Text>
            <Text className="block">&bull; Real-time webhook events</Text>
          </View>
        </Fieldset>

        <Fieldset className="rounded-xl border border-slate-200 p-5 space-y-3">
          <Legend className="px-2 text-sm font-bold text-slate-800">Security Authentication</Legend>
          <View className="space-y-2 text-sm text-slate-800">
            <Text className="block">&bull; Passkeys (FIDO2 WebAuthn)</Text>
            <Text className="block">&bull; Hardware security key required</Text>
          </View>
        </Fieldset>
      </View>
    </View>
  )
}

function TermListsDemo() {
  return (
    <View className="max-w-2xl w-full space-y-6 rounded-2xl bg-white p-8 shadow-sm">
      <Heading
        level={2}
        className="text-xl font-bold text-slate-900 border-b border-slate-200 pb-3"
      >
        Term Lists (&lt;TermList&gt;, &lt;Term&gt;, &lt;Description&gt;)
      </Heading>
      <Paragraph className="text-sm text-slate-700">
        Description lists for key-value pairs, specifications, and metadata (1-to-1 and 1-to-many).
      </Paragraph>

      <View className="space-y-6">
        {/* 1-to-1 Pairs */}
        <View className="space-y-2">
          <Heading level={3} className="text-sm font-bold text-slate-800">
            1-to-1 Metadata Pairs (Horizontal Flexbox)
          </Heading>
          <TermList className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm">
            <View className="py-2 flex flex-row justify-between items-center">
              <Term className="font-semibold text-slate-800">Compiler Core</Term>
              <Description className="text-slate-900">Rust (hozo_web / hozo_native)</Description>
            </View>
            <View className="py-2 flex flex-row justify-between items-center">
              <TermList.Term className="font-semibold text-slate-800">Module Target</TermList.Term>
              <TermList.Description className="text-slate-900 font-mono text-xs">
                ESNext / CommonJS
              </TermList.Description>
            </View>
          </TermList>
        </View>

        {/* 1-to-Many Multi-Value */}
        <View className="space-y-2">
          <Heading level={3} className="text-sm font-bold text-slate-800">
            1-to-Many Multi-Value List
          </Heading>
          <TermList className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm space-y-2">
            <Term className="font-bold text-slate-900 text-sm">Core Architecture Contributors</Term>
            <Description className="text-slate-700 pl-4 border-l-2 border-indigo-400">
              Component System Specification
            </Description>
            <Description className="text-slate-700 pl-4 border-l-2 border-indigo-400">
              Style IR & Zero-Runtime Lowering Engine
            </Description>
            <Description className="text-slate-700 pl-4 border-l-2 border-indigo-400">
              Universal React Native Accessibility Bridge
            </Description>
          </TermList>
        </View>
      </View>
    </View>
  )
}

function SeparatorsDemo() {
  return (
    <View className="max-w-2xl w-full space-y-6 rounded-2xl bg-white p-8 shadow-sm">
      <Heading
        level={2}
        className="text-xl font-bold text-slate-900 border-b border-slate-200 pb-3"
      >
        Separators & Dividers (&lt;Separator&gt;)
      </Heading>
      <Paragraph className="text-sm text-slate-700">
        Lowers directly to native semantic &lt;hr&gt; on Web and accessible separator View on React
        Native.
      </Paragraph>

      <View className="space-y-6">
        {/* Horizontal Separator */}
        <View className="space-y-3">
          <Heading level={3} className="text-sm font-bold text-slate-800">
            Standard Horizontal Separator
          </Heading>
          <Paragraph className="text-xs text-slate-600">Upper thematic content block.</Paragraph>
          <Separator className="border-slate-200" />
          <Paragraph className="text-xs text-slate-600">
            Lower thematic content block divided by semantic &lt;hr&gt;.
          </Paragraph>
        </View>

        {/* Vertical Separator in Toolbar / Inline List */}
        <View className="space-y-3 pt-2">
          <Heading level={3} className="text-sm font-bold text-slate-800">
            Vertical Inline Separator
          </Heading>
          <View className="flex flex-row items-center rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm font-medium text-slate-700">
            <Text className="hover:text-slate-900 cursor-pointer">File</Text>
            <Separator orientation="vertical" className="h-4 border-slate-300 mx-4" />
            <Text className="hover:text-slate-900 cursor-pointer">Edit</Text>
            <Separator orientation="vertical" className="h-4 border-slate-300 mx-4" />
            <Text className="hover:text-slate-900 cursor-pointer">View</Text>
            <Separator orientation="vertical" className="h-4 border-slate-300 mx-4" />
            <Text className="hover:text-slate-900 cursor-pointer">Help</Text>
          </View>
        </View>

        {/* Decorative Separator */}
        <View className="space-y-3 pt-2">
          <Heading level={3} className="text-sm font-bold text-slate-800">
            Decorative Break (Hidden from Screen Readers)
          </Heading>
          <Paragraph className="text-xs text-slate-600">
            Sets aria-hidden=&quot;true&quot; and role=&quot;none&quot; so assistive tech ignores
            purely visual lines.
          </Paragraph>
          <Separator decorative className="border-indigo-200" />
        </View>
      </View>
    </View>
  )
}

const meta = {
  title: 'Semantics',
  component: SemanticsDemo,
} satisfies Meta<typeof SemanticsDemo>

export default meta
export const Showcase: StoryObj<typeof meta> = {
  render: () => <SemanticsDemo />,
}

export const DocumentLandmarks: StoryObj<typeof meta> = {
  render: () => <DocumentLandmarksDemo />,
}

export const Disclosures: StoryObj<typeof meta> = {
  render: () => <DisclosuresDemo />,
}

export const FormGrouping: StoryObj<typeof meta> = {
  render: () => <FormGroupingDemo />,
}

export const Separators: StoryObj<typeof meta> = {
  render: () => <SeparatorsDemo />,
}

export const TermLists: StoryObj<typeof meta> = {
  render: () => <TermListsDemo />,
}
