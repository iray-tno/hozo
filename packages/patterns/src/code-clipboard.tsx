import { createContext, type ReactNode } from 'react'

export interface CodeClipboard {
  writeText: (text: string) => void | Promise<void>
}

export const CodeClipboardContext = createContext<CodeClipboard | null>(null)

/** Native applications supply expo-clipboard or another application-owned clipboard. */
export function CodeClipboardProvider({
  value,
  children,
}: {
  value: CodeClipboard
  children: ReactNode
}) {
  return <CodeClipboardContext.Provider value={value}>{children}</CodeClipboardContext.Provider>
}
