import { Heading, Paragraph } from '@hozo/core'
import { Button, Dialog, Stack } from '@hozo/ui'
import { useState } from 'react'

export function DialogDemo() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button tone="danger" onPress={() => setOpen(true)}>
        Delete project
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} accessibilityLabel="Delete the project">
        <Stack gap="normal">
          <Heading level={3} className="text-lg font-bold text-hozo-text">
            Delete the project?
          </Heading>
          <Paragraph className="text-sm text-hozo-text-body">
            Every build and report goes with it. This cannot be undone.
          </Paragraph>
          <Stack direction="row" gap="tight">
            <Button tone="danger" onPress={() => setOpen(false)}>
              Delete
            </Button>
            <Button tone="quiet" onPress={() => setOpen(false)}>
              Keep it
            </Button>
          </Stack>
        </Stack>
      </Dialog>
    </>
  )
}
