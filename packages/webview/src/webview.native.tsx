import { createElement, type JSXElementConstructor } from 'react'
import { Linking, Pressable, type StyleProp, Text, View, type ViewStyle } from 'react-native'
import type { HozoWebMessage, HozoWebViewProps as WebProps } from './webview.tsx'

export type { HozoWebMessage }

export interface HozoWebViewProps extends Omit<WebProps, 'style' | 'referrerPolicy'> {
  style?: StyleProp<ViewStyle>
  referrerPolicy?: string
}

type WebViewComponent = JSXElementConstructor<Record<string, unknown>>

/**
 * `react-native-webview`, resolved once (#353's seam).
 *
 * A WebView is native code, which Hozo does not ship. So this uses the one
 * the application has installed -- a `require` Metro treats as optional
 * inside `try` -- and without it the content is still reachable: a link that
 * opens the address in the browser, rather than an empty box. A future
 * `@hozo/native` would be one more candidate here.
 */
function resolveWebView(): WebViewComponent | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const module = require('react-native-webview') as {
      WebView?: WebViewComponent
      default?: WebViewComponent
    }
    return module.WebView ?? module.default ?? null
  } catch {
    return null
  }
}

let resolved: WebViewComponent | null | undefined
let warned = false

/** A message's data: the string a page posted, parsed when it is JSON. */
function parse(data: unknown): unknown {
  if (typeof data !== 'string') return data
  try {
    return JSON.parse(data)
  } catch {
    return data
  }
}

/**
 * Web content inside the application, on React Native: `react-native-webview`
 * named for a reader by `title`, the way the Web half's frame is. Its
 * messages arrive parsed from JSON where they can be, so the same handler
 * reads a page posting `JSON.stringify({ paid: true })` on both platforms.
 */
export function HozoWebView({
  src,
  srcDoc,
  title,
  onMessage,
  onLoad,
  onError,
  style,
  testID,
}: HozoWebViewProps) {
  if (resolved === undefined) resolved = resolveWebView()
  const WebView = resolved
  if (!WebView) {
    if (!warned) {
      warned = true
      console.warn(
        '[hozo] WebView needs `react-native-webview`, which is not installed; the address is offered ' +
          'as a link to the browser instead. Hozo ships no native code, and a web view is native code.',
      )
    }
    return (
      <View style={style} testID={testID}>
        {src ? (
          <Pressable
            accessibilityRole="link"
            accessibilityLabel={title}
            onPress={() => void Linking.openURL(src)}
          >
            <Text>{title}</Text>
          </Pressable>
        ) : null}
      </View>
    )
  }
  return createElement(WebView, {
    source: srcDoc !== undefined ? { html: srcDoc } : { uri: src },
    accessibilityLabel: title,
    style,
    testID,
    onLoad,
    onError,
    onMessage: onMessage
      ? (event: { nativeEvent: { data: unknown } }) =>
          onMessage({ data: parse(event.nativeEvent.data) })
      : undefined,
  })
}

export { HozoWebView as WebView }
