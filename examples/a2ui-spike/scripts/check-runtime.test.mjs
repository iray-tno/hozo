// Runtime, schema-export, and security-boundary tests for the DOM-free Hozo
// A2UI v1.0 (+ v0.9.1) renderer spike (#2251).
import assert from 'node:assert/strict'
import { test } from 'node:test'
import React, { act } from 'react'
import { create } from 'react-test-renderer'
import { z } from 'zod'
import { createA2uiStore, defineA2uiCatalog, defineA2uiComponent } from '../src/engine.ts'
import {
  cyclicGraphMessage,
  deploymentStatusV1Messages,
  deploymentStatusV091Messages,
  deploymentUnblockUpdates,
  invalidClassNameMessage,
  invalidToneMessage,
  SURFACE_ID,
} from '../src/fixtures.ts'
import { HOZO_A2UI_CATALOG_ID, hozoUiSchemaCatalog } from '../src/hozo-catalog-schemas.ts'
import { exportCatalogJsonSchema, getAtPointer, setAtPointer } from '../src/protocol.ts'
import { A2uiSurface } from '../src/renderer.ts'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

// Pure-React test catalog using the exact same schemas as `hozoUiCatalog`,
// proving the engine + renderer need zero DOM globals and zero JSX compilation.
const probeCatalog = defineA2uiCatalog({
  id: hozoUiSchemaCatalog.id,
  description: hozoUiSchemaCatalog.description,
  components: Array.from(hozoUiSchemaCatalog.components.values()).map((entry) =>
    defineA2uiComponent({
      name: entry.name,
      description: entry.description,
      schema: entry.schema,
      presenter: ({ props, accessibility, componentId, renderChildren, dispatch }) =>
        React.createElement(
          `Probe${entry.name}`,
          {
            componentId,
            ...props,
            accessibility,
            onPress: props.action ? () => dispatch(props.action) : undefined,
          },
          renderChildren(props.children),
        ),
    }),
  ),
})

test('engine and renderer require no browser DOM globals', () => {
  assert.equal(typeof globalThis.HTMLElement, 'undefined')
  assert.equal(typeof globalThis.document, 'undefined')
})

test('A2UI v1.0 inline createSurface and v0.9.1 progressive sequence resolve identically', () => {
  const storeV1 = createA2uiStore({
    catalogs: [probeCatalog],
    now: () => '2026-11-25T00:00:00.000Z',
  })
  const storeV091 = createA2uiStore({
    catalogs: [probeCatalog],
    now: () => '2026-11-25T00:00:00.000Z',
  })

  assert.deepEqual(storeV1.processMessages(deploymentStatusV1Messages), [])
  assert.deepEqual(storeV091.processMessages(deploymentStatusV091Messages), [])

  const s1 = storeV1.getSurface(SURFACE_ID)
  const s091 = storeV091.getSurface(SURFACE_ID)
  assert.ok(s1)
  assert.ok(s091)
  assert.equal(s1.components.size, s091.components.size)
  assert.deepEqual(s1.dataModel, s091.dataModel)

  for (const id of ['heading', 'summary', 'alert', 'approve_btn', 'rollback_btn']) {
    const r1 = s1.components.get(id)
    const r091 = s091.components.get(id)
    assert.ok(r1 && r091)
    const p1 = storeV1.resolveProps(s1, r1, '/')
    const p091 = storeV091.resolveProps(s091, r091, '/')
    assert.equal(p1.text, p091.text, `${id}.text`)
    assert.equal(p1.label, p091.label, `${id}.label`)
    assert.equal(p1.disabled, p091.disabled, `${id}.disabled`)
    assert.deepEqual(
      storeV1.resolveAccessibility(s1, r1.accessibility, '/'),
      storeV091.resolveAccessibility(s091, r091.accessibility, '/'),
      `${id}.accessibility`,
    )
  }

  // Template child lists expand per item and resolve relative bindings against each item scope.
  const checksRec = s1.components.get('checks_list')
  assert.ok(checksRec)
  const childRefs = storeV1.resolveChildren(s1, checksRec.props.children, '/')
  assert.deepEqual(
    childRefs.map((ref) => ({
      id: ref.id,
      scopePath: ref.scopePath,
      text: storeV1.resolveProps(s1, s1.components.get(ref.id), ref.scopePath).text,
    })),
    [
      { id: 'check_item', scopePath: '/checks/0', text: 'lint: passed' },
      { id: 'check_item', scopePath: '/checks/1', text: 'rust-tests: 1224 passed' },
    ],
  )
})

