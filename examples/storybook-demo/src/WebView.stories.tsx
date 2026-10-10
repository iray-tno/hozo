// Embedded web content: a named, lazily loaded frame. A reader hears its
// title before deciding to enter it, and `onMessage` hears only the page in
// this frame -- here, a button inside it posting a message out.

import { View } from '@hozo/primitives'
import { Heading, Paragraph } from '@hozo/typography'
import { WebView } from '@hozo/webview'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'

const PAGE = `<!doctype html><html lang="en"><body style="font-family: system-ui; margin: 16px">
<p>This page lives inside the frame.</p>
<button type="button" onclick="parent.postMessage({ greeting: 'hello from the frame' }, '*')">Send a message</button>
</body></html>`

function WebViewGallery() {
  const [last, setLast] = useState('nothing yet')
  return (
    <View className="max-w-xl space-y-6 rounded-2xl bg-white p-8">
      <View className="space-y-2">
        <Heading level={1} className="text-2xl font-bold text-slate-900">
          WebView
        </Heading>
        <Paragraph className="text-slate-700">Last message: {last}</Paragraph>
      </View>
      <WebView
        srcDoc={PAGE}
        title="Embedded example page"
        onMessage={({ data }) => setLast(JSON.stringify(data))}
        className="h-40 w-full rounded-lg border border-slate-300"
      />
    </View>
  )
}

const meta = {
  title: 'Media/WebView',
  component: WebViewGallery,
} satisfies Meta<typeof WebViewGallery>

export default meta

export const Default: StoryObj<typeof meta> = {}
