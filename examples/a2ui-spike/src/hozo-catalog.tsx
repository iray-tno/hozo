import { cx, Text } from '@hozo/core'
import { Alert, Button, Card, Stack } from '@hozo/ui'
import { defineA2uiCatalog, defineA2uiComponent } from './engine.ts'
import {
  AlertSchema,
  ButtonSchema,
  CardSchema,
  HOZO_A2UI_CATALOG_ID,
  StackSchema,
  TextSchema,
} from './hozo-catalog-schemas.ts'
import type { A2uiAction, ChildList } from './protocol.ts'

export { HOZO_A2UI_CATALOG_ID }

// Static class literals so Hozo compiles every text variant and tone cleanly on
// both Web and Native without falling back to uncompiled dynamic strings.
const VARIANT_HEADING = 'text-xl font-bold'
const VARIANT_SUBHEADING = 'text-base font-semibold'
const VARIANT_BODY = 'text-sm font-normal'
const VARIANT_CAPTION = 'text-xs font-normal'

const TONE_BODY = 'text-hozo-text-body'
const TONE_SUBTLE = 'text-hozo-text-subtle'
const TONE_ACCENT = 'text-hozo-accent-text'
const TONE_DANGER = 'text-hozo-danger-text'

function A2uiText({
  text,
  variant = 'body',
  tone = 'body',
}: {
  text: string
  variant?: 'heading' | 'subheading' | 'body' | 'caption'
  tone?: 'body' | 'subtle' | 'accent' | 'danger'
}) {
  const variantClass =
    variant === 'heading'
      ? VARIANT_HEADING
      : variant === 'subheading'
        ? VARIANT_SUBHEADING
        : variant === 'caption'
          ? VARIANT_CAPTION
          : VARIANT_BODY
  const toneClass =
    tone === 'subtle'
      ? TONE_SUBTLE
      : tone === 'accent'
        ? TONE_ACCENT
        : tone === 'danger'
          ? TONE_DANGER
          : TONE_BODY
  return <Text className={cx(variantClass, toneClass)}>{text}</Text>
}

/**
 * Semantic-only A2UI catalog backed by `@hozo/ui` and `@hozo/core`.
 *
 * Notice that `className` and `style` are deliberately absent from every schema
 * (and `.strict()` rejects them), so an agent chooses component meaning and
 * bounded design-system tokens without stepping outside Hozo's theme.
 */
export const hozoUiCatalog = defineA2uiCatalog({
  id: HOZO_A2UI_CATALOG_ID,
  description: 'Semantic @hozo/ui catalog for cross-platform Web and Native A2UI rendering.',
  components: [
    defineA2uiComponent({
      name: 'Stack',
      description: 'Vertical or horizontal flex container with bounded design-system gaps.',
      schema: StackSchema,
      presenter: ({ props, renderChildren }) => (
        <Stack
          direction={props.direction as 'row' | 'column' | undefined}
          gap={props.gap as 'none' | 'tight' | 'normal' | 'loose' | undefined}
          align={props.align as 'start' | 'center' | 'end' | 'stretch' | undefined}
        >
          {renderChildren(props.children as ChildList)}
        </Stack>
      ),
    }),
    defineA2uiComponent({
      name: 'Card',
      description: 'Bordered surface container with optional elevation.',
      schema: CardSchema,
      presenter: ({ props, renderChildren }) => (
        <Card flat={props.flat as boolean | undefined}>
          {renderChildren(props.children as ChildList)}
        </Card>
      ),
    }),
    defineA2uiComponent({
      name: 'Text',
      description: 'Typographic text using bounded variant and semantic tone tokens.',
      schema: TextSchema,
      presenter: ({ props }) => (
        <A2uiText
          text={typeof props.text === 'string' ? props.text : ''}
          variant={props.variant as 'heading' | 'subheading' | 'body' | 'caption' | undefined}
          tone={props.tone as 'body' | 'subtle' | 'accent' | 'danger' | undefined}
        />
      ),
    }),
    defineA2uiComponent({
      name: 'Alert',
      description: 'Semantic notice or status banner with optional live-region announcement.',
      schema: AlertSchema,
      presenter: ({ props, accessibility }) => {
        const liveChoice =
          accessibility.live ?? (props.live as 'off' | 'polite' | 'assertive' | undefined)
        const live = liveChoice === 'polite' || liveChoice === 'assertive' ? liveChoice : false
        return (
          <Alert tone={props.tone as 'neutral' | 'accent' | 'danger' | undefined} live={live}>
            {typeof props.text === 'string' ? props.text : ''}
          </Alert>
        )
      },
    }),
    defineA2uiComponent({
      name: 'Button',
      description: 'Interactive button with bounded tone/size tokens and A2UI action dispatch.',
      schema: ButtonSchema,
      presenter: ({ props, accessibility, dispatch }) => {
        const action = props.action as A2uiAction | undefined
        const disabled = Boolean(props.disabled)
        return (
          <Button
            tone={props.tone as 'accent' | 'neutral' | 'quiet' | 'danger' | undefined}
            size={props.size as 'sm' | 'md' | undefined}
            disabled={disabled}
            accessibilityLabel={accessibility.label}
            onPress={action ? () => dispatch(action) : undefined}
          >
            {typeof props.label === 'string' ? props.label : ''}
          </Button>
        )
      },
    }),
  ],
})
