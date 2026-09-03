import type { ReactNode } from 'react'
import { Modal, type StyleProp, View, type ViewStyle } from 'react-native'

export interface DialogProps {
  open?: boolean
  onClose?: () => void
  accessibilityLabel?: string
  accessibilityHint?: string
  style?: unknown
  children?: ReactNode
}

export function Dialog({
  open = false,
  onClose,
  accessibilityLabel,
  accessibilityHint,
  style,
  children,
}: DialogProps) {
  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={onClose}>
      <View
        style={style as StyleProp<ViewStyle>}
        accessible
        accessibilityViewIsModal
        accessibilityRole="none"
        accessibilityLabel={accessibilityLabel}
        accessibilityHint={accessibilityHint}
      >
        {children}
      </View>
    </Modal>
  )
}

export { Dialog as HozoDialog, type DialogProps as HozoDialogProps }
