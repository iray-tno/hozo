let warned = false

/**
 * Preserve evaluation/identity of authored props, but name the platform
 * boundary: RN has no DOM dataset. Metadata is not an accessibility label
 * or nativeID. Do not fabricate either from an application's data channel.
 * The compiler uses this for opaque spreads; the fallback uses it too.
 */
export function hozoButtonProps<T>(props: T): T {
  if (!warned && props !== null && typeof props === 'object') {
    for (const name in props) {
      if (Object.hasOwn(props, name) && name.startsWith('data-')) {
        warned = true
        console.warn(
          '[hozo] Button data-* metadata requires a Web DOM dataset; React Native does not consume it. nativeID remains available on both platforms. No data values are mapped to accessibility props.',
        )
        break
      }
    }
  }
  return props
}
