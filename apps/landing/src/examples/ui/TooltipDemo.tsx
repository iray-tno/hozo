import { Button, Stack, Tooltip } from '@hozo/ui'

export function TooltipDemo() {
  return (
    <Stack direction="row" gap="tight" align="center">
      <Tooltip content="Saves without leaving the page">
        <Button tone="neutral">Save</Button>
      </Tooltip>
      <Tooltip content="Copies a link anyone in the team can open">
        <Button tone="quiet">Share</Button>
      </Tooltip>
    </Stack>
  )
}
