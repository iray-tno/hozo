import { Checkbox, Dialog, Switch, Tabs } from '@hozo/patterns'
import { Button, Pressable, Text, View } from '@hozo/primitives'
import { Heading, Paragraph } from '@hozo/typography'
import { type ComponentRef, useRef, useState } from 'react'

export function PreferencesDemo() {
  const [notifications, setNotifications] = useState(false)
  const [updates, setUpdates] = useState(true)
  return (
    <View className="w-full max-w-lg gap-4 rounded-2xl bg-white p-6">
      <Heading level={2} className="text-xl font-bold text-slate-900">
        Preferences
      </Heading>
      <Checkbox
        checked={notifications}
        onCheckedChange={setNotifications}
        accessibilityLabel="Email notifications"
      >
        <Text className="flex rounded-lg bg-slate-100 px-4 py-3 text-base text-slate-900">
          Email notifications: {notifications ? 'enabled' : 'disabled'}
        </Text>
      </Checkbox>
      <Switch checked={updates} onCheckedChange={setUpdates} accessibilityLabel="Automatic updates">
        <Text className="flex rounded-lg bg-slate-100 px-4 py-3 text-base text-slate-900">
          Automatic updates: {updates ? 'on' : 'off'}
        </Text>
      </Switch>
      <Checkbox checked disabled accessibilityLabel="Required security notices">
        <Text className="flex rounded-lg bg-slate-100 px-4 py-3 text-base text-slate-700">
          Required security notices
        </Text>
      </Checkbox>
      <Text className="text-base text-slate-700">
        Preferences: email {notifications ? 'on' : 'off'}, updates {updates ? 'on' : 'off'}
      </Text>
    </View>
  )
}

export function TabsDemo() {
  const [selected, setSelected] = useState(0)
  const sections = ['Overview', 'Details', 'Unavailable']
  const tabs = sections.map((name, index) => ({
    label: (
      <Text
        className="flex rounded-lg px-4 py-3 text-base"
        style={{ color: selected === index ? '#4f39f6' : '#0f172b', fontWeight: '600' }}
      >
        {name}
      </Text>
    ),
    disabled: index === 2,
    content: (
      <View className="rounded-lg bg-slate-50 p-4">
        <Text className="text-base text-slate-900">
          {index === 0 ? 'Your workspace at a glance.' : 'Workspace details and activity.'}
        </Text>
      </View>
    ),
  }))
  return (
    <View className="w-full max-w-lg gap-4 rounded-2xl bg-white p-6">
      <Heading level={2} className="text-xl font-bold text-slate-900">
        Workspace sections
      </Heading>
      <Tabs
        tabs={tabs}
        index={selected}
        onIndexChange={setSelected}
        accessibilityLabel="Workspace sections"
      />
      <Text className="text-base text-slate-700">Current section: {sections[selected]}</Text>
    </View>
  )
}

export function DialogDemo({ initiallyOpen = false }: { initiallyOpen?: boolean }) {
  const [open, setOpen] = useState(initiallyOpen)
  const [saved, setSaved] = useState(false)
  const opener = useRef<ComponentRef<typeof Pressable>>(null)
  return (
    <View className="w-full max-w-lg gap-4 rounded-2xl bg-white p-6">
      <Heading level={2} className="text-xl font-bold text-slate-900">
        Confirm changes
      </Heading>
      <Pressable
        ref={opener}
        accessibilityRole="button"
        accessibilityLabel="Review changes"
        style={{ backgroundColor: '#4f39f6', borderRadius: 8, padding: 12 }}
        onPress={() => setOpen(true)}
      >
        <Text className="text-base font-semibold text-white">Review changes</Text>
      </Pressable>
      <Text className="text-base text-slate-700">Changes: {saved ? 'saved' : 'not saved'}</Text>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        accessibilityLabel="Save workspace changes"
        restoreFocusTo={opener}
        className="m-auto w-full max-w-lg rounded-2xl border-0 bg-white p-6"
      >
        <View className="gap-4">
          <Heading level={2} className="text-xl font-bold text-slate-900">
            Save workspace changes
          </Heading>
          <Paragraph className="text-base text-slate-700">
            Save the updated workspace preferences?
          </Paragraph>
          <Button
            className="rounded-lg bg-indigo-600 px-4 py-3 text-base text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
            onPress={() => {
              setSaved(true)
              setOpen(false)
            }}
          >
            Confirm save
          </Button>
          <Button
            className="rounded-lg bg-slate-100 px-4 py-3 text-base text-slate-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
            onPress={() => setOpen(false)}
          >
            Cancel changes
          </Button>
        </View>
      </Dialog>
    </View>
  )
}
