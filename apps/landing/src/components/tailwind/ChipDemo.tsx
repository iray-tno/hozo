import { Paragraph, Text, View } from '@hozo/core'
import { useState } from 'react'
import { Chip } from './Chip.tsx'

const TARGETS = ['Web', 'iOS', 'Android'] as const

// The sample on the /tailwind/ page, running. The source and compiler output
// shown beside it are of `Chip.tsx` itself, so what you press here is the
// thing being described.
export function ChipDemo() {
  const [picked, setPicked] = useState<readonly string[]>(['Web'])
  const toggle = (target: string) =>
    setPicked((current) =>
      current.includes(target) ? current.filter((t) => t !== target) : [...current, target],
    )
  return (
    <View className="gap-4 mb-6">
      <View className="flex flex-row flex-wrap gap-2">
        {TARGETS.map((target) => (
          <Chip
            key={target}
            label={target}
            selected={picked.includes(target)}
            onPress={() => toggle(target)}
            className="shrink-0"
          />
        ))}
      </View>
      <Paragraph className="text-xs font-mono text-stone-400">
        Building for:{' '}
        <Text className="text-shikkui">
          {picked.length ? TARGETS.filter((t) => picked.includes(t)).join(', ') : 'nothing yet'}
        </Text>
      </Paragraph>
    </View>
  )
}
