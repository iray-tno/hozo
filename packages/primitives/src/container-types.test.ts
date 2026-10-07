import assert from 'node:assert/strict'
import test from 'node:test'
import { type ComponentRef, createRef } from 'react'
import type { View } from 'react-native'

import type { HozoLink } from './link.native.tsx'
import type { HozoPressable } from './pressable.native.tsx'
import type { HozoContainerProps } from './runtime-container.native.tsx'

// These are compiler-only hosts, but their props still land in typed JSX.
// Import only types: running the real RN package under Node is not the
// runtime proof. The Native renderer separately checks the actual hosts.
test('container props preserve the selected host callback and navigation types', () => {
  const style: HozoContainerProps<typeof HozoPressable>['style'] = ({ hovered, focusVisible }) => ({
    opacity: hovered || focusVisible ? 1 : 0.5,
  })
  const children: HozoContainerProps<typeof HozoPressable>['children'] = ({ pressed }) =>
    pressed ? 'pressed' : 'idle'
  const href: HozoContainerProps<typeof HozoLink>['href'] = '/docs'
  const ref: HozoContainerProps['ref'] = createRef<ComponentRef<typeof View>>()
  assert.equal(typeof style, 'function')
  assert.equal(typeof children, 'function')
  assert.equal(href, '/docs')
  assert.equal(ref.current, null)
})