test('A2uiSurface renders reactively through updateDataModel, null deletion, and action dispatch', async (t) => {
  const actions = []
  const store = createA2uiStore({
    catalogs: [probeCatalog],
    onAction: (msg) => actions.push(msg),
    now: () => '2026-11-25T00:00:00.000Z',
  })

  assert.deepEqual(store.processMessages(deploymentStatusV1Messages), [])

  let tree
  await act(() => {
    tree = create(React.createElement(A2uiSurface, { store, surfaceId: SURFACE_ID }))
  })
  t.after(async () => {
    await act(() => tree.unmount())
  })

  const texts = () => tree.root.findAllByType('ProbeText').map((node) => node.props.text)
  const approve = () =>
    tree.root.findAllByType('ProbeButton').find((node) => node.props.componentId === 'approve_btn')

  assert.deepEqual(texts(), [
    'Release 0.5.2 Ready Check',
    'Waiting for the final browser check before promotion.',
    'lint: passed',
    'rust-tests: 1224 passed',
  ])
  assert.equal(approve().props.disabled, true)
  assert.equal(approve().props.accessibility.label, 'Approve release 0.5.2 for production')

  // Live update unblocks the button, updates the alert, and appends the third check item.
  await act(() => {
    assert.deepEqual(store.processMessages(deploymentUnblockUpdates), [])
  })

  assert.equal(approve().props.disabled, false)
  assert.equal(
    tree.root.findByType('ProbeAlert').props.text,
    'All checks passed. Release 0.5.2 can be approved.',
  )
  assert.deepEqual(texts(), [
    'Release 0.5.2 Ready Check',
    'Waiting for the final browser check before promotion.',
    'lint: passed',
    'rust-tests: 1224 passed',
    'browser-audit: passed',
  ])

  // Press dispatches a spec-compliant A2UI v1.0 action with resolved context & userMessage.
  await act(() => {
    approve().props.onPress()
  })
  assert.deepEqual(actions, [
    {
      version: '1.0',
      action: {
        name: 'approve_release',
        surfaceId: SURFACE_ID,
        sourceComponentId: 'approve_btn',
        timestamp: '2026-11-25T00:00:00.000Z',
        userMessage: 'Release 0.5.2 Ready Check',
        context: {
          version: '0.5.2',
          environment: 'production',
        },
      },
    },
  ])

  // Explicit null deletes a key per A2UI v1.0 spec.
  await act(() => {
    assert.deepEqual(
      store.processMessage({
        version: '1.0',
        updateDataModel: {
          surfaceId: SURFACE_ID,
          path: '/release/summary',
          value: null,
        },
      }),
      [],
    )
  })
  assert.equal(getAtPointer(store.getSurface(SURFACE_ID).dataModel, '/release/summary'), undefined)

  // RFC 6901 pointer escaping round-trip.
  const escaped = setAtPointer({}, '/meta~1key/tilde~0name', 'ok')
  assert.equal(getAtPointer(escaped, '/meta~1key/tilde~0name'), 'ok')
})

