import { View } from '@hozo/core'
import { Accordion } from '@hozo/ui'

const QUESTIONS = [
  { id: 'shipping', header: 'When does it arrive?', content: 'Two days, or four to an island.' },
  { id: 'returns', header: 'Can I send it back?', content: 'Within thirty days, unopened.' },
  { id: 'wrap', header: 'Gift wrapping', content: 'Not yet.', disabled: true },
]

export function AccordionDemo() {
  return (
    <View className="w-full max-w-md">
      <Accordion items={QUESTIONS} accessibilityLabel="Questions" defaultExpanded="shipping" />
    </View>
  )
}
