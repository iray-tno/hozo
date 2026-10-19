// Node-only adapter. Native fixtures use the same factory with their own
// React/hosts/contexts; never import this adapter into a device bundle.
import { createRequire } from 'node:module'
import * as React from 'react'
import { StyleSheet, Text, View } from './text-inheritance-host.ts'
import { createTextReference } from './text-inheritance-reference-core.ts'

const require = createRequire(import.meta.url)
const { HozoPressable } = require('../../primitives/src/pressable.native.tsx')
const { HozoTextSizeContext } = require('@hozo/engine')
// Match the real Pressable entry, not a raw source Context with another identity.
const { HozoInteractionContext } = require('@hozo/behaviors/pressable-interaction')
export const {
  ReferenceText,
  ReferenceView,
  ReferencePressable,
  PaintMaskedText,
  useReferenceMetrics,
  useReferencePaint,
  referenceExecutions,
  referenceReads,
  resetReferenceExecutions,
  referenceNativeImports,
} = createTextReference({
  react: React,
  Text,
  View,
  HozoPressable,
  HozoTextSizeContext,
  HozoInteractionContext,
  flattenStyle: StyleSheet.flatten,
})
