import type { CSSProperties, ReactNode } from 'react'

export type LiveRegionMode = 'polite' | 'assertive'

export interface LiveRegionProps {
  children?: ReactNode
  mode?: LiveRegionMode
  className?: string
  style?: CSSProperties
}

const visuallyHiddenStyle: CSSProperties = {
  position: 'absolute',
  width: 1,
  height: 1,
  padding: 0,
  margin: -1,
  overflow: 'hidden',
  clip: 'rect(0, 0, 0, 0)',
  whiteSpace: 'nowrap',
  borderWidth: 0,
}

/**
 * Universal `<LiveRegion>` component for Web.
 * Renders an accessible off-screen container that announces content changes to screen readers.
 */
export function LiveRegion({ children, mode = 'polite', className, style }: LiveRegionProps) {
  return (
    <div
      role={mode === 'assertive' ? 'alert' : 'status'}
      aria-live={mode}
      aria-atomic="true"
      className={className}
      style={{ ...visuallyHiddenStyle, ...style }}
    >
      {children}
    </div>
  )
}

/**
 * Imperative announcement hook for Web.
 * Dynamically updates an internal live region to announce messages to screen readers.
 */
export function useAnnounce() {
  return (message: string, mode: LiveRegionMode = 'polite') => {
    if (typeof document === 'undefined') return
    const id = '__hozo_live_announcer'
    let container = document.getElementById(id)
    if (!container) {
      container = document.createElement('div')
      container.id = id
      Object.assign(container.style, visuallyHiddenStyle)
      document.body.appendChild(container)
    }

    const region = document.createElement('div')
    region.setAttribute('role', mode === 'assertive' ? 'alert' : 'status')
    region.setAttribute('aria-live', mode)
    region.setAttribute('aria-atomic', 'true')
    container.appendChild(region)

    // Delay insertion slightly to trigger DOM mutation observers in assistive tech
    setTimeout(() => {
      region.textContent = message
    }, 50)

    // Cleanup node after announcement has been picked up
    setTimeout(() => {
      region.remove()
    }, 1000)
  }
}
