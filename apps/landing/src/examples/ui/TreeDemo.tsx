import { Paragraph, View } from '@hozo/core'
import { Tree, type TreeNode } from '@hozo/ui'
import { useState } from 'react'

const FILES: readonly TreeNode[] = [
  {
    id: 'crates',
    label: 'crates',
    children: [
      { id: 'ir', label: 'hozo_ir' },
      { id: 'web', label: 'hozo_web', children: [{ id: 'css', label: 'css.rs' }] },
    ],
  },
  { id: 'packages', label: 'packages', children: [{ id: 'ui', label: 'ui' }] },
  { id: 'readme', label: 'README.md' },
]

export function TreeDemo() {
  const [selected, setSelected] = useState('readme')
  return (
    <View className="w-full max-w-xs gap-3">
      <Tree
        nodes={FILES}
        accessibilityLabel="Repository"
        defaultExpanded={['crates']}
        selectedId={selected}
        onSelect={setSelected}
      />
      <Paragraph className="text-sm text-hozo-text-body">{`Selected: ${selected}`}</Paragraph>
    </View>
  )
}
