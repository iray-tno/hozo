import { Field, Input } from '@hozo/ui'
import { useState } from 'react'

export function InputDemo() {
  const [email, setEmail] = useState('')
  const wrong = email !== '' && !/^\S+@\S+\.\S+$/.test(email)
  return (
    <Field
      label="Email"
      description="We use it for the receipt and nothing else."
      error={wrong ? 'That does not look like an email address.' : undefined}
      required
    >
      {(control) => <Input {...control} inputMode="email" value={email} onChangeText={setEmail} />}
    </Field>
  )
}
