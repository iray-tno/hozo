// A deliberately scoped MODEL of RN 0.87 Modal's JS lifetime, not a simulator:
// Android returns null once visible=false; iOS keeps children while isRendered
// until onDismiss. Initial hidden children never render on either platform.
// Mirrors Libraries/Modal/Modal.js, without pretending to execute native views.
export * from './react-native-stub.js'

import { createElement, useEffect, useState } from 'react'

export const handleModalModel = { platform: 'android' }
export function Modal({ visible, children, onDismiss, ...props }) {
  const [rendered, setRendered] = useState(visible === true)
  useEffect(() => {
    if (visible) setRendered(true)
  }, [visible])
  if (!visible && !(handleModalModel.platform === 'ios' && rendered)) return null
  return createElement(
    'Modal',
    {
      ...props,
      visible,
      onDismiss() {
        setRendered(false)
        onDismiss?.()
      },
    },
    children,
  )
}
