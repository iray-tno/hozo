import { z } from 'zod'

export const SUPPORTED_PROTOCOL_VERSIONS = ['1.0', 'v0.9.1', 'v0.9'] as const
export type ProtocolVersion = (typeof SUPPORTED_PROTOCOL_VERSIONS)[number]

const ProtocolVersionSchema = z.enum(SUPPORTED_PROTOCOL_VERSIONS)

/**
 * A2UI data binding: v1.0 uses `@path`, while v0.9 / v0.9.1 use `path`.
 * Strict object validation rejects arbitrary extra keys on bindings.
 */
export const DataBindingSchema = z.union([
  z.object({ '@path': z.string().min(1) }).strict(),
  z.object({ path: z.string().min(1) }).strict(),
])

export type DataBinding = z.infer<typeof DataBindingSchema>

export function isDataBinding(value: unknown): value is DataBinding {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const keys = Object.keys(value)
  if (keys.length !== 1) return false
  const key = keys[0]
  if (key !== '@path' && key !== 'path') return false
  return typeof (value as Record<string, unknown>)[key] === 'string'
}

export function bindingPath(binding: DataBinding): string {
  return '@path' in binding ? binding['@path'] : binding.path
}

export const DynamicStringSchema = z.union([z.string(), DataBindingSchema])
export type DynamicString = z.infer<typeof DynamicStringSchema>

export const DynamicBooleanSchema = z.union([z.boolean(), DataBindingSchema])
export type DynamicBoolean = z.infer<typeof DynamicBooleanSchema>

export const DynamicNumberSchema = z.union([z.number(), DataBindingSchema])
export type DynamicNumber = z.infer<typeof DynamicNumberSchema>

export const DynamicValueSchema: z.ZodType<unknown> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    DataBindingSchema,
    z.array(DynamicValueSchema),
    z.record(z.string(), DynamicValueSchema),
  ]),
)

export const ComponentIdSchema = z.string().min(1)

export const TemplateChildListSchema = z
  .object({
    componentId: ComponentIdSchema,
    path: z.string().min(1),
  })
  .strict()

export const ChildListSchema = z.union([z.array(ComponentIdSchema), TemplateChildListSchema])
export type ChildList = z.infer<typeof ChildListSchema>

export const AccessibilityAttributesSchema = z
  .object({
    label: DynamicStringSchema.optional(),
    description: DynamicStringSchema.optional(),
    live: z.enum(['off', 'polite', 'assertive']).optional(),
    hidden: DynamicBooleanSchema.optional(),
  })
  .strict()

export type AccessibilityAttributes = z.infer<typeof AccessibilityAttributesSchema>

export interface ResolvedAccessibility {
  label?: string
  description?: string
  live?: 'off' | 'polite' | 'assertive'
  hidden?: boolean
}

export const ActionSchema = z
  .object({
    event: z
      .object({
        name: z.string().min(1),
        userMessage: DynamicStringSchema.optional(),
        context: z.record(z.string(), DynamicValueSchema).optional(),
      })
      .strict(),
  })
  .strict()

export type A2uiAction = z.infer<typeof ActionSchema>

/**
 * Raw component envelope as it arrives on the wire. Component-specific props
 * are validated separately against each catalog entry's strict Zod schema so
 * unknown props (such as raw `className` or `style`) are rejected cleanly.
 */
export const RawComponentSchema = z
  .object({
    id: ComponentIdSchema,
    component: z.string().min(1),
    catalogId: z.string().min(1).optional(),
    accessibility: AccessibilityAttributesSchema.optional(),
  })
  .passthrough()

export type RawComponent = z.infer<typeof RawComponentSchema>

export const CreateSurfaceMessageSchema = z
  .object({
    version: ProtocolVersionSchema,
    createSurface: z
      .object({
        surfaceId: z.string().min(1),
        catalogId: z.string().min(1).optional(),
        sendDataModel: z.boolean().optional(),
        components: z.array(RawComponentSchema).min(1).optional(),
        dataModel: z.record(z.string(), z.unknown()).optional(),
      })
      .strict(),
  })
  .strict()

export const UpdateComponentsMessageSchema = z
  .object({
    version: ProtocolVersionSchema,
    updateComponents: z
      .object({
        surfaceId: z.string().min(1),
        components: z.array(RawComponentSchema).min(1),
      })
      .strict(),
  })
  .strict()

export const UpdateDataModelMessageSchema = z
  .object({
    version: ProtocolVersionSchema,
    updateDataModel: z
      .object({
        surfaceId: z.string().min(1),
        path: z.string().optional(),
        value: z.unknown(),
      })
      .strict(),
  })
  .strict()

export const DeleteSurfaceMessageSchema = z
  .object({
    version: ProtocolVersionSchema,
    deleteSurface: z
      .object({
        surfaceId: z.string().min(1),
      })
      .strict(),
  })
  .strict()

export const AgentToRendererMessageSchema = z.union([
  CreateSurfaceMessageSchema,
  UpdateComponentsMessageSchema,
  UpdateDataModelMessageSchema,
  DeleteSurfaceMessageSchema,
])

export type AgentToRendererMessage = z.infer<typeof AgentToRendererMessageSchema>

export interface RendererToAgentActionMessage {
  version: '1.0'
  action: {
    name: string
    surfaceId: string
    sourceComponentId: string
    timestamp: string
    context: Record<string, unknown>
    userMessage?: string
  }
}

