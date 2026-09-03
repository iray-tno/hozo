import {
  DismissableLayer,
  FloatingPositioner,
  FocusScope,
  LiveRegion,
  type Placement,
  Portal,
  RovingFocusGroup,
  useAnnounce,
  useRovingItem,
  useTypeahead,
} from '@hozo/behaviors'
import { Button, Heading, Paragraph, Text, View } from '@hozo/core'
import { Separator } from '@hozo/semantics'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { useRef, useState } from 'react'

function BehaviorsShowcase() {
  const announce = useAnnounce()
  const [log, setLog] = useState<string[]>([])
  const [showPortal, setShowPortal] = useState(false)
  const [showLayer, setShowLayer] = useState(false)

  const handleAnnounce = (msg: string, mode: 'polite' | 'assertive') => {
    announce(msg, mode)
    setLog((prev) => [
      `[${mode.toUpperCase()}] ${msg} (${new Date().toLocaleTimeString()})`,
      ...prev.slice(0, 4),
    ])
  }

  return (
    <View className="max-w-2xl w-full space-y-8 rounded-2xl bg-white p-8 shadow-sm">
      <View className="space-y-2 border-b border-slate-200 pb-4">
        <Heading level={2} className="text-2xl font-bold text-slate-900 tracking-tight">
          Universal Behaviors (@hozo/behaviors)
        </Heading>
        <Paragraph className="text-sm text-slate-600 leading-relaxed">
          Layer 2 runtime behavior primitives. Powers overlay, focus, and accessibility coordination
          across Web and React Native without duplicating DOM/Native logic.
        </Paragraph>
      </View>

      {/* 1. LiveRegion */}
      <View className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-5">
        <Heading level={3} className="text-base font-bold text-slate-900">
          1. LiveRegion &amp; useAnnounce
        </Heading>
        <Paragraph className="text-xs text-slate-600">
          Notifies assistive technologies (screen readers) of dynamic DOM/state changes.
        </Paragraph>
        <View className="flex flex-row flex-wrap gap-3 pt-1">
          <Button
            className="rounded-lg bg-indigo-600 px-3.5 py-2 text-xs font-semibold text-white shadow-sm hover:bg-indigo-500"
            onPress={() => handleAnnounce('Changes saved successfully', 'polite')}
          >
            Announce Polite (Save)
          </Button>
          <Button
            className="rounded-lg bg-red-600 px-3.5 py-2 text-xs font-semibold text-white shadow-sm hover:bg-red-500"
            onPress={() => handleAnnounce('Critical: Network connection lost', 'assertive')}
          >
            Announce Assertive (Alert)
          </Button>
        </View>

        {log.length > 0 && (
          <View className="mt-2 space-y-1 rounded-lg border border-slate-200 bg-white p-3 font-mono text-xs text-slate-700">
            <Text className="font-bold text-slate-900">Recent Announcements Log:</Text>
            {log.map((entry, i) => (
              <Text key={i} className="block text-slate-600">
                {entry}
              </Text>
            ))}
          </View>
        )}
      </View>

      {/* 2. Portal */}
      <View className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-5">
        <Heading level={3} className="text-base font-bold text-slate-900">
          2. Portal (DOM Teleportation)
        </Heading>
        <Paragraph className="text-xs text-slate-600">
          Renders children outside the parent container tree into document.body to bypass overflow
          clipping and stacking contexts.
        </Paragraph>

        {/* Constrained container demonstrating overflow clipping */}
        <View className="relative overflow-hidden rounded-lg border border-amber-300 bg-amber-50 p-4">
          <Text className="text-xs font-semibold text-amber-900">
            Parent container with overflow: hidden (Height: 80px)
          </Text>
          <View className="pt-2">
            <Button
              className="rounded-lg bg-indigo-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-indigo-500"
              onPress={() => setShowPortal((v) => !v)}
            >
              {showPortal ? 'Close Portaled Toast' : 'Open Portaled Toast'}
            </Button>
          </View>
        </View>

        {showPortal && (
          <Portal>
            <View className="fixed bottom-6 right-6 z-50 rounded-xl border border-slate-200 bg-slate-900 p-4 shadow-2xl text-white flex flex-row items-center gap-4">
              <View>
                <Text className="font-bold text-sm">Portaled Notification</Text>
                <Paragraph className="text-xs text-slate-300">
                  Rendered at document root, escaping parent overflow: hidden!
                </Paragraph>
              </View>
              <Button
                className="rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-700"
                onPress={() => setShowPortal(false)}
              >
                Dismiss
              </Button>
            </View>
          </Portal>
        )}
      </View>

      {/* 3. DismissableLayer */}
      <View className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-5">
        <Heading level={3} className="text-base font-bold text-slate-900">
          3. DismissableLayer
        </Heading>
        <Paragraph className="text-xs text-slate-600">
          Detects Escape key press and outside clicks to dismiss floating cards or popovers.
        </Paragraph>
        <View className="pt-1">
          <Button
            className="rounded-lg bg-indigo-600 px-3.5 py-2 text-xs font-semibold text-white shadow-sm hover:bg-indigo-500"
            onPress={() => setShowLayer(true)}
          >
            Open Dismissable Popover
          </Button>
        </View>

        {showLayer && (
          <DismissableLayer
            onDismiss={() => setShowLayer(false)}
            className="mt-3 rounded-xl border border-indigo-200 bg-indigo-50 p-4 shadow-md space-y-2"
          >
            <View className="flex flex-row items-center justify-between">
              <Text className="font-bold text-sm text-indigo-950">Active Dismissable Layer</Text>
              <Button
                className="rounded px-2 py-0.5 text-xs font-semibold text-indigo-900 hover:bg-indigo-100"
                onPress={() => setShowLayer(false)}
              >
                &times; Close
              </Button>
            </View>
            <Paragraph className="text-xs text-indigo-900 leading-relaxed">
              Press the <Text className="font-mono font-bold bg-white px-1 rounded">Escape</Text>{' '}
              key or click anywhere outside this box to automatically dismiss.
            </Paragraph>
          </DismissableLayer>
        )}
      </View>
    </View>
  )
}

