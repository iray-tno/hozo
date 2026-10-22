import React, {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useId,
  useMemo,
  useState,
} from 'react'
import { View } from 'react-native'

export interface PortalProps {
  /**
   * Tailwind classes, the same prop the Web half takes.
   *
   * On a tag the compiler lowers it is gone by runtime, replaced by a
   * `StyleSheet` entry. Anywhere else it is carried and ignored here --
   * this side has no CSS engine to resolve a class list against -- and
   * the type still has to accept it, because an app is type-checked
   * against the source the compiler reads rather than its output.
   */
  className?: string
  children?: ReactNode
  name?: string
  disabled?: boolean
}

type PortalMethods = {
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

  // Portal effects depend on this API, not the item snapshot. Recreating it
  // after a registration makes that effect unregister/register forever.
  const methods = useMemo<PortalMethods>(() => {
    const put: PortalMethods['update'] = (id, node) => {
      setItems((prev) => {
        if (prev.has(id) && prev.get(id) === node) return prev
        const next = new Map(prev)
        next.set(id, node)
        return next
      })
    }
    return {
      update: put,
      unmount: (id) => {
        setItems((prev) => {
          if (!prev.has(id)) return prev
          const next = new Map(prev)
          next.delete(id)
          return next
        })
      },
    }
  }, [])

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
export function PortalHost({
  items: directItems,
}: {
  items?: Map<string, ReactNode>
  /**
   * Accepted and unused, so the two halves agree on the prop every other
   * component takes. The rest of this component's props do not agree --
   * the Web half is a marker `<div>` taking an `id`, this one renders the
   * items -- which is a divergence of its own and not this one's to fix.
   */
  className?: string
}) {
  if (!directItems || directItems.size === 0) {
    return null
  }

  return React.createElement(
    View,
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
    // A changed child is an in-place item update, not an unregister/register:
    // deleting/readding the same key would move it after unaffected siblings.
    return () => {
      portal.unmount(id)
    }
  }, [disabled, portal, id])

  useEffect(() => {
    if (disabled || !portal) return
    portal.update(id, children)
  }, [disabled, portal, id, children])

  if (disabled || !portal) {
    return <>{children}</>
  }

  return null
}
