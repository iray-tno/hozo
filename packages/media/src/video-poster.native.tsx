import { Image } from 'react-native'
import type { VideoProps } from './types.ts'
import { usePosterImage } from './use-poster-image.ts'

export function VideoPoster({
  src,
  poster,
  fit,
  style,
  onPosterError,
}: VideoProps & { poster: string }) {
  const image = usePosterImage(src, poster, onPosterError)
  return image.hidden ? null : (
    <Image
      source={{ uri: poster }}
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
      resizeMode={fit === 'fill' ? 'stretch' : (fit ?? 'contain')}
      onError={({ nativeEvent }) => image.fail(nativeEvent.error || 'Video poster could not load')}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        backgroundColor: style?.backgroundColor ?? '#000',
      }}
    />
  )
}
