import {
  HozoInheritedMetricsContext,
  HozoInheritedPaintContext,
  type HozoInheritedTextFrame,
} from '@hozo/engine/generated/text-inheritance-protocol'
import { HozoTextSizeContext } from '@hozo/engine/generated/text-size-context'
import { type ReactNode, useContext } from 'react'

/** One stable shape, even when every local declaration is removed. */
export function HozoInheritedTextScope({
  frame,
  children,
}: {
  frame: HozoInheritedTextFrame
  children?: ReactNode
}) {
  const legacy = useContext(HozoTextSizeContext)
  return (
    <HozoInheritedMetricsContext.Provider value={frame.metrics}>
      <HozoInheritedPaintContext.Provider value={frame.paint}>
        <HozoTextSizeContext.Provider value={frame.metrics.fontSize ?? legacy}>
          {children}
        </HozoTextSizeContext.Provider>
      </HozoInheritedPaintContext.Provider>
    </HozoInheritedMetricsContext.Provider>
  )
}
