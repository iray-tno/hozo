// Private diagnostic adapter, not a production import or a second algorithm.
import { HozoInteractionContext } from '@hozo/behaviors/pressable-interaction'
import { HozoTextSizeContext } from '@hozo/engine'
import { HozoPressable } from '@hozo/primitives/generated/pressable'
import * as React from 'react'
import { type StyleProp, StyleSheet, Text, type TextStyle, View } from 'react-native'
import {
  createTextReference,
  TEXT_REFERENCE_FIELDS,
} from '../../../packages/tailwind-conformance/src/text-inheritance-reference-core'

// Instantiate once with the app's singletons, not a test package's React.
export const nativeTextReference = createTextReference({
  react: React,
  Text,
  View,
  HozoPressable,
  HozoTextSizeContext,
  HozoInteractionContext,
  flattenStyle: (style) => ({ ...StyleSheet.flatten(style as StyleProp<TextStyle>) }),
  renderViewStyle: (style) => {
    const rendered = { ...StyleSheet.flatten(style as StyleProp<TextStyle>) }
    // Typography is owner data in this private compiler reference, not RN
    // ViewStyle. Publish first, then leave only valid host styles on the View.
    for (const name of TEXT_REFERENCE_FIELDS) delete rendered[name]
    return rendered
  },
})
