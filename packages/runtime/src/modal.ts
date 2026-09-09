import { createElement, type ReactNode, useEffect, useRef } from 'react'

import { type HozoDomStyle, hozoDomStyle } from './dom-style.ts'

export interface HozoModalProps {
  visible?: boolean
  transparent?: boolean
  animationType?: 'none' | 'slide' | 'fade'
  presentationStyle?: 'fullScreen' | 'pageSheet' | 'formSheet' | 'overFullScreen'
  onRequestClose?: () => void
  onShow?: () => void
  supportedOrientations?: readonly string[]
  statusBarTranslucent?: boolean
  navigationBarTranslucent?: boolean
  hardwareAccelerated?: boolean
  style?: HozoDomStyle
  className?: string
  testID?: string
  children?: ReactNode
}

/** React Native Modal semantics backed by the browser's top-layer dialog. */
export function HozoModal({
  visible = false,
  transparent = false,
  animationType = 'none',
  presentationStyle = 'fullScreen',
  onRequestClose,
  onShow,
  supportedOrientations: _supportedOrientations,
  statusBarTranslucent: _statusBarTranslucent,
  navigationBarTranslucent: _navigationBarTranslucent,
  hardwareAccelerated: _hardwareAccelerated,
  style,
  className,
  testID,
  children,
}: HozoModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const openerRef = useRef<HTMLElement | null>(null)
  const onShowRef = useRef(onShow)
  onShowRef.current = onShow

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (visible && !dialog.open) {
      openerRef.current =
        document.activeElement instanceof HTMLElement ? document.activeElement : null
      dialog.showModal()
      onShowRef.current?.()
    } else if (!visible && dialog.open) {
      dialog.close()
      const opener = openerRef.current
      if (opener?.isConnected && !opener.hasAttribute('disabled')) opener.focus()
      openerRef.current = null
    }
  }, [visible])

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    const cancel = (event: Event) => {
      event.preventDefault()
      onRequestClose?.()
    }
    dialog.addEventListener('cancel', cancel)
    return () => dialog.removeEventListener('cancel', cancel)
  }, [onRequestClose])

  return createElement(
    'dialog',
    {
      ref: dialogRef,
      className,
      style: hozoDomStyle(style),
      'data-testid': testID,
      'data-hozo-modal': '',
      'data-hozo-transparent': transparent ? '' : undefined,
      'data-hozo-animation': animationType === 'none' ? undefined : animationType,
      'data-hozo-presentation': presentationStyle,
    },
    children,
  )
}
