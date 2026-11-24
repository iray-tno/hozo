import { z } from 'zod'
import {
  ActionSchema,
  type CatalogComponentSchemaEntry,
  ChildListSchema,
  DynamicBooleanSchema,
  DynamicStringSchema,
} from './protocol.ts'

export const HOZO_A2UI_CATALOG_ID = 'urn:hozo:a2ui:ui-spike:v1'

export const StackSchema = z
  .object({
    direction: z.enum(['row', 'column']).optional(),
    gap: z.enum(['none', 'tight', 'normal', 'loose']).optional(),
    align: z.enum(['start', 'center', 'end', 'stretch']).optional(),
    children: ChildListSchema,
  })
  .strict()

export const CardSchema = z
  .object({
    flat: z.boolean().optional(),
    children: ChildListSchema,
  })
  .strict()

export const TextSchema = z
  .object({
    text: DynamicStringSchema,
    variant: z.enum(['heading', 'subheading', 'body', 'caption']).optional(),
    tone: z.enum(['body', 'subtle', 'accent', 'danger']).optional(),
  })
  .strict()

export const AlertSchema = z
  .object({
    text: DynamicStringSchema,
    tone: z.enum(['neutral', 'accent', 'danger']).optional(),
    live: z.enum(['off', 'polite', 'assertive']).optional(),
  })
  .strict()

export const ButtonSchema = z
  .object({
    label: DynamicStringSchema,
    tone: z.enum(['accent', 'neutral', 'quiet', 'danger']).optional(),
    size: z.enum(['sm', 'md']).optional(),
    disabled: DynamicBooleanSchema.optional(),
    action: ActionSchema.optional(),
  })
  .strict()

/**
 * Pure schema inventory for the semantic `@hozo/ui` catalog.
 *
 * Kept JSX-free so CLI tooling, agent prompt builders, and backend validators
 * can inspect or export the catalog JSON Schema without importing UI presenters.
 */
export const hozoUiSchemaCatalog = {
  id: HOZO_A2UI_CATALOG_ID,
  description: 'Semantic @hozo/ui catalog for cross-platform Web and Native A2UI rendering.',
  components: new Map<string, CatalogComponentSchemaEntry>([
    [
      'Stack',
      {
        name: 'Stack',
        description: 'Vertical or horizontal flex container with bounded design-system gaps.',
        schema: StackSchema,
      },
    ],
    [
      'Card',
      {
        name: 'Card',
        description: 'Bordered surface container with optional elevation.',
        schema: CardSchema,
      },
    ],
    [
      'Text',
      {
        name: 'Text',
        description: 'Typographic text using bounded variant and semantic tone tokens.',
        schema: TextSchema,
      },
    ],
    [
      'Alert',
      {
        name: 'Alert',
        description: 'Semantic notice or status banner with optional live-region announcement.',
        schema: AlertSchema,
      },
    ],
    [
      'Button',
      {
        name: 'Button',
        description: 'Interactive button with bounded tone/size tokens and A2UI action dispatch.',
        schema: ButtonSchema,
      },
    ],
  ]),
} as const
