import { Paragraph, View } from '@hozo/core'
import { Button, Field, Form, Input, Stack, useFormSubmit } from '@hozo/ui'
import { useState } from 'react'

// A Button is not a submit button, so it asks the form to submit.
function Submit() {
  const submit = useFormSubmit()
  return (
    <Button tone="accent" onPress={submit}>
      Send
    </Button>
  )
}

export function FormDemo() {
  const [email, setEmail] = useState('')
  const [tried, setTried] = useState(false)
  const [sent, setSent] = useState<string>()
  const wrong = tried && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)
  return (
    <View className="w-full max-w-md gap-3">
      <Form
        accessibilityLabel="Newsletter"
        onSubmit={() => {
          setTried(true)
          if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) setSent(email)
        }}
      >
        <Field
          label="Email"
          description="One letter a month, and nothing else."
          error={wrong ? 'That does not look like an email address.' : undefined}
          required
        >
          {(control) => (
            <Input
              {...control}
              inputMode="email"
              value={email}
              onChangeText={setEmail}
              placeholder="you@example.com"
            />
          )}
        </Field>
        <Stack direction="row" gap="tight">
          <Submit />
        </Stack>
      </Form>
      <Paragraph className="text-sm text-hozo-text-body">
        {sent ? `Subscribed ${sent}` : 'Not sent yet'}
      </Paragraph>
    </View>
  )
}
