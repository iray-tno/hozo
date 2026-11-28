// Charts that share one active category (RFC 015 §5): pointing at or
// stepping to a month in one chart shows that month in every chart inside
// the same `ChartSync`, as Recharts' `syncId` does.
//
// The charts match by category label, not by row index, so two charts whose
// rows differ still meet on the months they share. Only the chart the reader
// is using speaks: the others show the tooltip, and a screen reader hears
// one sentence rather than one per chart.

import { createContext, type ReactNode, useCallback, useContext, useMemo, useState } from 'react'

export interface ChartSyncProps {
  /**
   * The active category, to control it from outside, for example to show
   * the selected month elsewhere on the page. Uncontrolled when absent.
   */
  category?: string | null
  /** Called with the category a reader moves to, or null when they leave. */
  onCategoryChange?: (category: string | null) => void
  children?: ReactNode
}

interface Shared {
  category: string | null
  /** The chart the reader moved in, which alone announces. */
  source: string | null
  move(category: string | null, source: string): void
}

const SyncContext = createContext<Shared | undefined>(undefined)

export function ChartSync({ category, onCategoryChange, children }: ChartSyncProps) {
  const [own, setOwn] = useState<{ category: string | null; source: string | null }>({
    category: null,
    source: null,
  })
  const move = useCallback(
    (next: string | null, source: string) => {
      setOwn({ category: next, source })
      onCategoryChange?.(next)
    },
    [onCategoryChange],
  )
  const current = category === undefined ? own.category : category
  // A category set from outside that no chart moved to has no speaker.
  const source = current === own.category ? own.source : null
  const value = useMemo(() => ({ category: current, source, move }), [current, source, move])
  return <SyncContext.Provider value={value}>{children}</SyncContext.Provider>
}

/**
 * The active datum of a chart: its own, or the shared category's row in
 * it, and whether this chart is the one that speaks.
 */
export function syncedActive(
  categories: readonly string[],
  shared: { category: string | null; source: string | null },
  id: string,
): { active: number | undefined; speaks: boolean } {
  const index = shared.category === null ? -1 : categories.indexOf(shared.category)
  return {
    active: index < 0 ? undefined : index,
    speaks: shared.source === id,
  }
}

/** `[active, setActive, speaks]` for a chart, shared when inside a `ChartSync`. */
export function useActiveDatum(
  categories: readonly string[],
  id: string,
): [number | undefined, (datum: number | undefined) => void, boolean] {
  const shared = useContext(SyncContext)
  const [own, setOwn] = useState<number | undefined>(undefined)
  const set = useCallback(
    (datum: number | undefined) => {
      if (!shared) setOwn(datum)
      else shared.move(datum === undefined ? null : (categories[datum] ?? null), id)
    },
    [shared, categories, id],
  )
  if (!shared) return [own, set, true]
  const { active, speaks } = syncedActive(categories, shared, id)
  return [active, set, speaks]
}
