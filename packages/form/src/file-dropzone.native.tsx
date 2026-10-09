import { useHozoI18n, useHozoMessage } from '@hozo/behaviors'
import { type ReactNode, useState } from 'react'
import { AccessibilityInfo, Pressable, type StyleProp, type ViewStyle } from 'react-native'
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
  /** Web only: classes, which a Native pattern has no list to resolve. */
  className?: string
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
 * Hozo ships no native code, and opening the system's document picker needs
 * some. So the zone uses one the application has: `pickFiles` when given,
 * else `expo-document-picker` when installed -- a `require` Metro treats as
 * optional inside `try` -- else none, and it says so once rather than
 * offering a button that does nothing. A future `@hozo/native` would be one
 * more candidate ahead of the third-party one, and no existing user pays for
 * it.
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
 * picker. Phones have no drag and drop between applications in the sense
 * the Web does, so the Web half's drop target is its button here, and the
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
  style,
  testID,
}: HozoFileDropzoneProps) {
  const message = useHozoMessage()
  const { locale } = useHozoI18n()
  const [busy, setBusy] = useState(false)
  if (documentPicker === undefined && !pickFiles) documentPicker = resolveDocumentPicker()
  const picker = pickFiles ?? documentPicker ?? null
  if (!picker && !warned) {
    warned = true
    console.warn(
      '[hozo] FileDropzone has no picker: pass `pickFiles`, or install `expo-document-picker`. ' +
        'Hozo ships no native code, and opening the system picker needs some.',
    )
  }
  const unavailable = picker === null

  const open = async () => {
    if (!picker || busy) return
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
      accessibilityState={{ disabled: Boolean(disabled) || unavailable, busy }}
      disabled={disabled || unavailable}
      onPress={open}
      style={style}
      testID={testID}
    >
      {children}
    </Pressable>
  )
}

export { HozoFileDropzone as FileDropzone, type HozoFileDropzoneProps as FileDropzoneProps }
