import { Paragraph, View } from '@hozo/core'
import { OtpInput } from '@hozo/ui'
import { useState } from 'react'

export function OtpInputDemo() {
  const [code, setCode] = useState('')
  const [sent, setSent] = useState<string>()
  return (
    <View className="items-start gap-3">
      <OtpInput
        accessibilityLabel="Verification code"
        value={code}
        onChange={setCode}
        onComplete={setSent}
      />
      <Paragraph className="text-sm text-hozo-text-body">
        {sent ? `Checking ${sent}` : 'Waiting for 6 digits'}
      </Paragraph>
    </View>
  )
}
