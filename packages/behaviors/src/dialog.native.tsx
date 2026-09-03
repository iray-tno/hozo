import type { ReactNode } from 'react'
import { Modal, type StyleProp, View, type ViewStyle } from 'react-native'

export interface HozoDialogProps {
  open?: boolean
  onClose?: () => void
  accessibilityLabel?: string
  accessibilityHint?: string
  style?: unknown
  children?: ReactNode
}

export function HozoDialog({
  open = false,
  onClose,
  accessibilityLabel,
  accessibilityHint,
  style,
  children,
}: HozoDialogProps) {
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
