import { Text, View } from '@hozo/core'
import { Switch } from '@hozo/ui'
import { useState } from 'react'

export function SwitchDemo() {
  const [emails, setEmails] = useState(true)
  return (
    <View className="gap-3">
      <Switch checked={emails} onCheckedChange={setEmails}>
        Email notifications
      </Switch>
      <Switch disabled>Push notifications (needs the app)</Switch>
      <Text className="text-sm text-hozo-text-muted">Emails are {emails ? 'on' : 'off'}.</Text>
    </View>
  )
}
