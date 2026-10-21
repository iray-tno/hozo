import { Paragraph, View } from '@hozo/core'
import { Button, CommandPalette } from '@hozo/ui'
import { useState } from 'react'

export function CommandPaletteDemo() {
  const [open, setOpen] = useState(false)
  const [last, setLast] = useState('nothing yet')
  const run = (name: string) => () => setLast(name)
  return (
    <View className="items-start gap-3">
      <Button tone="neutral" onPress={() => setOpen(true)}>
        Open the command palette
      </Button>
      <CommandPalette
        open={open}
        onOpenChange={setOpen}
        placeholder="Type a command or search"
        commands={[
          {
            id: 'new',
            label: 'New file',
            group: 'File',
            shortcut: 'Ctrl N',
            onSelect: run('New file'),
          },
          { id: 'open', label: 'Open recent', group: 'File', onSelect: run('Open recent') },
          {
            id: 'theme',
            label: 'Toggle dark mode',
            group: 'View',
            keywords: ['theme', 'colour'],
            onSelect: run('Toggle dark mode'),
          },
          { id: 'zoom', label: 'Zoom in', group: 'View', disabled: true, onSelect: run('Zoom in') },
        ]}
      />
      <Paragraph className="text-sm text-hozo-text-body">{`Ran: ${last}`}</Paragraph>
    </View>
  )
}
