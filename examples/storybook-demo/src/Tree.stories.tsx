// A tree view, which is the pattern where the accessible markup and the
// visible markup disagree most.
//
// The indentation is CSS, and CSS is exactly what a screen reader does not
// read. What carries the shape is `aria-level`, `aria-posinset` and
// `aria-setsize` on each row -- without them the tree looks identical and
// announces as a flat list.
//
// Keyboard: Up and Down move between *visible* rows, Right opens a branch
// or steps into it, Left closes it or steps out to the parent, and typing
// a letter jumps to the next row starting with it.

import { Heading, Paragraph, Text, Tree, type TreeNode, View } from '@hozo/core'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'

// One class per depth rather than a computed `padding-inline-start`.
// Written out because the compiler reads class *names*: a template literal
// assembling `ps-${level * 4}` produces a class nothing has emitted CSS
// for. Logical rather than `pl-`, so the tree indents the other way in an
// RTL locale without a second rule.
const INDENT = ['ps-0', 'ps-5', 'ps-10', 'ps-15'] as const

const NODES: readonly TreeNode[] = [
  {
    id: 'crates',
    label: 'crates',
    children: [
      { id: 'hozo_ir', label: 'hozo_ir' },
      { id: 'hozo_parser', label: 'hozo_parser' },
      {
        id: 'hozo_web',
        label: 'hozo_web',
        children: [
          { id: 'css', label: 'css.rs' },
          { id: 'markup', label: 'markup.rs' },
        ],
      },
      { id: 'hozo_native', label: 'hozo_native' },
    ],
  },
  {
    id: 'packages',
    label: 'packages',
    children: [
      { id: 'compiler', label: '@hozo/compiler' },
      { id: 'core', label: '@hozo/core' },
      { id: 'behaviors', label: '@hozo/behaviors' },
      // A row that is present, announced, and not a stop. The keyboard
      // skips it; a screen reader still counts it in `aria-setsize`,
      // because a list of four that announces as three is a lie.
      { id: 'legacy', label: '@hozo/legacy (unmaintained)', disabled: true },
    ],
  },
]

function TreeDemo() {
  const [selected, setSelected] = useState('hozo_web')
  return (
    <View className="w-full max-w-2xl space-y-6 rounded-2xl bg-white p-8 shadow-sm">
      <View className="space-y-2">
        <Heading level={2} className="text-xl font-bold text-slate-900">
          Tree
        </Heading>
        <Paragraph className="text-sm leading-relaxed text-slate-600">
          Arrow keys move and open; typing a letter jumps. The indentation you can see is CSS — the
          depth a screen reader hears is
          <Text className="font-mono text-xs"> aria-level</Text>, which this sets on every row.
        </Paragraph>
      </View>

      <Tree
        nodes={NODES}
        defaultExpanded={['crates', 'packages']}
        selectedId={selected}
        onSelect={setSelected}
        accessibilityLabel="Repository"
        className="rounded-xl border border-slate-200 p-2"
        rowClassName="rounded-md px-2 py-1.5 text-sm text-slate-700 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 aria-selected:bg-indigo-50 aria-selected:font-semibold aria-selected:text-indigo-700"
        renderRow={({ label, level, expanded }) => (
          // The indentation is the caller's to draw, deliberately: a tree
          // that owned its own spacing would be a tree with an opinion
          // about type scale.
          <Text className={INDENT[Math.min(level - 1, INDENT.length - 1)]}>
            {expanded ? '▾ ' : '\u00a0\u00a0'}
            {label}
          </Text>
        )}
      />

      <Text className="text-xs text-slate-500">
        Selected: <Text className="font-mono">{selected}</Text>
      </Text>
    </View>
  )
}

const meta = {
  title: 'A11y/Tree',
  component: TreeDemo,
} satisfies Meta<typeof TreeDemo>

export default meta

export const Default: StoryObj<typeof meta> = {}
