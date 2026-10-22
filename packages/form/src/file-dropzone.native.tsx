import { useHozoI18n, useHozoMessage } from '@hozo/behaviors'
import { usePressableInteraction } from '@hozo/behaviors/pressable-interaction'
import { hozoSplitTextStyle } from '@hozo/engine'
import { hozoClasses } from '@hozo/engine/project'
import { Children, type ReactNode, useEffect, useState } from 'react'
import {
  AccessibilityInfo,
  Pressable,
  type StyleProp,
  StyleSheet,
  Text,
  type TextStyle,
  type ViewStyle,
} from 'react-native'
import { nonControlClassFacts } from './class-facts.native.ts'
import {
  type FileRules,
  type HozoFileRejection,
  type HozoPickedFile,
  sortFiles,
} from './file-rules.ts'
import { pickAnnouncement } from './file-words.ts'

export type { HozoFileRejection, HozoPickedFile }

/** Opens a picker and returns what was picked, or `null` when it was cancelled. */
export type HozoFilePicker = (options: {
  accept?: readonly string[]
  multiple: boolean
}) => Promise<HozoPickedFile[] | null>

export interface HozoFileDropzoneProps extends FileRules {
  onFilesSelected?: (files: HozoPickedFile[]) => void
  onRejected?: (rejections: HozoFileRejection[]) => void
  disabled?: boolean
  accessibilityLabel: string
  children?: ReactNode
  /**
   * The application's own picker -- `expo-image-picker` for photos, a native
   * module of its own -- used ahead of `expo-document-picker`.
   */
  pickFiles?: HozoFilePicker
  /** Project classes on the picker button, with its own interaction/form facts. */
  className?: string
  /** Web drag-over only. Not press feedback or the Native picker's busy state. */
  activeClassName?: string
  style?: StyleProp<ViewStyle>
  testID?: string
}

interface DocumentPickerModule {
  getDocumentAsync(options: {
    type?: string | string[]
    multiple?: boolean
    copyToCacheDirectory?: boolean
  }): Promise<{
    canceled: boolean
    assets?: { uri: string; name: string; size?: number; mimeType?: string }[] | null
  }>
}

/**
 * The picker this platform has, resolved once (#353's seam).
 *
 * This package includes no document-picker module. The zone uses one the
 * application has: `pickFiles` when given,
 * else `expo-document-picker` when installed -- a `require` Metro treats as
 * optional inside `try` -- else none, and it says so once rather than
 * offering a button that does nothing. A future Hozo document-picker adapter
 * could be another candidate without requiring it in every application.
 */
function resolveDocumentPicker(): HozoFilePicker | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const module = require('expo-document-picker') as DocumentPickerModule
    if (typeof module.getDocumentAsync !== 'function') return null
    return async ({ accept, multiple }) => {
      // The picker filters by MIME type only; an extension rule (`.pdf`)
      // opens it to everything and is applied to what comes back instead.
      const types = accept?.filter((rule) => !rule.startsWith('.'))
      const type =
        !accept || accept.length === 0 || types?.length !== accept.length
          ? '*/*'
          : [...(types ?? [])]
      const result = await module.getDocumentAsync({ type, multiple, copyToCacheDirectory: true })
      if (result.canceled || !result.assets) return null
      return result.assets.map((asset) => ({
        name: asset.name,
        size: asset.size ?? 0,
        type: asset.mimeType ?? '',
        uri: asset.uri,
      }))
    }
  } catch {
    return null
  }
}

let documentPicker: HozoFilePicker | null | undefined
let warned = false

/**
 * A place to add files, on React Native: a button that opens the system's
 * picker. This implementation has no native file-drag event source, so the
 * Web half's drop target is its button here, and the
 * same rules sort what comes back and the same sentence announces it.
 */
export function HozoFileDropzone({
  accept,
  maxSize,
  minSize,
  multiple,
  maxFiles,
  onFilesSelected,
  onRejected,
  disabled,
  accessibilityLabel,
  children,
  pickFiles,
  className,
  style,
  testID,
}: HozoFileDropzoneProps) {
  const message = useHozoMessage()
  const { locale } = useHozoI18n()
  const [busy, setBusy] = useState(false)
  const { state, handlers } = usePressableInteraction({ focusVisible: true })
  if (documentPicker === undefined && !pickFiles) documentPicker = resolveDocumentPicker()
  const picker = pickFiles ?? documentPicker ?? null
  if (!picker && !warned) {
    warned = true
    console.warn(
      '[hozo] FileDropzone has no picker: pass `pickFiles`, or install `expo-document-picker`. ' +
        'The form package includes no document-picker module.',
    )
  }
  const unavailable = picker === null
  const isDisabled = Boolean(disabled) || unavailable
  useEffect(() => {
    if (isDisabled) {
      handlers.blur()
      handlers.pressOut()
    }
  }, [isDisabled, handlers])
  const [box, text] = hozoSplitTextStyle(
    StyleSheet.flatten([
      hozoClasses(className, {
        ...nonControlClassFacts,
        ...state,
        disabled: isDisabled,
        enabled: !isDisabled,
        pressed: !isDisabled && state.pressed,
        focused: !isDisabled && state.focused,
        focusVisible: !isDisabled && state.focusVisible,
        // The Web button authors neither attribute. Native's busy/disabled
        // announcements do not manufacture extra ARIA styling predicates.
        'aria-busy': false,
      }),
      style,
    ]) ?? {},
  )

  const open = async () => {
    if (!picker || disabled || busy) return
    setBusy(true)
    try {
      const picked = await picker({ accept, multiple: Boolean(multiple) })
      if (!picked || picked.length === 0) return
      const { accepted, rejected } = sortFiles(picked, {
        accept,
        maxSize,
        minSize,
        multiple,
        maxFiles,
      })
      AccessibilityInfo.announceForAccessibility(
        pickAnnouncement(message, accepted, rejected, { maxSize, maxFiles }, locale),
      )
      if (accepted.length > 0) onFilesSelected?.(accepted)
      if (rejected.length > 0) onRejected?.(rejected)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={unavailable ? message('hozo.fileDropzone.unavailable') : undefined}
      accessibilityState={{ disabled: isDisabled, busy }}
      disabled={isDisabled}
      onPress={open}
      onHoverIn={handlers.hoverIn}
      onHoverOut={handlers.hoverOut}
      onFocus={() => {
        if (!isDisabled) handlers.focus()
      }}
      onBlur={handlers.blur}
      onPressIn={() => {
        if (!isDisabled) handlers.pressIn()
      }}
      onPressOut={handlers.pressOut}
      onPointerDown={handlers.pointerDown}
      onKeyDown={handlers.keyDown}
      style={box as ViewStyle}
      testID={testID}
    >
      {/* Only literal labels are ours to wrap/style. Opaque content retains
          its own declarations: no cloning or default context rollout here. */}
      {Children.map(children, (child) =>
        typeof child === 'string' || typeof child === 'number' ? (
          <Text style={text as TextStyle}>{child}</Text>
        ) : (
          child
        ),
      )}
    </Pressable>
  )
}

export { HozoFileDropzone as FileDropzone, type HozoFileDropzoneProps as FileDropzoneProps }
