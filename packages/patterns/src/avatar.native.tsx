import { useHozoI18n, useHozoMessage } from '@hozo/behaviors'
import { type ReactNode, useState } from 'react'
import {
  Image,
  type ImageStyle,
  type StyleProp,
  Text,
  type TextStyle,
  View,
  type ViewStyle,
} from 'react-native'
import { avatarInitials, avatarLabel, type HozoAvatarStatus } from './avatar-initials.ts'
import { splitTextStyle } from './text-style.native.ts'

export type { HozoAvatarStatus }

export interface HozoAvatarProps {
  src?: string
  name?: string
  initials?: string
  fallback?: ReactNode
  status?: HozoAvatarStatus
  accessibilityLabel?: string
  /**
   * Tailwind classes, the same props the Web half takes. Read by the
   * compiler, which hands them over as the style props below; a file it did
   * not read leaves them here, where a Native pattern has no class list to
   * resolve.
   */
  className?: string
  imageClassName?: string
  fallbackClassName?: string
  statusClassName?: string
  style?: StyleProp<ViewStyle | TextStyle>
  imageStyle?: StyleProp<ImageStyle>
  fallbackStyle?: StyleProp<ViewStyle | TextStyle>
  statusStyle?: StyleProp<ViewStyle>
  testID?: string
}

/**
 * A person's picture, or their initials when there is none, on React
 * Native: one `image` element named for the person, its parts hidden, for
 * the reason the Web half gives.
 *
 * The picture fills the avatar and is clipped to it, so a `rounded-full` on
 * the avatar is a round photograph. The text half of `style` -- a colour, a
 * size -- goes to the initials, which is where the Web's inheritance would
 * have put it.
 */
export function HozoAvatar({
  src,
  name,
  initials,
  fallback,
  status,
  accessibilityLabel,
  style,
  imageStyle,
  fallbackStyle,
  statusStyle,
  testID,
}: HozoAvatarProps) {
  const message = useHozoMessage()
  const { locale } = useHozoI18n()
  const [failed, setFailed] = useState<string | undefined>(undefined)
  // Keyed by the picture that failed, so a new `src` is a new attempt.
  const showImage = src !== undefined && failed !== src
  const letters = initials ?? (name ? avatarInitials(name, locale) : '')
  const label = avatarLabel(message, name, status, accessibilityLabel)
  const [box, text] = splitTextStyle(style)
  const [fallbackBox, fallbackText] = splitTextStyle(fallbackStyle)

  const hidden = {
    accessibilityElementsHidden: true,
    importantForAccessibility: 'no-hide-descendants',
  } as const
  return (
    <View
      {...(label === undefined
        ? hidden
        : { accessible: true, accessibilityRole: 'image' as const, accessibilityLabel: label })}
      style={[AVATAR, box]}
      testID={testID}
    >
      {showImage ? (
        <Image
          source={{ uri: src }}
          style={[FILL, imageStyle]}
          onError={() => setFailed(src)}
          {...hidden}
        />
      ) : (
        <View style={[CENTRED, fallbackBox]} {...hidden}>
          {letters ? <Text style={[text, fallbackText]}>{letters}</Text> : fallback}
        </View>
      )}
      {status ? <View style={statusStyle} {...hidden} /> : null}
    </View>
  )
}

const AVATAR: ViewStyle = { overflow: 'hidden', alignItems: 'center', justifyContent: 'center' }
const FILL: ImageStyle = { width: '100%', height: '100%' }
const CENTRED: ViewStyle = { alignItems: 'center', justifyContent: 'center' }

export { HozoAvatar as Avatar, type HozoAvatarProps as AvatarProps }
