import type { ReactNode } from 'react'
import type { z } from 'zod'
import {
  type A2uiAction,
  type AccessibilityAttributes,
  type AgentToRendererMessage,
  AgentToRendererMessageSchema,
  bindingPath,
  type CatalogComponentSchemaEntry,
  type ChildList,
  encodePointerSegment,
  getAtPointer,
  isDataBinding,
  type ProtocolVersion,
  type RawComponent,
  type RendererErrorCode,
  type RendererToAgentActionMessage,
  type RendererToAgentErrorMessage,
  type ResolvedAccessibility,
  resolvePointerPath,
  setAtPointer,
} from './protocol.ts'

export interface ResolvedChildRef {
  readonly id: string
  readonly scopePath: string
  readonly key: string
}

export interface A2uiPresenterProps<
  Props extends Record<string, unknown> = Record<string, unknown>,
> {
  readonly props: Readonly<Props>
  readonly accessibility: ResolvedAccessibility
  readonly surfaceId: string
  readonly componentId: string
  readonly scopePath: string
  readonly renderChildren: (children: ChildList | undefined) => ReactNode
  readonly dispatch: (action: A2uiAction) => void
}

export interface A2uiCatalogComponent<
  Schema extends z.ZodObject<z.ZodRawShape> = z.ZodObject<z.ZodRawShape>,
> extends CatalogComponentSchemaEntry {
  readonly schema: Schema
  readonly presenter: (args: A2uiPresenterProps<Record<string, unknown>>) => ReactNode
}

export interface A2uiCatalog {
  readonly id: string
  readonly description?: string
  readonly components: ReadonlyMap<string, A2uiCatalogComponent>
}

export function defineA2uiComponent<Schema extends z.ZodObject<z.ZodRawShape>>(definition: {
  readonly name: string
  readonly description?: string
  readonly schema: Schema
  readonly allowedParents?: readonly string[]
  readonly allowedChildren?: readonly string[]
  readonly presenter: (args: A2uiPresenterProps<Record<string, unknown>>) => ReactNode
}): A2uiCatalogComponent<Schema> {
  return definition
}

export function defineA2uiCatalog(definition: {
  readonly id: string
  readonly description?: string
  readonly components: readonly A2uiCatalogComponent[]
}): A2uiCatalog {
  const map = new Map<string, A2uiCatalogComponent>()
  for (const component of definition.components) {
    if (component.name === 'Surface') {
      throw new Error('Catalog cannot register the reserved component name "Surface"')
    }
    if (map.has(component.name)) {
      throw new Error(`Duplicate A2UI catalog component "${component.name}"`)
    }
    map.set(component.name, component)
  }
  return {
    id: definition.id,
    description: definition.description,
    components: map,
  }
}

export interface ValidatedComponentRecord {
  readonly id: string
  readonly component: string
  readonly catalogId: string
  readonly props: Readonly<Record<string, unknown>>
  readonly accessibility?: AccessibilityAttributes
}

export interface A2uiSurfaceSnapshot {
  readonly surfaceId: string
  readonly catalogId: string
  readonly protocolVersion: ProtocolVersion
  readonly sendDataModel: boolean
  readonly components: ReadonlyMap<string, ValidatedComponentRecord>
  readonly dataModel: Readonly<Record<string, unknown>>
}

export interface A2uiStoreOptions {
  readonly catalogs: readonly A2uiCatalog[]
  readonly onAction?: (message: RendererToAgentActionMessage) => void
  readonly onError?: (message: RendererToAgentErrorMessage) => void
  readonly now?: () => string
}

const ENVELOPE_KEYS = new Set(['id', 'component', 'catalogId', 'accessibility'])

function stripEnvelope(raw: RawComponent): Record<string, unknown> {
  const props: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(raw)) {
    if (!ENVELOPE_KEYS.has(key)) props[key] = value
  }
  return props
}

function extractChildIds(props: Readonly<Record<string, unknown>>): string[] {
  const ids: string[] = []
  const children = props.children
  if (Array.isArray(children)) {
    for (const item of children) {
      if (typeof item === 'string') ids.push(item)
    }
  } else if (typeof children === 'object' && children !== null && 'componentId' in children) {
    const id = (children as { componentId?: unknown }).componentId
    if (typeof id === 'string') ids.push(id)
  }
  if (typeof props.child === 'string') ids.push(props.child)
  return ids
}

