import { useHozoI18n, useHozoMessage } from '@hozo/behaviors'
import { type ReactNode, useState } from 'react'
import { avatarInitials, avatarLabel, type HozoAvatarStatus } from './avatar-initials.ts'

export type { HozoAvatarStatus }

export interface HozoAvatarProps {
  /** The picture. Left out, or failing to load, the initials are shown. */
  src?: string
  /**
   * Who the avatar is: its accessible name, and where the initials come
   * from. Left out, the avatar is decoration and hidden from assistive
   * technology -- a face beside a name already written out says nothing a
   * reader has not just heard.
   */
  name?: string
  /** Overrides the letters drawn from `name`; see `avatarInitials`. */
  initials?: string
  /** What is shown with neither a picture nor initials. */
  fallback?: ReactNode
  /** A presence dot, which is read with the name: "Ada Lovelace, online". */
  status?: HozoAvatarStatus
  /** Overrides the whole accessible name, status included. */
  accessibilityLabel?: string
  className?: string
  imageClassName?: string
  fallbackClassName?: string
  statusClassName?: string
  testID?: string
}

/**
 * A person's picture, or their initials when there is none (#144).
 *
 * ## One image, whatever is drawn
 *
 * A reader meets an avatar as one thing with one name -- `role="img"` and
 * the name, with the status after it -- whether a photograph, two letters or
 * an icon is on screen. The parts are hidden, because the letters "AL" read
 * aloud, or a photograph's own `alt`, would be a second, worse name for the
 * same person.
 *
 * ## The picture falls back
 *
 * A picture that fails to load is replaced by the initials rather than left
 * as a broken image; a new `src` tries again. That switch is the behaviour
 * this component exists for, and why it is a pattern rather than markup: the
 * look -- size, shape, the dot's colour per status -- is `@hozo/ui`'s, and
 * reads the status off `data-hozo-status`.
 */
export function HozoAvatar({
  src,
  name,
  initials,
  fallback,
  status,
  accessibilityLabel,
  className,
  imageClassName,
  fallbackClassName,
  statusClassName,
  testID,
}: HozoAvatarProps) {
  const message = useHozoMessage()
  const { locale } = useHozoI18n()
  const [failed, setFailed] = useState<string | undefined>(undefined)
  // Keyed by the picture that failed, so a new `src` is a new attempt.
  const showImage = src !== undefined && failed !== src
  const letters = initials ?? (name ? avatarInitials(name, locale) : '')
  const label = avatarLabel(message, name, status, accessibilityLabel)

  return (
    <span
      role={label === undefined ? undefined : 'img'}
      aria-label={label}
      aria-hidden={label === undefined ? true : undefined}
      className={className}
      data-hozo-avatar=""
      data-testid={testID}
    >
      {showImage ? (
        <img
          src={src}
          alt=""
          aria-hidden
          className={imageClassName}
          onError={() => setFailed(src)}
        />
      ) : (
        <span aria-hidden className={fallbackClassName}>
          {letters || fallback}
        </span>
      )}
      {status ? <span aria-hidden className={statusClassName} data-hozo-status={status} /> : null}
    </span>
  )
}

export { HozoAvatar as Avatar, type HozoAvatarProps as AvatarProps }
