import { createContext, type ReactNode, useContext, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'

export interface PortalProps {
  children?: ReactNode
  container?: Element | DocumentFragment | null
  disabled?: boolean
}

const PortalContext = createContext<{
  container: Element | DocumentFragment | null
}>({
  container: null,
})

/**
 * Optional PortalProvider to override default portal mounting target.
 */
export function PortalProvider({
  children,
  container,
}: {
  children: ReactNode
  container: Element | DocumentFragment | null
}) {
  return <PortalContext.Provider value={{ container }}>{children}</PortalContext.Provider>
}

/**
 * Universal `<Portal>` component for Web.
 * Renders children into a DOM container (default: `document.body`) outside parent DOM hierarchy.
 */
export function Portal({ children, container, disabled = false }: PortalProps) {
  const context = useContext(PortalContext)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  if (disabled) {
    return <>{children}</>
  }

  if (!mounted || typeof document === 'undefined') {
    return null
  }

  const target = container ?? context.container ?? document.body
  if (!target) {
    return null
  }

  return createPortal(children, target)
}

/**
 * Marker host element for Web (acts as default target anchor if placed explicitly).
 */
export function PortalHost({
  id = '__hozo_portal_host',
  className,
}: {
  id?: string
  className?: string
}) {
  return <div id={id} className={className} />
}
