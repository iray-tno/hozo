// What a TextInput's spread means on the Web, once the compiler has lowered
// it to an `<input>` or a `<textarea>` (#1118).
//
// `function Field(props) { return <TextInput {...props} /> }` lowers at build
// time, but `props` still holds the primitive's vocabulary -- `onChangeText`,
// `editable`, `keyboardType` -- and spread raw onto the DOM those are unknown
// attributes. `onChangeText` was the one that showed: a controlled
// `@hozo/ui` Input that React reset on every keystroke, because nothing ever
// called the handler. #1096 was the same bug for Button.
//
// So the spread goes through the translation the uncompiled `HozoTextInput`
// applies to its named props. Unlike Button, everything the translation does
// not name passes through, as it does there: `placeholder`, `maxLength`,
// `onFocus` and the rest are already DOM props. Keys the spread does not
// hold are not set, because explicit attributes the compiler wrote before
// the spread must survive it.

import { type HozoDomStyle, hozoDomStyle } from '@hozo/engine'

type Props = Record<string, unknown>
type Handler = ((value: unknown) => void) | undefined
type Field = { value: string; blur(): void }
type KeyEvent = { key: string; currentTarget: Field }

const INPUT_MODES: Record<string, string> = {
  'number-pad': 'numeric',
  numeric: 'numeric',
  'decimal-pad': 'decimal',
  'email-address': 'email',
  'phone-pad': 'tel',
  url: 'url',
  'web-search': 'search',
}

// React Native props with no DOM meaning, and the ones folded into another
// attribute below. The uncompiled TextInput drops them too.
const CONSUMED = new Set([
  'accessibilityHint',
  'accessibilityLabel',
  'accessibilityLabelledBy',
  'autoCorrect',
  'blurOnSubmit',
  'cursorColor',
  'editable',
  'hitSlop',
  'keyboardAppearance',
  'keyboardType',
  'multiline',
  'nativeID',
  'numberOfLines',
  'onChange',
  'onChangeText',
  'onKeyPress',
  'onSubmitEditing',
  'placeholderTextColor',
  'returnKeyType',
  'secureTextEntry',
  'selectionColor',
  'style',
  'testID',
])

/**
 * A TextInput's spread onto the element the compiler chose. `multiline` is
 * whether that element is a `<textarea>`, which the compiler knows and the
 * spread may not say.
 */
export function hozoTextInputDomProps<T>(props: T, multiline = false): T {
  if (!props || typeof props !== 'object') return props
  const source = props as Props
  const has = (name: string) => Object.hasOwn(source, name)
  const out: Props = {}
  for (const name in source) {
    if (has(name) && !CONSUMED.has(name)) out[name] = source[name]
  }

  if (has('accessibilityLabel')) out['aria-label'] = source.accessibilityLabel
  if (has('accessibilityHint')) out['aria-description'] = source.accessibilityHint
  if (has('accessibilityLabelledBy')) out['aria-labelledby'] = source.accessibilityLabelledBy
  if (has('testID')) out['data-testid'] = source.testID
  if (has('nativeID')) out.id = source.nativeID

  if (has('onChange') || has('onChangeText')) {
    const onChange = source.onChange as Handler
    const onChangeText = source.onChangeText as Handler
    out.onChange = (event: { currentTarget: Field }) => {
      onChange?.(event)
      onChangeText?.(event.currentTarget.value)
    }
  }
  if (has('onKeyPress') || has('onSubmitEditing')) {
    const onKeyPress = source.onKeyPress as Handler
    const onSubmitEditing = source.onSubmitEditing as Handler
    const blurOnSubmit = Boolean(source.blurOnSubmit)
    out.onKeyDown = (event: KeyEvent) => {
      onKeyPress?.(event)
      if (event.key !== 'Enter' || !onSubmitEditing) return
      if (!multiline || blurOnSubmit) {
        onSubmitEditing({ nativeEvent: { text: event.currentTarget.value } })
        if (blurOnSubmit) event.currentTarget.blur()
      }
    }
  }

  if (has('readOnly')) out.readOnly = source.readOnly
  else if (has('editable') && source.editable !== undefined) out.readOnly = !source.editable
  if (has('autoCorrect') && source.autoCorrect !== undefined) {
    out.autoCorrect = source.autoCorrect ? 'on' : 'off'
  }
  if (!has('inputMode') && has('keyboardType')) {
    out.inputMode = INPUT_MODES[source.keyboardType as string]
  }
  if (has('returnKeyType')) out.enterKeyHint = source.returnKeyType
  if (multiline) {
    if (has('numberOfLines')) out.rows = source.numberOfLines
  } else if (has('secureTextEntry') && source.secureTextEntry) {
    out.type = 'password'
  }

  const caret = source.cursorColor ?? source.selectionColor
  if (has('style') || caret) {
    out.style = hozoDomStyle([
      source.style as HozoDomStyle,
      caret ? { caretColor: caret as string } : undefined,
    ])
  }
  return out as T
}
