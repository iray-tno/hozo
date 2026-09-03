import React, { createContext, type ReactNode, useContext, useEffect, useId, useState } from 'react'

export interface PortalProps {
  children?: ReactNode
  name?: string
  disabled?: boolean
}

type PortalMethods = {
  mount: (id: string, children: ReactNode) => void
  update: (id: string, children: ReactNode) => void
  unmount: (id: string) => void
}

const PortalContext = createContext<PortalMethods | null>(null)

/**
 * Global PortalProvider for React Native applications.
 * Typically placed at the root of the app next to the root View.
 */
export function PortalProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Map<string, ReactNode>>(() => new Map())

  const methods: PortalMethods = {
    mount: (id, node) => {
      setItems((prev) => {
        const next = new Map(prev)
        next.set(id, node)
        return next
      })
    },
    update: (id, node) => {
      setItems((prev) => {
        const next = new Map(prev)
        next.set(id, node)
        return next
      })
    },
    unmount: (id) => {
      setItems((prev) => {
        const next = new Map(prev)
        next.delete(id)
        return next
      })
    },
  }

  return (
    <PortalContext.Provider value={methods}>
      {children}
      <PortalHost items={items} />
    </PortalContext.Provider>
  )
}

/**
 * Root host that renders the active portaled items at the top of the React Native view hierarchy.
 */
export function PortalHost({ items: directItems }: { items?: Map<string, ReactNode> }) {
  if (!directItems || directItems.size === 0) {
    return null
  }

  return React.createElement(
    'View',
    {
      pointerEvents: 'box-none',
      style: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
      },
    },
    Array.from(directItems.entries()).map(([id, node]) => (
      <React.Fragment key={id}>{node}</React.Fragment>
    )),
  )
}

/**
 * Universal `<Portal>` component for React Native.
 * Teleports children to the nearest `PortalHost` / `PortalProvider`.
 */
export function Portal({ children, disabled = false }: PortalProps) {
  const portal = useContext(PortalContext)
  const id = useId()

  useEffect(() => {
    if (disabled || !portal) return
    portal.mount(id, children)
    return () => {
      portal.unmount(id)
    }
  }, [disabled, portal, id, children])

  useEffect(() => {
    if (disabled || !portal) return
    portal.update(id, children)
  }, [disabled, portal, id, children])

  if (disabled || !portal) {
    return <>{children}</>
  }

  return null
}