test('strict semantic schemas reject raw className, out-of-vocabulary tones, and reserved Surface', () => {
  const reported = []
  const store = createA2uiStore({
    catalogs: [probeCatalog],
    onError: (err) => reported.push(err),
  })

  assert.deepEqual(store.processMessages(deploymentStatusV1Messages), [])
  const beforeSnapshot = store.getSurface(SURFACE_ID)

  const classErrors = store.processMessage(invalidClassNameMessage)
  assert.equal(classErrors.length, 1)
  assert.equal(classErrors[0].error.code, 'VALIDATION_FAILED')
  assert.match(classErrors[0].error.message, /className/i)

  const toneErrors = store.processMessage(invalidToneMessage)
  assert.equal(toneErrors.length, 1)
  assert.equal(toneErrors[0].error.code, 'VALIDATION_FAILED')

  const surfaceErrors = store.processMessage({
    version: '1.0',
    updateComponents: {
      surfaceId: SURFACE_ID,
      components: [{ id: 'bad', component: 'Surface' }],
    },
  })
  assert.equal(surfaceErrors.length, 1)
  assert.equal(surfaceErrors[0].error.code, 'VALIDATION_FAILED')

  const unknownErrors = store.processMessage({
    version: '1.0',
    updateComponents: {
      surfaceId: SURFACE_ID,
      components: [{ id: 'xss', component: 'Script', src: 'https://evil.example' }],
    },
  })
  assert.equal(unknownErrors.length, 1)
  assert.equal(unknownErrors[0].error.code, 'UNKNOWN_COMPONENT')

  // Failed updates must leave the last valid surface snapshot untouched.
  assert.strictEqual(store.getSurface(SURFACE_ID), beforeSnapshot)
  assert.equal(reported.length, 4)
})

test('A2uiSurface guards cyclic component graphs and enforces allowedChildren', async (t) => {
  const errors = []
  const store = createA2uiStore({
    catalogs: [probeCatalog],
    onError: (err) => errors.push(err),
  })
  assert.deepEqual(store.processMessage(cyclicGraphMessage), [])

  let tree
  await act(() => {
    tree = create(React.createElement(A2uiSurface, { store, surfaceId: 'cyclic-surface' }))
  })
  t.after(async () => {
    await act(() => tree.unmount())
  })

  assert.equal(errors.length, 1)
  assert.equal(errors[0].error.code, 'CYCLE_DETECTED')

  const strictCatalog = defineA2uiCatalog({
    id: 'urn:hozo:test:strict',
    components: [
      defineA2uiComponent({
        name: 'Box',
        schema: z.object({ children: z.array(z.string()) }).strict(),
        allowedChildren: ['Leaf'],
        presenter: ({ renderChildren, props }) => renderChildren(props.children),
      }),
      defineA2uiComponent({
        name: 'Leaf',
        schema: z.object({ text: z.string() }).strict(),
        presenter: ({ props }) => props.text,
      }),
      defineA2uiComponent({
        name: 'Other',
        schema: z.object({}).strict(),
        presenter: () => null,
      }),
    ],
  })
  const strictStore = createA2uiStore({ catalogs: [strictCatalog] })
  const childErrs = strictStore.processMessage({
    version: '1.0',
    createSurface: {
      surfaceId: 's',
      catalogId: strictCatalog.id,
      components: [
        { id: 'root', component: 'Box', children: ['bad'] },
        { id: 'bad', component: 'Other' },
      ],
    },
  })
  assert.equal(childErrs.length, 1)
  assert.equal(childErrs[0].error.code, 'UNALLOWED_CHILD')
  assert.equal(strictStore.getSurface('s'), undefined)
})

test('exportCatalogJsonSchema emits JSON Schema 2020-12 with bounded semantic enums and no className', () => {
  const doc = exportCatalogJsonSchema(hozoUiSchemaCatalog)
  assert.equal(doc.$schema, 'https://json-schema.org/draft/2020-12/schema')
  assert.equal(doc.catalogId, HOZO_A2UI_CATALOG_ID)
  assert.equal(doc.protocolVersion, '1.0')
  assert.deepEqual(Object.keys(doc.components).sort(), ['Alert', 'Button', 'Card', 'Stack', 'Text'])

  for (const [name, schema] of Object.entries(doc.components)) {
    assert.equal(schema.additionalProperties, false, `${name} must reject unknown props`)
    assert.equal(schema.properties.className, undefined, `${name} must not expose raw className`)
    assert.equal(schema.properties.style, undefined, `${name} must not expose raw style`)
  }
  assert.deepEqual(doc.components.Button.properties.tone.enum, [
    'accent',
    'neutral',
    'quiet',
    'danger',
  ])
  assert.deepEqual(doc.components.Stack.properties.gap.enum, ['none', 'tight', 'normal', 'loose'])
})
