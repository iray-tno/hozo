import { Paragraph, View } from '@hozo/core'
import { Combobox } from '@hozo/ui'
import { useState } from 'react'

const COUNTRIES = [
  { value: 'jp', label: 'Japan' },
  { value: 'jm', label: 'Jamaica' },
  { value: 'jo', label: 'Jordan' },
  { value: 'ke', label: 'Kenya' },
  { value: 'kr', label: 'South Korea' },
  { value: 'nz', label: 'New Zealand' },
]

export function ComboboxDemo() {
  const [country, setCountry] = useState<string>()
  return (
    <View className="w-full max-w-xs gap-3">
      <Combobox
        options={COUNTRIES}
        accessibilityLabel="Country"
        placeholder="Type a country"
        value={country}
        onValueChange={setCountry}
      />
      <Paragraph className="text-sm text-hozo-text-body">
        {`Chosen: ${country ?? 'nothing yet'}`}
      </Paragraph>
    </View>
  )
}
