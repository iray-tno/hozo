import { View } from '@hozo/core'
import { Button, Stack, Stepper } from '@hozo/ui'
import { useState } from 'react'

const STEPS = [
  { label: 'Cart', description: 'Two items' },
  { label: 'Address' },
  { label: 'Payment' },
  { label: 'Review' },
]

export function StepperDemo() {
  const [active, setActive] = useState(1)
  return (
    <View className="items-start gap-4">
      <Stepper steps={STEPS} activeStep={active} onStepPress={setActive} />
      <Stack direction="row" gap="tight">
        <Button tone="quiet" disabled={active === 0} onPress={() => setActive((step) => step - 1)}>
          Back
        </Button>
        <Button
          tone="accent"
          disabled={active === STEPS.length - 1}
          onPress={() => setActive((step) => step + 1)}
        >
          Next
        </Button>
      </Stack>
    </View>
  )
}