export interface A2uiStore {
  readonly catalogs: ReadonlyMap<string, A2uiCatalog>
  processMessages(messages: readonly unknown[]): RendererToAgentErrorMessage[]
  processMessage(raw: unknown): RendererToAgentErrorMessage[]
  getSurface(surfaceId: string): A2uiSurfaceSnapshot | undefined
  getSurfaceIds(): readonly string[]
  getCatalog(catalogId: string): A2uiCatalog | undefined
  resolveDynamicValue(surface: A2uiSurfaceSnapshot, value: unknown, scopePath: string): unknown
  resolveProps(
    surface: A2uiSurfaceSnapshot,
    record: ValidatedComponentRecord,
    scopePath: string,
  ): Record<string, unknown>
  resolveAccessibility(
    surface: A2uiSurfaceSnapshot,
    accessibility: AccessibilityAttributes | undefined,
    scopePath: string,
  ): ResolvedAccessibility
  resolveChildren(
    surface: A2uiSurfaceSnapshot,
    children: ChildList | undefined,
    scopePath: string,
  ): readonly ResolvedChildRef[]
  dispatchAction(
    surfaceId: string,
    sourceComponentId: string,
    action: A2uiAction,
    scopePath: string,
  ): RendererToAgentActionMessage | undefined
  reportError(
    code: RendererErrorCode,
    surfaceId: string,
    path: string,
    message: string,
  ): RendererToAgentErrorMessage
  subscribe(listener: () => void): () => void
}

