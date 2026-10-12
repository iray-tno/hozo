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
    <img
      src={poster}
      alt=""
      aria-hidden="true"
      onError={() => image.fail('Video poster could not load')}
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        objectFit: fit ?? 'contain',
        backgroundColor: style?.backgroundColor ?? '#000',
        pointerEvents: 'none',
      }}
    />
  )
}
