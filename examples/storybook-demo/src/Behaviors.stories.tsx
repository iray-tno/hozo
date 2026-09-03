import { DismissableLayer, LiveRegion, Portal, useAnnounce } from '@hozo/behaviors'
import { Button, Heading, Paragraph, Text, View } from '@hozo/core'
import { Separator } from '@hozo/semantics'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'

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