export function createA2uiStore(options: A2uiStoreOptions): A2uiStore {
  const catalogs = new Map<string, A2uiCatalog>()
  for (const catalog of options.catalogs) catalogs.set(catalog.id, catalog)

  const surfaces = new Map<string, A2uiSurfaceSnapshot>()
  const listeners = new Set<() => void>()
  const now = options.now ?? (() => new Date().toISOString())

  const notify = () => {
    for (const listener of listeners) listener()
  }

  const reportError = (
    code: RendererErrorCode,
    surfaceId: string,
    path: string,
    message: string,
  ): RendererToAgentErrorMessage => {
    const payload: RendererToAgentErrorMessage = {
      version: '1.0',
      error: { code, surfaceId, path, message },
    }
    options.onError?.(payload)
    return payload
  }

  const validateComponentBatch = (
    surfaceId: string,
    defaultCatalogId: string,
    existing: ReadonlyMap<string, ValidatedComponentRecord>,
    rawComponents: readonly RawComponent[],
  ): { nextMap?: Map<string, ValidatedComponentRecord>; errors: RendererToAgentErrorMessage[] } => {
    const errors: RendererToAgentErrorMessage[] = []
    const staged = new Map<string, ValidatedComponentRecord>(existing)

    for (let index = 0; index < rawComponents.length; index++) {
      const raw = rawComponents[index]
      const basePath = `/components/${index}`
      if (raw.component === 'Surface') {
        errors.push(
          reportError(
            'VALIDATION_FAILED',
            surfaceId,
            `${basePath}/component`,
            'Component type "Surface" is reserved by the A2UI protocol.',
          ),
        )
        continue
      }

      const targetCatalogId = raw.catalogId ?? defaultCatalogId
      const catalog = catalogs.get(targetCatalogId)
      if (!catalog) {
        errors.push(
          reportError(
            'UNKNOWN_CATALOG',
            surfaceId,
            `${basePath}/catalogId`,
            `Catalog "${targetCatalogId}" is not registered.`,
          ),
        )
        continue
      }

      const entry = catalog.components.get(raw.component)
      if (!entry) {
        errors.push(
          reportError(
            'UNKNOWN_COMPONENT',
            surfaceId,
            `${basePath}/component`,
            `Component "${raw.component}" is not registered in catalog "${targetCatalogId}".`,
          ),
        )
        continue
      }

      const parsed = entry.schema.safeParse(stripEnvelope(raw))
      if (!parsed.success) {
        const firstIssue = parsed.error.issues[0]
        const issuePath = firstIssue?.path.length
          ? `${basePath}/${firstIssue.path.map((part) => encodePointerSegment(String(part))).join('/')}`
          : basePath
        errors.push(
          reportError(
            'VALIDATION_FAILED',
            surfaceId,
            issuePath,
            firstIssue?.message ?? `Component "${raw.component}" failed schema validation.`,
          ),
        )
        continue
      }

      staged.set(raw.id, {
        id: raw.id,
        component: raw.component,
        catalogId: targetCatalogId,
        props: parsed.data,
        accessibility: raw.accessibility,
      })
    }

    if (errors.length > 0) return { errors }

    // Validate optional allowedParents / allowedChildren constraints against the staged graph.
    for (const record of staged.values()) {
      const parentEntry = catalogs.get(record.catalogId)?.components.get(record.component)
      for (const childId of extractChildIds(record.props)) {
        const child = staged.get(childId)
        if (!child) continue
        if (
          parentEntry?.allowedChildren &&
          !parentEntry.allowedChildren.includes(child.component)
        ) {
          errors.push(
            reportError(
              'UNALLOWED_CHILD',
              surfaceId,
              `/components/${record.id}`,
              `Component "${record.component}" does not allow child component "${child.component}".`,
            ),
          )
        }
        const childEntry = catalogs.get(child.catalogId)?.components.get(child.component)
        if (childEntry?.allowedParents && !childEntry.allowedParents.includes(record.component)) {
          errors.push(
            reportError(
              'UNALLOWED_PARENT',
              surfaceId,
              `/components/${child.id}`,
              `Component "${child.component}" is not allowed under parent "${record.component}".`,
            ),
          )
        }
      }
    }

    if (errors.length > 0) return { errors }
    return { nextMap: staged, errors }
  }

  const processMessage = (raw: unknown): RendererToAgentErrorMessage[] => {
    const parsed = AgentToRendererMessageSchema.safeParse(raw)
    if (!parsed.success) {
      const firstIssue = parsed.error.issues[0]
      const surfaceId =
        typeof raw === 'object' && raw !== null
          ? ((
              (raw as Record<string, { surfaceId?: string }>).createSurface ??
              (raw as Record<string, { surfaceId?: string }>).updateComponents ??
              (raw as Record<string, { surfaceId?: string }>).updateDataModel ??
              (raw as Record<string, { surfaceId?: string }>).deleteSurface
            )?.surfaceId ?? 'unknown')
          : 'unknown'
      return [
        reportError(
          'VALIDATION_FAILED',
          surfaceId,
          firstIssue?.path.length ? `/${firstIssue.path.join('/')}` : '/',
          firstIssue?.message ?? 'Invalid A2UI message envelope.',
        ),
      ]
    }

    const message: AgentToRendererMessage = parsed.data

    if ('createSurface' in message) {
      const { surfaceId, catalogId, sendDataModel, components, dataModel } = message.createSurface
      if (surfaces.has(surfaceId)) {
        return [
          reportError(
            'DUPLICATE_SURFACE',
            surfaceId,
            '/createSurface/surfaceId',
            `Surface "${surfaceId}" already exists.`,
          ),
        ]
      }
      const resolvedCatalogId = catalogId ?? options.catalogs[0]?.id ?? ''
      if (!catalogs.has(resolvedCatalogId)) {
        return [
          reportError(
            'UNKNOWN_CATALOG',
            surfaceId,
            '/createSurface/catalogId',
            `Catalog "${resolvedCatalogId}" is not registered.`,
          ),
        ]
      }

      let validatedComponents = new Map<string, ValidatedComponentRecord>()
      if (components) {
        const result = validateComponentBatch(
          surfaceId,
          resolvedCatalogId,
          validatedComponents,
          components,
        )
        if (result.errors.length > 0) return result.errors
        validatedComponents = result.nextMap!
      }

      surfaces.set(surfaceId, {
        surfaceId,
        catalogId: resolvedCatalogId,
        protocolVersion: message.version,
        sendDataModel: Boolean(sendDataModel),
        components: validatedComponents,
        dataModel: dataModel ? { ...dataModel } : {},
      })
      notify()
      return []
    }

    if ('updateComponents' in message) {
      const { surfaceId, components } = message.updateComponents
      const surface = surfaces.get(surfaceId)
      if (!surface) {
        return [
          reportError(
            'UNKNOWN_SURFACE',
            surfaceId,
            '/updateComponents/surfaceId',
            `Surface "${surfaceId}" does not exist.`,
          ),
        ]
      }

      const result = validateComponentBatch(
        surfaceId,
        surface.catalogId,
        surface.components,
        components,
      )
      if (result.errors.length > 0) return result.errors

      surfaces.set(surfaceId, {
        ...surface,
        components: result.nextMap!,
      })
      notify()
      return []
    }

    if ('updateDataModel' in message) {
      const { surfaceId, path, value } = message.updateDataModel
      const surface = surfaces.get(surfaceId)
      if (!surface) {
        return [
          reportError(
            'UNKNOWN_SURFACE',
            surfaceId,
            '/updateDataModel/surfaceId',
            `Surface "${surfaceId}" does not exist.`,
          ),
        ]
      }

      surfaces.set(surfaceId, {
        ...surface,
        dataModel: setAtPointer(surface.dataModel, path, value),
      })
      notify()
      return []
    }

    if ('deleteSurface' in message) {
      const { surfaceId } = message.deleteSurface
      if (!surfaces.has(surfaceId)) {
        return [
          reportError(
            'UNKNOWN_SURFACE',
            surfaceId,
            '/deleteSurface/surfaceId',
            `Surface "${surfaceId}" does not exist.`,
          ),
        ]
      }
      surfaces.delete(surfaceId)
      notify()
      return []
    }

    return []
  }

  const processMessages = (messages: readonly unknown[]): RendererToAgentErrorMessage[] => {
    const errors: RendererToAgentErrorMessage[] = []
    for (const message of messages) {
      errors.push(...processMessage(message))
    }
    return errors
  }

  const resolveDynamicValue = (
    surface: A2uiSurfaceSnapshot,
    value: unknown,
    scopePath: string,
  ): unknown => {
    if (isDataBinding(value)) {
      const absolute = resolvePointerPath(bindingPath(value), scopePath)
      return getAtPointer(surface.dataModel, absolute)
    }
    if (Array.isArray(value)) {
      return value.map((item) => resolveDynamicValue(surface, item, scopePath))
    }
    if (typeof value === 'object' && value !== null) {
      const resolved: Record<string, unknown> = {}
      for (const [k, v] of Object.entries(value)) {
        resolved[k] = resolveDynamicValue(surface, v, scopePath)
      }
      return resolved
    }
    return value
  }

  const resolveProps = (
    surface: A2uiSurfaceSnapshot,
    record: ValidatedComponentRecord,
    scopePath: string,
  ): Record<string, unknown> => {
    const resolved: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(record.props)) {
      if (key === 'children' || key === 'child' || key === 'action') {
        // Structural references and actions stay intact; action context resolves at dispatch time.
        resolved[key] = value
      } else {
        resolved[key] = resolveDynamicValue(surface, value, scopePath)
      }
    }
    return resolved
  }

  const resolveAccessibility = (
    surface: A2uiSurfaceSnapshot,
    accessibility: AccessibilityAttributes | undefined,
    scopePath: string,
  ): ResolvedAccessibility => {
    if (!accessibility) return {}
    const label = accessibility.label
      ? resolveDynamicValue(surface, accessibility.label, scopePath)
      : undefined
    const description = accessibility.description
      ? resolveDynamicValue(surface, accessibility.description, scopePath)
      : undefined
    const hidden =
      accessibility.hidden !== undefined
        ? resolveDynamicValue(surface, accessibility.hidden, scopePath)
        : undefined
    return {
      ...(typeof label === 'string' ? { label } : {}),
      ...(typeof description === 'string' ? { description } : {}),
      ...(accessibility.live ? { live: accessibility.live } : {}),
      ...(typeof hidden === 'boolean' ? { hidden } : {}),
    }
  }

  const resolveChildren = (
    surface: A2uiSurfaceSnapshot,
    children: ChildList | undefined,
    scopePath: string,
  ): readonly ResolvedChildRef[] => {
    if (!children) return []
    if (Array.isArray(children)) {
      return children.map((id, index) => ({
        id,
        scopePath,
        key: `${id}@${scopePath}#${index}`,
      }))
    }
    const listPath = resolvePointerPath(children.path, scopePath)
    const target = getAtPointer(surface.dataModel, listPath)
    if (!Array.isArray(target)) return []
    const base = listPath === '/' ? '' : listPath.replace(/\/$/, '')
    return target.map((_item, index) => {
      const itemScope = `${base}/${index}`
      return {
        id: children.componentId,
        scopePath: itemScope,
        key: `${children.componentId}@${itemScope}`,
      }
    })
  }

  const dispatchAction = (
    surfaceId: string,
    sourceComponentId: string,
    action: A2uiAction,
    scopePath: string,
  ): RendererToAgentActionMessage | undefined => {
    const surface = surfaces.get(surfaceId)
    if (!surface) return undefined
    const rawContext = action.event.context ?? {}
    const resolvedContext: Record<string, unknown> = {}
    for (const [key, val] of Object.entries(rawContext)) {
      resolvedContext[key] = resolveDynamicValue(surface, val, scopePath)
    }
    const resolvedMessage = action.event.userMessage
      ? resolveDynamicValue(surface, action.event.userMessage, scopePath)
      : undefined
    const payload: RendererToAgentActionMessage = {
      version: '1.0',
      action: {
        name: action.event.name,
        surfaceId,
        sourceComponentId,
        timestamp: now(),
        context: resolvedContext,
        ...(typeof resolvedMessage === 'string' ? { userMessage: resolvedMessage } : {}),
      },
    }
    options.onAction?.(payload)
    return payload
  }

  return {
    catalogs,
    processMessages,
    processMessage,
    getSurface: (surfaceId) => surfaces.get(surfaceId),
    getSurfaceIds: () => Array.from(surfaces.keys()),
    getCatalog: (catalogId) => catalogs.get(catalogId),
    resolveDynamicValue,
    resolveProps,
    resolveAccessibility,
    resolveChildren,
    dispatchAction,
    reportError,
    subscribe: (listener) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
  }
}
