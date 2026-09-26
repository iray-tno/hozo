import { Dialog } from '@hozo/patterns'
import { Button, View } from '@hozo/primitives'
import { Heading, Paragraph } from '@hozo/typography'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'

function DialogDemo({ initiallyOpen = false }: { initiallyOpen?: boolean }) {
  // A prop rather than a second copy of the dialog. #560 wants a golden for
  // what a reader hears *inside* an open overlay, and every overlay story in
  // this suite is closed at load -- so the two stories below share one
  // implementation and differ only in where they start.
  const [open, setOpen] = useState(initiallyOpen)

  return (
    <View className="max-w-xl w-full space-y-6 rounded-2xl bg-white p-8 shadow-sm">
      <Heading level={2} className="text-xl font-bold text-slate-900">
        Accessible Modal Dialog (@hozo/patterns)
      </Heading>
      <Paragraph className="text-sm text-slate-600">
        Native HTML &lt;dialog&gt; modal with focus trapping, keyboard Escape handling, and focus
        restoration to opener button.
      </Paragraph>
      <Button
        className="rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 transition-colors inline-flex justify-center items-center cursor-pointer"
        onPress={() => setOpen(true)}
      >
        Open Confirmation Dialog
      </Button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        accessibilityLabel="Confirm Deployment"
        className="rounded-2xl bg-white p-6 shadow-2xl backdrop:bg-slate-900 max-w-md w-full border-0 m-auto"
      >
        <View className="space-y-4">
          <Heading level={3} className="text-lg font-bold text-slate-900">
            Confirm Operation
          </Heading>
          <Paragraph className="text-sm text-slate-600">
            Are you sure you want to deploy the universal Hozo UI compiler to production?
          </Paragraph>
          <View className="flex flex-row justify-end gap-3 pt-4 border-t border-slate-100">
            <Button
              className="rounded-lg bg-slate-100 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-200 transition-colors cursor-pointer"
              onPress={() => setOpen(false)}
            >
              Cancel
            </Button>
            <Button
              className="rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-500 transition-colors cursor-pointer"
              onPress={() => {
                alert('Confirmed!')
                setOpen(false)
              }}
            >
              Confirm
            </Button>
          </View>
        </View>
      </Dialog>
    </View>
  )
}

const meta = { title: 'Patterns/Dialog', component: DialogDemo } satisfies Meta<typeof DialogDemo>
export default meta
export const Default: StoryObj<typeof meta> = {}
/**
 * Open on mount, so the golden covers the dialog rather than stopping at the
 * button that opens it.
 *
 * A separate story rather than a change to the one above: the closed reading
 * order is approved and is what a reader meets first.
 */
export const Open: StoryObj<typeof meta> = { render: () => <DialogDemo initiallyOpen /> }