function LiveRegionDemo() {
  const announce = useAnnounce()
  const [status, setStatus] = useState('Idle')

  const trigger = (msg: string, mode: 'polite' | 'assertive') => {
    setStatus(`${msg} (${mode})`)
    announce(msg, mode)
  }

  return (
    <View className="max-w-2xl w-full space-y-6 rounded-2xl bg-white p-8 shadow-sm">
      <Heading
        level={2}
        className="text-xl font-bold text-slate-900 border-b border-slate-200 pb-3"
      >
        LiveRegion &amp; useAnnounce
      </Heading>
      <Paragraph className="text-sm text-slate-700">
        Informs screen reader users when content asynchronously updates without stealing focus.
      </Paragraph>

      <View className="space-y-4">
        <View className="flex flex-row gap-3">
          <Button
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500"
            onPress={() => trigger('Form saved to cloud', 'polite')}
          >
            Trigger Polite Update
          </Button>
          <Button
            className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-red-500"
            onPress={() => trigger('Session expired. Please log in.', 'assertive')}
          >
            Trigger Assertive Alert
          </Button>
        </View>

        <View className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-1">
          <Text className="text-xs font-bold uppercase tracking-wider text-slate-500">
            Current Status
          </Text>
          <Text className="text-sm font-semibold text-slate-900">{status}</Text>
        </View>

        {/* Standalone component test */}
        <LiveRegion mode="polite">
          <Text>{status}</Text>
        </LiveRegion>
      </View>
    </View>
  )
}

function DismissableStackDemo() {
  const [level1, setLevel1] = useState(false)
  const [level2, setLevel2] = useState(false)

  return (
    <View className="max-w-2xl w-full space-y-6 rounded-2xl bg-white p-8 shadow-sm">
      <Heading
        level={2}
        className="text-xl font-bold text-slate-900 border-b border-slate-200 pb-3"
      >
        Nested Dismissable Layers (LIFO Stack)
      </Heading>
      <Paragraph className="text-sm text-slate-700">
        When multiple layers are stacked, outside clicks and Escape key presses only dismiss the
        top-most layer, preventing nested dialogues from unexpectedly closing parent menus.
      </Paragraph>

      <View className="space-y-4">
        <Button
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500"
          onPress={() => setLevel1(true)}
        >
          Open Primary Popover
        </Button>

        {level1 && (
          <DismissableLayer
            onDismiss={() => {
              setLevel1(false)
              setLevel2(false)
            }}
            className="rounded-xl border border-indigo-300 bg-indigo-50 p-5 shadow-lg space-y-3"
          >
            <Text className="font-bold text-sm text-indigo-950">Primary Layer (Level 1)</Text>
            <Paragraph className="text-xs text-indigo-900">
              Clicking outside this layer closes it. But if Level 2 is open, only Level 2 will close
              first!
            </Paragraph>

            <Button
              className="rounded-lg bg-indigo-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-800"
              onPress={() => setLevel2(true)}
            >
              Open Nested Sub-Menu (Level 2)
            </Button>

            {level2 && (
              <DismissableLayer
                onDismiss={() => setLevel2(false)}
                className="mt-3 rounded-lg border border-slate-300 bg-white p-4 shadow-xl space-y-2"
              >
                <Text className="font-bold text-sm text-slate-900">Nested Layer (Level 2)</Text>
                <Paragraph className="text-xs text-slate-600">
                  Top-most layer. Pressing Escape or clicking outside closes Level 2 while keeping
                  Level 1 open!
                </Paragraph>
                <Button
                  className="rounded bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-200"
                  onPress={() => setLevel2(false)}
                >
                  Close Level 2
                </Button>
              </DismissableLayer>
            )}
          </DismissableLayer>
        )}
      </View>
    </View>
  )
}

