import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { Button, Dialog, Heading, Paragraph, View } from '@hozo/core'

function DialogDemo() {
  const [open, setOpen] = useState(false)

  return (
    <View className="max-w-xl w-full space-y-6 rounded-2xl bg-white p-8 shadow-sm">
      <Heading level={2} className="text-xl font-bold text-slate-900">
        Accessible Modal Dialog (@hozo/a11y)
      </Heading>
      <Paragraph className="text-sm text-slate-600">
        Native HTML &lt;dialog&gt; modal with focus trapping, keyboard Escape handling, and focus restoration to opener button.
      </Paragraph>
      <Button
        className="rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 transition-colors inline-flex justify-center items-center"
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
              className="rounded-lg bg-slate-100 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-200 transition-colors"
              onPress={() => setOpen(false)}
            >
              Cancel
            </Button>
            <Button
              className="rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-500 transition-colors"
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

const meta = { title: 'A11y/Dialog', component: DialogDemo } satisfies Meta<typeof DialogDemo>
export default meta
export const Default: StoryObj<typeof meta> = {}
