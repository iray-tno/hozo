import { View } from '@hozo/core'
import { Alert, Button } from '@hozo/ui'
import { useState } from 'react'

export function AlertDemo() {
  const [saved, setSaved] = useState(false)
  return (
    <View className="w-full max-w-md gap-3">
      <Alert>A notice that is simply on the page, and is not announced.</Alert>
      <View className="flex-row">
        <Button tone="accent" size="sm" onPress={() => setSaved(true)}>
          Save draft
        </Button>
      </View>
      {saved ? (
        <Alert tone="accent" live="polite">
          Draft saved.
        </Alert>
      ) : null}
      <Alert tone="danger">Your session expires in two minutes.</Alert>
    </View>
  )
}
