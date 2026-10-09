// A command palette: ⌘K (Ctrl+K off a Mac) opens a dialog holding a search
// field. The arrow keys move through the matching commands while focus
// stays in the field -- a reader hears each through `aria-activedescendant`
// -- Enter runs one, Escape closes, and focus goes back where it was. How
// many commands match is announced as the query narrows them.

import { PortalProvider } from '@hozo/behaviors'
import { CommandPalette, useCommandShortcut } from '@hozo/core'
import { Text, View } from '@hozo/primitives'
import { Heading, Paragraph } from '@hozo/typography'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'

const ROOT = 'fixed inset-0 z-50 flex items-start justify-center pt-[12vh] px-4'
const SCRIM = 'absolute inset-0 bg-slate-900/50'
const PANEL =
  'relative w-full max-w-xl overflow-hidden rounded-xl border border-slate-200 bg-white text-sm text-slate-800 shadow-xl'
const INPUT =
  'w-full border-b border-slate-200 px-4 py-3 text-base text-slate-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600'
const LIST = 'max-h-80 overflow-y-auto p-2'
const HEADING = 'px-2 pt-3 pb-1 text-xs font-semibold text-slate-600'
const ITEM = 'flex flex-row items-center justify-between rounded-md px-2 py-2'
const ACTIVE = 'bg-indigo-50 text-indigo-900'
const SHORTCUT = 'text-xs text-slate-600'

function PaletteGallery({ startOpen = false }: { startOpen?: boolean }) {
  const [open, setOpen] = useState(startOpen)
  const [last, setLast] = useState('nothing yet')
  // A portal host inside the story, as `UiDrawer`'s: the screen-reader walk
  // reads from `#storybook-root`, and a palette on `body` is outside it.
  const [host, setHost] = useState<HTMLDivElement | null>(null)
  useCommandShortcut(() => setOpen(true))
  const commands = [
    {
      id: 'new',
      label: 'Create project',
      group: 'Actions',
      shortcut: '⌘N',
      onSelect: () => setLast('Create project'),
    },
    {
      id: 'invite',
      label: 'Invite people',
      group: 'Actions',
      onSelect: () => setLast('Invite people'),
    },
    {
      id: 'settings',
      label: 'Settings',
      group: 'Navigation',
      keywords: ['preferences'],
      shortcut: '⌘,',
      onSelect: () => setLast('Settings'),
    },
    { id: 'profile', label: 'Profile', group: 'Navigation', onSelect: () => setLast('Profile') },
    {
      id: 'archive',
      label: 'Archive project',
      group: 'Actions',
      disabled: true,
      onSelect: () => setLast('Archive'),
    },
  ]
  return (
    <View className="max-w-xl space-y-6 rounded-2xl bg-white p-8">
      <View className="space-y-2">
        <Heading level={1} className="text-2xl font-bold text-slate-900">
          Command palette
        </Heading>
        <Paragraph className="text-slate-700">
          Press ⌘K or Ctrl+K, or the button. Last run: {last}.
        </Paragraph>
      </View>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="self-start rounded-md bg-indigo-700 px-4 py-2 text-sm font-semibold text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
      >
        <Text className="text-white">Open command palette</Text>
      </button>
      <div ref={setHost} />
      <PortalProvider container={host}>
        <CommandPalette
          open={open}
          onOpenChange={setOpen}
          commands={commands}
          placeholder="Type a command or search"
          className={ROOT}
          scrimClassName={SCRIM}
          panelClassName={PANEL}
          inputClassName={INPUT}
          listClassName={LIST}
          groupHeadingClassName={HEADING}
          itemClassName={ITEM}
          activeItemClassName={ACTIVE}
          shortcutClassName={SHORTCUT}
          emptyClassName="px-4 py-6 text-center text-slate-600"
        />
      </PortalProvider>
    </View>
  )
}

const meta = {
  title: 'Patterns/CommandPalette',
  component: PaletteGallery,
} satisfies Meta<typeof PaletteGallery>

export default meta

export const Default: StoryObj<typeof meta> = {}

export const Open: StoryObj<typeof meta> = { args: { startOpen: true } }
