import { type Ref, type RefObject, useImperativeHandle, useRef } from 'react'
import type { AudioHandle } from './audio-types.ts'
import type { MediaHandle } from './types.ts'

/** Keep handle identity across engine observations, especially during async seeks. */
export function useAudioHandle(
  session: RefObject<MediaHandle | null>,
  ref: Ref<AudioHandle> | undefined,
) {
  const player = useRef<AudioHandle | null>(null)
  useImperativeHandle(player, () => {
    const current = () => {
      if (!session.current) throw new Error('Audio is not mounted')
      return session.current
    }
    return {
      play: async () => current().play(),
      pause: () => session.current?.pause(),
      seekTo: async (seconds) => current().seekTo(seconds),
      getStatus: () => current().getStatus(),
    }
  }, [session])
  useImperativeHandle(ref, () => player.current as AudioHandle, [])
  return player
}
