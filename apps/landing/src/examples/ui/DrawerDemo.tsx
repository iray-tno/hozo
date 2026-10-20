import { Heading } from '@hozo/core'
import { Button, Drawer } from '@hozo/ui'
import { useState } from 'react'

export function DrawerDemo() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button tone="neutral" onPress={() => setOpen(true)}>
        Open navigation
      </Button>
      <Drawer open={open} onClose={() => setOpen(false)} accessibilityLabel="Navigation">
        <Heading level={3} className="text-lg font-bold text-hozo-text">
          Navigation
        </Heading>
        <Button tone="quiet" size="sm" href="#overview">
          Overview
        </Button>
        <Button tone="quiet" size="sm" href="#reports">
          Reports
        </Button>
        <Button tone="quiet" size="sm" href="#settings">
          Settings
        </Button>
        <Button tone="neutral" size="sm" onPress={() => setOpen(false)}>
          Close
        </Button>
      </Drawer>
    </>
  )
}
