import { Paragraph, View } from '@hozo/core'
import { Listbox } from '@hozo/ui'
import { useState } from 'react'

const LANGUAGES = [
  { value: 'rust', label: 'Rust' },
  { value: 'ts', label: 'TypeScript' },
  { value: 'go', label: 'Go' },
  { value: 'cobol', label: 'COBOL', disabled: true },
] as const

export function ListboxDemo() {
  const [chosen, setChosen] = useState<readonly string[]>(['rust'])
  return (
    <View className="w-full max-w-xs gap-3">
      <Listbox<string>
        options={LANGUAGES}
        accessibilityLabel="Languages"
        multiple
        value={chosen}
        onValueChange={setChosen}
      />
      <Paragraph className="text-sm text-hozo-text-body">
        {`Chosen: ${chosen.join(', ') || 'none'}`}
      </Paragraph>
    </View>
  )
}
