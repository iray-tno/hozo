import {
  type HozoPressableInteractionState,
  usePressableInteraction,
} from '@hozo/behaviors/pressable-interaction'
import { type ComponentRef, type Ref, useContext, useLayoutEffect, useState } from 'react'
import { TextInput, type TextInputProps } from 'react-native'
import { HozoPeerContext } from './peer-context.native.ts'
import { HozoSubtreeContext, useReportSubtreeInteraction } from './subtree-context.native.ts'
import { type NativeTextInputProps, nativeTextInputProps } from './text-input-props.native.ts'

export interface HozoTextInputInteractionState extends HozoPressableInteractionState {
  touched: boolean
}

export interface HozoTextInputFieldColors {
  placeholderTextColor?: TextInputProps['placeholderTextColor']
  selectionColor?: TextInputProps['selectionColor']
  cursorColor?: TextInputProps['cursorColor']
}

export interface HozoTextInputProps extends NativeTextInputProps {
  ref?: Ref<ComponentRef<typeof TextInput>>
  /** Compiler-only style evaluation on this input, not an ancestor Pressable. */
  hozoStyle?: (state: HozoTextInputInteractionState) => TextInputProps['style']
  /** Compiler-only focus-driven field colour props (`focus:placeholder:*`, `focus:selection:bg-*`, `focus:caret-*`). */
  hozoFieldColors?: (state: HozoTextInputInteractionState) => HozoTextInputFieldColors
  /** Channel ID inside an enclosing `HozoPeerScope` when a following sibling reads `peer-focus:`/`peer-focus-visible:`. */
  hozoPeerId?: number
  /** Enables focus reporting to an enclosing `HozoSubtreeBoundary` (`focus-within:` / `has-[:focus]:`). */
  hozoReportSubtree?: boolean
}

/**
 * Generated-code host when static or dynamic classes need input focus. Ordinary
 * compiled inputs stay RN TextInput. No extra box, context, animation or
 * subscriptions; the same native field keeps its ref, events and semantics.
 *
 * A keyboard-input field indicates focus even after a pointer/touch focuses
 * it (Selectors 4 §9.4). A button's pointer modality is not its policy.
 */
export function HozoTextInput(props: HozoTextInputProps) {
  const subtreeReporter = useContext(HozoSubtreeContext)
  // A prop-only adapter needs no state subscription. The focus child exists
  // only for a compiler callback, peer channel, or enclosing subtree scope
  // and still renders exactly one RN field.
  if (
    !props.hozoStyle &&
    !props.hozoFieldColors &&
    props.hozoPeerId === undefined &&
    !props.hozoReportSubtree &&
    subtreeReporter === null
  ) {
    const {
      hozoStyle: _hozoStyle,
      hozoFieldColors: _hozoFieldColors,
      hozoPeerId: _hozoPeerId,
      hozoReportSubtree: _hozoReportSubtree,
      ref,
      ...hostProps
    } = props
    return <TextInput {...nativeTextInputProps(hostProps)} ref={ref} />
  }
  return <FocusedTextInput {...props} />
}

function FocusedTextInput({
  ref,
  hozoStyle,
  hozoFieldColors,
  hozoPeerId,
  hozoReportSubtree: _hozoReportSubtree,
  style,
  onFocus,
  onBlur,
  onChangeText,
  ...props
}: HozoTextInputProps) {
  const { state, handlers } = usePressableInteraction({ focusVisible: 'keyboard-input' })
  const [touched, setTouched] = useState(false)
  const peerStore = useContext(HozoPeerContext)
  useLayoutEffect(() => {
    if (peerStore && hozoPeerId !== undefined) {
      peerStore.publish(hozoPeerId, state)
    }
  }, [peerStore, hozoPeerId, state])
  useLayoutEffect(() => {
    if (!peerStore || hozoPeerId === undefined) return
    return () => peerStore.clear(hozoPeerId)
  }, [peerStore, hozoPeerId])
  useReportSubtreeInteraction(state)
  const inputState: HozoTextInputInteractionState = { ...state, touched }
  const fieldColors = hozoFieldColors?.(inputState)
  const normalized = nativeTextInputProps(props)
  return (
    <TextInput
      {...normalized}
      placeholderTextColor={normalized.placeholderTextColor ?? fieldColors?.placeholderTextColor}
      selectionColor={normalized.selectionColor ?? fieldColors?.selectionColor}
      cursorColor={normalized.cursorColor ?? fieldColors?.cursorColor}
      ref={ref}
      style={hozoStyle ? [hozoStyle(inputState), style] : style}
      onFocus={(event) => {
        handlers.focus()
        onFocus?.(event)
      }}
      onBlur={(event) => {
        handlers.blur()
        setTouched(true)
        onBlur?.(event)
      }}
      onChangeText={(text) => {
        setTouched(true)
        onChangeText?.(text)
      }}
    />
  )
}