function FocusScopeDemo() {
  const [open, setOpen] = useState(false)
  return (
    <View className="max-w-2xl w-full space-y-6 rounded-2xl bg-white p-8 shadow-sm">
      <Heading
        level={2}
        className="text-xl font-bold text-slate-900 border-b border-slate-200 pb-3"
      >
        FocusScope (Focus Trapping &amp; Restoration)
      </Heading>
      <Paragraph className="text-sm text-slate-700">
        Traps Tab key navigation inside the modal container. Upon unmount, safely restores focus to
        the trigger element.
      </Paragraph>

      <View className="pt-2">
        <Button
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500"
          onPress={() => setOpen(true)}
        >
          Open Trapped Modal
        </Button>
      </View>

      {open && (
        <Portal>
          <View className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900 bg-opacity-50 p-4">
            <FocusScope
              trapped
              autoFocus
              restoreFocus
              className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl space-y-4"
            >
              <Heading level={3} className="text-lg font-bold text-slate-900">
                Modal Dialog with Focus Trap
              </Heading>
              <Paragraph className="text-xs text-slate-600">
                Try pressing <Text className="font-mono font-bold">Tab</Text> or{' '}
                <Text className="font-mono font-bold">Shift+Tab</Text>. Focus will never escape this
                dialog!
              </Paragraph>

              <View className="space-y-3 pt-2">
                <Button
                  className="w-full rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500"
                  onPress={() => alert('Action confirmed')}
                >
                  Action 1 (First Control)
                </Button>
                <Button
                  className="w-full rounded-lg bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-200"
                  onPress={() => setOpen(false)}
                >
                  Close Modal (Restores Focus)
                </Button>
              </View>
            </FocusScope>
          </View>
        </Portal>
      )}
    </View>
  )
}

