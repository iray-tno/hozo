/**
 * An avatar with a look, wearing `@hozo/patterns`.
 *
 * The behaviour is the pattern's: the picture falling back to initials, one
 * image named for the person, the status read after the name. This file
 * draws a circle at three sizes and a dot in a colour per status.
 *
 * ## The status colour is chosen here, not by a selector
 *
 * The Web half could read the status off `data-hozo-status`, and a version
 * that did would be shorter. React Native has no selectors -- a
 * `data-[hozo-status=busy]:` class is reported there and draws nothing -- so
 * the colour is picked in this component from the same prop, and both
 * platforms get it.
 *
 * Online is `hozo-presence`, a token added for it: every other token names a
 * role the interface already had (accent, danger), and "here" was not one.
 */

import { Avatar, type AvatarProps } from '@hozo/core'

export type HozoAvatarSize = 'sm' | 'md' | 'lg'

export interface HozoAvatarProps extends AvatarProps {
  size?: HozoAvatarSize
}

const sm =
  'relative items-center justify-center rounded-full size-8 text-xs font-medium bg-hozo-surface-raised text-hozo-text-body'
const md =
  'relative items-center justify-center rounded-full size-10 text-sm font-medium bg-hozo-surface-raised text-hozo-text-body'
const lg =
  'relative items-center justify-center rounded-full size-14 text-lg font-medium bg-hozo-surface-raised text-hozo-text-body'

const image = 'size-full object-cover'

const online =
  'absolute bottom-0 end-0 size-3 rounded-full border-2 border-hozo-surface bg-hozo-presence'
const busy =
  'absolute bottom-0 end-0 size-3 rounded-full border-2 border-hozo-surface bg-hozo-danger'
const offline =
  'absolute bottom-0 end-0 size-3 rounded-full border-2 border-hozo-surface bg-hozo-border-strong'

// Not named `HozoAvatar` here: compiled output imports a runtime component
// under that name for the `<Avatar>` below (#670), so the local binding takes
// another and the export restores the public name.
function StyledAvatar({
  size = 'md',
  status,
  className,
  imageClassName,
  statusClassName,
  ...rest
}: HozoAvatarProps) {
  const own = size === 'sm' ? sm : size === 'lg' ? lg : md
  const dot = status === 'online' ? online : status === 'busy' ? busy : offline
  return (
    <Avatar
      {...rest}
      status={status}
      className={className ? `${own} ${className}` : own}
      imageClassName={imageClassName ? `${image} ${imageClassName}` : image}
      statusClassName={statusClassName ? `${dot} ${statusClassName}` : dot}
    />
  )
}

export { type HozoAvatarProps as AvatarProps, StyledAvatar as Avatar, StyledAvatar as HozoAvatar }
