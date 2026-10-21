import { Paragraph, View } from '@hozo/core'
import { Button, Toolbar } from '@hozo/ui'
import { useState } from 'react'

export function ToolbarDemo() {
  const [last, setLast] = useState('nothing yet')
  return (
    <View className="items-start gap-3">
      <Toolbar
        accessibilityLabel="Formatting"
        items={[
          {
            render: (props) => (
              <Button {...props} tone="quiet" size="sm" onPress={() => setLast('Bold')}>
                Bold
              </Button>
            ),
          },
          {
            render: (props) => (
              <Button {...props} tone="quiet" size="sm" onPress={() => setLast('Italic')}>
                Italic
              </Button>
            ),
          },
          {
            disabled: true,
            render: (props) => (
              <Button {...props} tone="quiet" size="sm" disabled>
                Strikethrough
              </Button>
            ),
          },
        ]}
      />
      <Paragraph className="text-sm text-hozo-text-body">{`Pressed: ${last}`}</Paragraph>
    </View>
  )
}
