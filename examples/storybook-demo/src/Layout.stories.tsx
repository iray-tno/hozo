import {
  Article,
  FlatList,
  Heading,
  List,
  ListItem,
  Nav,
  Paragraph,
  Section,
  Text,
  View,
} from '@hozo/core'
import type { Meta, StoryObj } from '@storybook/react-vite'

function LayoutGallery() {
  const sampleItems = [
    { id: '1', title: 'Compiler Pass 1', desc: 'TSX AST parsing with oxc' },
    { id: '2', title: 'Compiler Pass 2', desc: 'Style IR & Semantic IR synthesis' },
    { id: '3', title: 'Compiler Pass 3', desc: 'Target Lowering (DOM / Fabric)' },
  ]

  return (
    <View className="max-w-2xl w-full space-y-8 rounded-2xl bg-white p-8 shadow-sm">
      {/* Landmarks */}
      <Section className="space-y-4 rounded-xl border border-slate-200 p-6">
        <Nav className="flex flex-row flex-wrap items-center gap-2 text-xs font-semibold text-indigo-600">
          <Text className="hover:underline cursor-pointer">Home</Text>
          <Text className="text-slate-300">/</Text>
          <Text className="hover:underline cursor-pointer">Documentation</Text>
          <Text className="text-slate-300">/</Text>
          <Text className="text-slate-600">Landmarks</Text>
        </Nav>

        <Article className="space-y-2">
          <Heading level={2} className="text-xl font-bold text-slate-900">
            Semantic Article Landmark
          </Heading>
          <Paragraph className="text-sm leading-relaxed text-slate-600">
            Rendered inside a semantic &lt;article&gt; element with accessible landmark navigation
            roles automatically mapped on Native.
          </Paragraph>
        </Article>
      </Section>

      {/* Lists */}
      <View className="space-y-4">
        <Heading level={3} className="text-lg font-bold text-slate-900">
          Ordered & Unordered Lists
        </Heading>
        <List ordered className="list-decimal pl-6 space-y-2 text-sm text-slate-700">
          <ListItem className="pl-1">First item in an ordered sequence</ListItem>
          <ListItem className="pl-1">Second item with automatic semantic tagging</ListItem>
          <ListItem className="pl-1">Third item preserving React Native list structure</ListItem>
        </List>
      </View>

      {/* FlatList */}
      <View className="space-y-4 border-t border-slate-200 pt-6">
        <Heading level={3} className="text-lg font-bold text-slate-900">
          FlatList Rendering
        </Heading>
        <FlatList
          data={sampleItems}
          keyExtractor={(item) => item.id}
          className="divide-y divide-slate-100 rounded-xl border border-slate-200 overflow-hidden"
          renderItem={({ item }) => (
            <View className="p-4 hover:bg-slate-50 transition-colors">
              <Text className="font-semibold text-slate-900">{item.title}</Text>
              <Paragraph className="mt-1 text-xs text-slate-500">{item.desc}</Paragraph>
            </View>
          )}
        />
      </View>
    </View>
  )
}

const meta = {
  title: 'Core/Layout & Lists',
  component: LayoutGallery,
} satisfies Meta<typeof LayoutGallery>

export default meta
export const Default: StoryObj<typeof meta> = {}