function RovingToolbarItem({ index, label }: { index: number; label: string }) {
  const { tabIndex, isActive, onFocus, onKeyDown } = useRovingItem(index)
  return (
    <button
      type="button"
      tabIndex={tabIndex}
      onFocus={onFocus}
      onKeyDown={onKeyDown}
      className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
        isActive
          ? 'bg-indigo-600 text-white shadow-sm'
          : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
      }`}
    >
      {label}
    </button>
  )
}

function RovingFocusDemo() {
  const [active, setActive] = useState(0)
  const tools = ['Bold', 'Italic', 'Underline', 'Strike', 'Code']

  return (
    <View className="max-w-2xl w-full space-y-6 rounded-2xl bg-white p-8 shadow-sm">
      <Heading
        level={2}
        className="text-xl font-bold text-slate-900 border-b border-slate-200 pb-3"
      >
        RovingFocusGroup (Single Tab Stop &amp; Arrow Navigation)
      </Heading>
      <Paragraph className="text-sm text-slate-700">
        The entire toolbar is a single tab stop. Use Arrow Left/Right to navigate, and Home/End to
        jump to ends.
      </Paragraph>

      <View className="pt-2">
        <RovingFocusGroup
          count={tools.length}
          active={active}
          onActiveChange={setActive}
          orientation="horizontal"
          wrap
          className="flex flex-row items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 p-2"
        >
          {tools.map((tool, i) => (
            <RovingToolbarItem key={tool} index={i} label={tool} />
          ))}
        </RovingFocusGroup>
      </View>
      <Text className="text-xs text-slate-500 font-mono">
        Current Active Index: {active} ({tools[active]})
      </Text>
    </View>
  )
}

function TypeaheadDemo() {
  const fruits = [
    'Apple',
    'Apricot',
    'Avocado',
    'Banana',
    'Blueberry',
    'Cherry',
    'Cranberry',
    'Date',
  ]
  const [active, setActive] = useState(0)
  const { handleKeyDown } = useTypeahead(fruits, active, setActive)

  return (
    <View className="max-w-2xl w-full space-y-6 rounded-2xl bg-white p-8 shadow-sm">
      <Heading
        level={2}
        className="text-xl font-bold text-slate-900 border-b border-slate-200 pb-3"
      >
        Typeahead (Incremental Search &amp; Single-Letter Cycle)
      </Heading>
      <Paragraph className="text-sm text-slate-700">
        Click on the list to focus, then type letters (e.g. &quot;b&quot;, &quot;bl&quot;, or press
        &quot;a&quot; repeatedly) to jump through matching items.
      </Paragraph>

      <div
        role="listbox"
        aria-label="Fruit selection"
        tabIndex={0}
        onKeyDown={handleKeyDown}
        className="mt-2 rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-1 focus:outline-none focus:ring-2 focus:ring-indigo-600"
      >
        {fruits.map((fruit, i) => (
          <div
            key={fruit}
            role="option"
            aria-selected={active === i}
            tabIndex={-1}
            onClick={() => setActive(i)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                setActive(i)
              }
            }}
            className={`cursor-pointer rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
              active === i ? 'bg-indigo-600 text-white' : 'text-slate-700 hover:bg-slate-200'
            }`}
          >
            {fruit}
          </div>
        ))}
      </div>
    </View>
  )
}

function FloatingPopoverDemo() {
  const [open, setOpen] = useState(false)
  const [placement, setPlacement] = useState<Placement>('bottom')
  const anchorRef = useRef<HTMLButtonElement>(null)

  const placements: Placement[] = ['top', 'bottom', 'left', 'right']

  return (
    <View className="max-w-2xl w-full space-y-6 rounded-2xl bg-white p-8 shadow-sm">
      <Heading
        level={2}
        className="text-xl font-bold text-slate-900 border-b border-slate-200 pb-3"
      >
        FloatingPositioner (Popper / Floating UI Equivalent)
      </Heading>
      <Paragraph className="text-sm text-slate-700">
        Positions floating overlays relative to an anchor element with automatic viewport collision
        detection (flip &amp; shift) and arrow tracking.
      </Paragraph>

      <View className="flex flex-row items-center gap-2">
        <Text className="text-xs font-semibold text-slate-600">Placement:</Text>
        {placements.map((p) => (
          <Button
            key={p}
            className={`rounded-lg px-2.5 py-1 text-xs font-semibold ${
              placement === p
                ? 'bg-indigo-600 text-white'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
            onPress={() => setPlacement(p)}
          >
            {p}
          </Button>
        ))}
      </View>

      <View className="py-12 flex items-center justify-center bg-slate-50 rounded-2xl border border-dashed border-slate-200">
        <button
          ref={anchorRef}
          type="button"
          onClick={() => setOpen((prev) => !prev)}
          className="rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-md hover:bg-indigo-500 transition-colors"
        >
          {open ? 'Close Popover' : 'Click to Anchor Popover'}
        </button>

        {open && (
          <Portal>
            <FloatingPositioner
              anchorRef={anchorRef}
              placement={placement}
              offset={10}
              flip
              shift
              className="z-50"
            >
              {(pos) => (
                <DismissableLayer
                  onDismiss={() => setOpen(false)}
                  className="rounded-xl border border-slate-200 bg-white p-4 shadow-xl space-y-2 w-64"
                >
                  <View className="flex flex-row items-center justify-between">
                    <Text className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                      {pos?.placement}
                    </Text>
                    {pos?.flipped && (
                      <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-800">
                        Flipped
                      </span>
                    )}
                  </View>
                  <Paragraph className="text-xs text-slate-600">
                    Calculated position: ({pos?.x}, {pos?.y})
                  </Paragraph>
                  <Button
                    className="w-full rounded bg-slate-100 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-200"
                    onPress={() => setOpen(false)}
                  >
                    Dismiss
                  </Button>
                </DismissableLayer>
              )}
            </FloatingPositioner>
          </Portal>
        )}
      </View>
    </View>
  )
}

const meta = {
  title: 'Behaviors',
  component: BehaviorsShowcase,
} satisfies Meta<typeof BehaviorsShowcase>

export default meta
export const Showcase: StoryObj<typeof meta> = {
  render: () => <BehaviorsShowcase />,
}
export const LiveRegionAnnouncements: StoryObj<typeof meta> = {
  render: () => <LiveRegionDemo />,
}
export const DismissableStack: StoryObj<typeof meta> = {
  render: () => <DismissableStackDemo />,
}
export const FocusScopeModal: StoryObj<typeof meta> = {
  render: () => <FocusScopeDemo />,
}
export const RovingFocusToolbar: StoryObj<typeof meta> = {
  render: () => <RovingFocusDemo />,
}
export const TypeaheadList: StoryObj<typeof meta> = {
  render: () => <TypeaheadDemo />,
}
export const FloatingPopover: StoryObj<typeof meta> = {
  render: () => <FloatingPopoverDemo />,
}
