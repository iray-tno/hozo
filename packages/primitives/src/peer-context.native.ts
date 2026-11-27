import { createContext } from 'react'

import type { HozoPeerStore } from './peer-store.ts'

export const HozoPeerContext = createContext<HozoPeerStore | null>(null)
