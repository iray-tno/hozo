import { Heading, Paragraph, View } from '@hozo/core'
import { Button, Card } from '@hozo/ui'
import { useState } from 'react'

export function CardDemo() {
  const [saved, setSaved] = useState(false)
  return (
    <View className="gap-4">
      <Card>
        <View className="gap-3">
          <Heading level={3} className="text-lg font-bold text-hozo-text">
            Weekly report
          </Heading>
          <Paragraph className="text-sm text-hozo-text-body">
            Sent every Monday at nine, to the people on this project.
          </Paragraph>
          <View className="flex-row gap-2">
            <Button tone="accent" size="sm" onPress={() => setSaved(true)}>
              {saved ? 'Saved' : 'Save'}
            </Button>
          </View>
        </View>
      </Card>
      <Card flat>
        <Paragraph className="text-sm text-hozo-text-body">
          A flat card, for one that sits inside another surface.
        </Paragraph>
      </Card>
    </View>
  )
}
