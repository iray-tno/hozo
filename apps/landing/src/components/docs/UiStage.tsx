import { View } from '@hozo/core'
import type { ReactNode } from 'react'

// The surface a @hozo/ui preview sits on: the package's own, so the
// components are seen against the page they were drawn for and not against
// this site's timber palette. It follows the reader's system colour scheme,
// as the components inside it do, rather than the docs' theme switch.
export function UiStage({ children }: { children?: ReactNode }) {
  return <View className="items-start bg-hozo-surface p-6 text-hozo-text">{children}</View>
}
