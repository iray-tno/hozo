import { Text } from '@hozo/core'
import { Stack } from '@hozo/ui'

function Box({ label }: { label: string }) {
  return (
    <Text className="rounded-hozo-control bg-hozo-surface-raised px-3 py-2 text-sm text-hozo-text">
      {label}
    </Text>
  )
}

export function StackDemo() {
  return (
    <Stack gap="loose">
      <Stack direction="row" gap="tight" align="center">
        <Box label="tight" />
        <Box label="row" />
        <Box label="centred" />
      </Stack>
      <Stack gap="normal" align="start">
        <Box label="normal" />
        <Box label="column" />
        <Box label="start" />
      </Stack>
    </Stack>
  )
}
