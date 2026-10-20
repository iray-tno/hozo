import { Heading, Paragraph } from '@hozo/core'
import { BottomSheet, Button, Stack } from '@hozo/ui'
import { useState } from 'react'

export function BottomSheetDemo() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button tone="neutral" onPress={() => setOpen(true)}>
        Filters
      </Button>
      <BottomSheet
        open={open}
        onClose={() => setOpen(false)}
        accessibilityLabel="Filters"
        detents={[0.5, 1]}
      >
        <Heading level={3} className="text-lg font-bold text-hozo-text">
          Filters
        </Heading>
        <Paragraph className="text-sm text-hozo-text-body">
          Drag the handle down to close it, or up to open it fully. Escape and the scrim close it
          too.
        </Paragraph>
        <Stack direction="row" gap="tight">
          <Button tone="accent" onPress={() => setOpen(false)}>
            Apply
          </Button>
          <Button tone="quiet" onPress={() => setOpen(false)}>
            Cancel
          </Button>
        </Stack>
      </BottomSheet>
    </>
  )
}
