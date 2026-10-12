import { useCallback, useReducer, useRef } from 'react'
import type { VideoProps } from './types.ts'
import { VideoPresentation } from './video-presentation.ts'

export function useVideoPresentation(props: VideoProps) {
  const latest = useRef(props)
  latest.current = props
  const current = useRef<VideoPresentation | null>(null)
  const [, render] = useReducer((version: number) => version + 1, 0)
  const create = useCallback(() => {
    const owner = new VideoPresentation((stateChanged) => {
      if (current.current !== owner || latest.current.poster === undefined) return
      if (stateChanged || (latest.current.controls ?? true)) render()
    })
    current.current = owner
    render()
    return owner
  }, [])
  const retire = useCallback((owner: VideoPresentation) => {
    owner.dispose()
    if (current.current === owner) current.current = null
  }, [])
  const beginViewing = useCallback(() => current.current?.beginViewing(), [])
  return {
    create,
    retire,
    beginViewing,
    status: current.current?.status ?? null,
    showingPoster: props.poster !== undefined && (current.current?.showingPoster ?? true),
  }
}
