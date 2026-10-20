import { Paragraph, View } from '@hozo/core'
import { Menu } from '@hozo/ui'
import { useState } from 'react'

export function MenuDemo() {
  const [last, setLast] = useState('nothing yet')
  return (
    <View className="items-start gap-3">
      <Menu
        trigger="Actions"
        items={[
          { label: 'Rename', onSelect: () => setLast('Rename') },
          { label: 'Duplicate', onSelect: () => setLast('Duplicate') },
          { label: 'Archive', disabled: true },
        ]}
      />
      <Paragraph className="text-sm text-hozo-text-body">{`Chosen: ${last}`}</Paragraph>
    </View>
  )
}
