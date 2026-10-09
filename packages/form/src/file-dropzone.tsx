import { LiveRegion, useHozoI18n, useHozoMessage } from '@hozo/behaviors'
import { type DragEvent, type ReactNode, useRef, useState } from 'react'
import {
  type FileRules,
  type HozoFileRejection,
  type HozoPickedFile,
  sortFiles,
} from './file-rules.ts'
import { pickAnnouncement } from './file-words.ts'

export type { HozoFileRejection, HozoPickedFile }

export interface HozoFileDropzoneProps extends FileRules {
  /** The files kept, after `accept`, the sizes and the count. */
  onFilesSelected?: (files: HozoPickedFile[]) => void
  /** The files refused, each with its reason. */
  onRejected?: (rejections: HozoFileRejection[]) => void
  disabled?: boolean
  /** The control's name -- "Upload profile photo". */
  accessibilityLabel: string
  /** What the zone shows: the instruction, usually. Read as part of its name. */
  children?: ReactNode
  className?: string
  /** Added while a file is dragged over the zone. */
  activeClassName?: string
  /**
   * React Native only: a picker of the application's own. Carried here so
   * one screen type-checks on both platforms.
   */
  pickFiles?: unknown
  testID?: string
}

/**
 * A place to drop files, which is also a button that opens the file picker
 * (#151).
 *
 * ## A button first
 *
 * Dragging is a pointer gesture with no keyboard or screen-reader
 * equivalent, so the zone is a real `<button>` -- Enter and Space open the
 * file input, as a click does -- and the drop is the shortcut on top of it,
 * not the only way in. The picker is an `<input type="file">` kept out of the
 * tab order and the accessibility tree, because the button is the control.
 *
 * ## Said once a pick is made
 *
 * What was added and what was refused, with each refusal's reason -- "a.gif
 * is not an accepted kind of file" -- is announced politely in one sentence.
 * A refusal a sighted person sees as a red line under the zone is otherwise
 * nothing at all to a reader. The words go through the project's
 * translations (decision 008) and the sizes are formatted in its locale.
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
  className,
  activeClassName,
  testID,
}: HozoFileDropzoneProps) {
  const message = useHozoMessage()
  const { locale } = useHozoI18n()
  const input = useRef<HTMLInputElement>(null)
  // A count, not a flag: `dragenter` and `dragleave` fire for every child the
  // pointer crosses, so leaving a child is not leaving the zone.
  const depth = useRef(0)
  const [active, setActive] = useState(false)
  const [announcement, setAnnouncement] = useState('')

  const take = (list: FileList | null) => {
    if (!list || list.length === 0) return
    const picked: HozoPickedFile[] = Array.from(list, (file) => ({
      name: file.name,
      size: file.size,
      type: file.type,
      file,
    }))
    const { accepted, rejected } = sortFiles(picked, {
      accept,
      maxSize,
      minSize,
      multiple,
      maxFiles,
    })
    setAnnouncement(pickAnnouncement(message, accepted, rejected, { maxSize, maxFiles }, locale))
    if (accepted.length > 0) onFilesSelected?.(accepted)
    if (rejected.length > 0) onRejected?.(rejected)
  }

  const onDrag = (event: DragEvent<HTMLButtonElement>, change: 1 | -1 | 0) => {
    if (disabled) return
    event.preventDefault()
    if (change === 0) return
    depth.current = Math.max(0, depth.current + change)
    setActive(depth.current > 0)
  }

  return (
    <>
      <button
        type="button"
        aria-label={accessibilityLabel}
        disabled={disabled}
        data-hozo-drag-active={active ? '' : undefined}
        className={[className, active && activeClassName].filter(Boolean).join(' ') || undefined}
        data-testid={testID}
        onClick={() => input.current?.click()}
        onDragEnter={(event) => onDrag(event, 1)}
        onDragLeave={(event) => onDrag(event, -1)}
        // `dragover` must be cancelled for `drop` to fire at all.
        onDragOver={(event) => onDrag(event, 0)}
        onDrop={(event) => {
          if (disabled) return
          event.preventDefault()
          depth.current = 0
          setActive(false)
          take(event.dataTransfer.files)
        }}
      >
        {children}
      </button>
      <input
        ref={input}
        type="file"
        accept={accept?.join(',')}
        multiple={multiple}
        disabled={disabled}
        tabIndex={-1}
        aria-hidden
        hidden
        onChange={(event) => {
          take(event.target.files)
          // The same file picked twice is still a pick.
          event.target.value = ''
        }}
      />
      <LiveRegion>{announcement}</LiveRegion>
    </>
  )
}

export { HozoFileDropzone as FileDropzone, type HozoFileDropzoneProps as FileDropzoneProps }
