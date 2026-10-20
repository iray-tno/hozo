import { View } from '@hozo/core'
import { Field, TextArea } from '@hozo/ui'
import { useState } from 'react'

export function TextAreaDemo() {
  const [notes, setNotes] = useState('')
  return (
    <View className="w-full max-w-md">
      <Field label="Notes" description="Anything the courier should know.">
        {(control) => (
          <TextArea
            {...control}
            value={notes}
            onChangeText={setNotes}
            minRows={2}
            maxRows={6}
            maxLength={160}
            placeholder="Leave it with a neighbour…"
          />
        )}
      </Field>
    </View>
  )
}
