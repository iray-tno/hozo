import { Paragraph } from '@hozo/core'
import { Button, Popover } from '@hozo/ui'

export function PopoverDemo() {
  return (
    <Popover trigger="Shipping" accessibilityLabel="Shipping">
      <Paragraph className="text-sm text-hozo-text-body">
        Two days, or four to an island. Orders placed before noon leave the same day.
      </Paragraph>
      <Button tone="quiet" size="sm" href="#returns">
        Read the returns policy
      </Button>
    </Popover>
  )
}