export type RendererErrorCode =
  | 'VALIDATION_FAILED'
  | 'UNALLOWED_PARENT'
  | 'UNALLOWED_CHILD'
  | 'UNKNOWN_SURFACE'
  | 'DUPLICATE_SURFACE'
  | 'UNKNOWN_CATALOG'
  | 'UNKNOWN_COMPONENT'
  | 'CYCLE_DETECTED'

export interface RendererToAgentErrorMessage {
  version: '1.0'
  error: {
    code: RendererErrorCode
    surfaceId: string
    path: string
    message: string
  }
}

export type RendererToAgentMessage = RendererToAgentActionMessage | RendererToAgentErrorMessage

// --- RFC 6901 JSON Pointer helpers ---

function decodeSegment(segment: string): string {
  return segment.replaceAll('~1', '/').replaceAll('~0', '~')
}

export function encodePointerSegment(segment: string): string {
  return segment.replaceAll('~', '~0').replaceAll('/', '~1')
}

export function parseJsonPointer(pointer: string): string[] {
  if (pointer === '' || pointer === '/') return []
  const normalized = pointer.startsWith('/') ? pointer.slice(1) : pointer
  return normalized.split('/').map(decodeSegment)
}

export function resolvePointerPath(pointer: string, scopePath: string): string {
  if (pointer.startsWith('/')) return pointer
  const base = scopePath === '/' || scopePath === '' ? '' : scopePath.replace(/\/$/, '')
  return `${base}/${pointer}`
}

export function getAtPointer(root: unknown, pointer: string): unknown {
  const segments = parseJsonPointer(pointer)
  let current: unknown = root
  for (const segment of segments) {
    if (Array.isArray(current)) {
      const index = Number(segment)
      if (!Number.isInteger(index) || index < 0 || index >= current.length) return undefined
      current = current[index]
    } else if (typeof current === 'object' && current !== null) {
      current = (current as Record<string, unknown>)[segment]
    } else {
      return undefined
    }
  }
  return current
}

/**
 * Returns a structurally shared copy of `root` with `value` written at `pointer`.
 * Per A2UI v1.0 `updateDataModel`, an explicit `null` value deletes the target key.
 */
export function setAtPointer(
  root: Record<string, unknown>,
  pointer: string | undefined,
  value: unknown,
): Record<string, unknown> {
  if (!pointer || pointer === '' || pointer === '/') {
    if (value === null || value === undefined) return {}
    if (typeof value === 'object' && !Array.isArray(value)) {
      return { ...(value as Record<string, unknown>) }
    }
    return root
  }

  const segments = parseJsonPointer(pointer)
  const cloneAt = (node: unknown, depth: number): unknown => {
    const key = segments[depth]
    const isLeaf = depth === segments.length - 1

    if (Array.isArray(node)) {
      const next = [...node]
      const index = Number(key)
      if (!Number.isInteger(index) || index < 0) return next
      if (isLeaf) {
        if (value === null) next.splice(index, 1)
        else next[index] = value
      } else {
        next[index] = cloneAt(next[index], depth + 1)
      }
      return next
    }

    const base: Record<string, unknown> =
      typeof node === 'object' && node !== null ? { ...(node as Record<string, unknown>) } : {}

    if (isLeaf) {
      if (value === null) delete base[key]
      else base[key] = value
    } else {
      base[key] = cloneAt(base[key], depth + 1)
    }
    return base
  }

  return cloneAt(root, 0) as Record<string, unknown>
}

export interface CatalogComponentSchemaEntry {
  readonly name: string
  readonly description?: string
  readonly schema: z.ZodObject<z.ZodRawShape>
  readonly allowedParents?: readonly string[]
  readonly allowedChildren?: readonly string[]
}

/**
 * Serializes a catalog into a JSON Schema 2020-12 document using Zod 4's
 * built-in `z.toJSONSchema()` — zero external schema-serializer dependency.
 */
export function exportCatalogJsonSchema(catalog: {
  readonly id: string
  readonly description?: string
  readonly components: ReadonlyMap<string, CatalogComponentSchemaEntry>
}): Record<string, unknown> {
  const components: Record<string, unknown> = {}
  const anyComponent: Array<{ $ref: string }> = []

  for (const [name, entry] of catalog.components) {
    const propsJson = z.toJSONSchema(entry.schema, { target: 'draft-2020-12' }) as Record<
      string,
      unknown
    >
    const properties = {
      id: { type: 'string', minLength: 1 },
      component: { const: name },
      catalogId: { type: 'string', minLength: 1 },
      accessibility: z.toJSONSchema(AccessibilityAttributesSchema, { target: 'draft-2020-12' }),
      ...((propsJson.properties as Record<string, unknown> | undefined) ?? {}),
    }
    const required = ['id', 'component', ...((propsJson.required as string[] | undefined) ?? [])]
    components[name] = {
      type: 'object',
      ...(entry.description ? { description: entry.description } : {}),
      properties,
      required,
      additionalProperties: false,
    }
    anyComponent.push({ $ref: `#/components/${name}` })
  }

  return {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    catalogId: catalog.id,
    protocolVersion: '1.0',
    ...(catalog.description ? { description: catalog.description } : {}),
    components,
    $defs: {
      anyComponent: { oneOf: anyComponent },
    },
  }
}
