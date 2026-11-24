import { useEffect, useState } from 'react'
import { type A2uiStore, createA2uiStore } from './engine.ts'
import {
  deploymentStatusV1Messages,
  deploymentStatusV091Messages,
  deploymentUnblockUpdates,
  invalidClassNameMessage,
  SURFACE_ID,
} from './fixtures.ts'
import { hozoUiCatalog } from './hozo-catalog.tsx'
import type { RendererToAgentActionMessage, RendererToAgentErrorMessage } from './protocol.ts'
import { A2uiSurface } from './renderer.ts'

export interface A2uiSpikeHandle {
  applyUnblock(): RendererToAgentErrorMessage[]
  loadVersion(version: '1.0' | 'v0.9.1'): RendererToAgentErrorMessage[]
  sendInvalidClassName(): RendererToAgentErrorMessage[]
  getActions(): readonly RendererToAgentActionMessage[]
  getErrors(): readonly RendererToAgentErrorMessage[]
}

declare global {
  interface Window {
    __a2uiSpike?: A2uiSpikeHandle
  }
}

function createInitialStore(
  actions: RendererToAgentActionMessage[],
  errors: RendererToAgentErrorMessage[],
): A2uiStore {
  const store = createA2uiStore({
    catalogs: [hozoUiCatalog],
    onAction: (action) => actions.push(action),
    onError: (error) => errors.push(error),
    now: () => '2026-11-25T00:00:00.000Z',
  })
  store.processMessages(deploymentStatusV1Messages)
  return store
}

export function App() {
  const [state] = useState(() => {
    const actions: RendererToAgentActionMessage[] = []
    const errors: RendererToAgentErrorMessage[] = []
    const store = createInitialStore(actions, errors)
    return { store, actions, errors }
  })

  useEffect(() => {
    const handle: A2uiSpikeHandle = {
      applyUnblock: () => state.store.processMessages(deploymentUnblockUpdates),
      loadVersion: (version) => {
        state.actions.length = 0
        state.errors.length = 0
        if (state.store.getSurface(SURFACE_ID)) {
          state.store.processMessage({
            version: '1.0',
            deleteSurface: { surfaceId: SURFACE_ID },
          })
        }
        return state.store.processMessages(
          version === '1.0' ? deploymentStatusV1Messages : deploymentStatusV091Messages,
        )
      },
      sendInvalidClassName: () => state.store.processMessage(invalidClassNameMessage),
      getActions: () => [...state.actions],
      getErrors: () => [...state.errors],
    }
    window.__a2uiSpike = handle
    return () => {
      delete window.__a2uiSpike
    }
  }, [state])

  return <A2uiSurface store={state.store} surfaceId={SURFACE_ID} />
}
