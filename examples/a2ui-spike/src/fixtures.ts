import { HOZO_A2UI_CATALOG_ID } from './hozo-catalog-schemas.ts'
import type { AgentToRendererMessage } from './protocol.ts'

export const SURFACE_ID = 'release-gate'

/**
 * A2UI v1.0 single-message surface creation (inline `components` + `dataModel`,
 * `@path` bindings, template child list, semantic tones, live alert, actions).
 */
export const deploymentStatusV1Messages: readonly AgentToRendererMessage[] = [
  {
    version: '1.0',
    createSurface: {
      surfaceId: SURFACE_ID,
      catalogId: HOZO_A2UI_CATALOG_ID,
      sendDataModel: true,
      components: [
        {
          id: 'root',
          component: 'Card',
          flat: false,
          children: ['layout'],
        },
        {
          id: 'layout',
          component: 'Stack',
          direction: 'column',
          gap: 'normal',
          align: 'stretch',
          children: ['heading', 'summary', 'alert', 'checks_list', 'actions'],
        },
        {
          id: 'heading',
          component: 'Text',
          text: { '@path': '/release/title' },
          variant: 'heading',
          tone: 'body',
        },
        {
          id: 'summary',
          component: 'Text',
          text: { '@path': '/release/summary' },
          variant: 'body',
          tone: 'subtle',
        },
        {
          id: 'alert',
          component: 'Alert',
          text: { '@path': '/release/notice' },
          tone: 'danger',
          live: 'polite',
        },
        {
          id: 'checks_list',
          component: 'Stack',
          direction: 'column',
          gap: 'tight',
          align: 'start',
          children: {
            componentId: 'check_item',
            path: '/checks',
          },
        },
        {
          id: 'check_item',
          component: 'Text',
          text: { '@path': 'label' },
          variant: 'caption',
          tone: 'accent',
        },
        {
          id: 'actions',
          component: 'Stack',
          direction: 'row',
          gap: 'tight',
          align: 'center',
          children: ['approve_btn', 'rollback_btn'],
        },
        {
          id: 'approve_btn',
          component: 'Button',
          label: { '@path': '/actions/approveLabel' },
          tone: 'accent',
          size: 'md',
          disabled: { '@path': '/release/blocked' },
          accessibility: {
            label: { '@path': '/actions/approveA11y' },
          },
          action: {
            event: {
              name: 'approve_release',
              userMessage: { '@path': '/release/title' },
              context: {
                version: { '@path': '/release/version' },
                environment: 'production',
              },
            },
          },
        },
        {
          id: 'rollback_btn',
          component: 'Button',
          label: 'Rollback',
          tone: 'danger',
          size: 'sm',
          action: {
            event: {
              name: 'rollback_release',
              context: {
                version: { '@path': '/release/version' },
              },
            },
          },
        },
      ],
      dataModel: {
        release: {
          version: '0.5.2',
          title: 'Release 0.5.2 Ready Check',
          summary: 'Waiting for the final browser check before promotion.',
          notice: 'Approval is locked until all checks turn green.',
          blocked: true,
        },
        checks: [{ label: 'lint: passed' }, { label: 'rust-tests: 1224 passed' }],
        actions: {
          approveLabel: 'Approve release',
          approveA11y: 'Approve release 0.5.2 for production',
        },
      },
    },
  },
]

/**
 * Semantically identical A2UI v0.9.1 progressive sequence (3 messages, `path`
 * instead of `@path`), proving wire-level backward compatibility.
 */
export const deploymentStatusV091Messages: readonly AgentToRendererMessage[] = [
  {
    version: 'v0.9.1',
    createSurface: {
      surfaceId: SURFACE_ID,
      catalogId: HOZO_A2UI_CATALOG_ID,
      sendDataModel: true,
    },
  },
  {
    version: 'v0.9.1',
    updateComponents: {
      surfaceId: SURFACE_ID,
      components: [
        { id: 'root', component: 'Card', flat: false, children: ['layout'] },
        {
          id: 'layout',
          component: 'Stack',
          direction: 'column',
          gap: 'normal',
          align: 'stretch',
          children: ['heading', 'summary', 'alert', 'checks_list', 'actions'],
        },
        {
          id: 'heading',
          component: 'Text',
          text: { path: '/release/title' },
          variant: 'heading',
          tone: 'body',
        },
        {
          id: 'summary',
          component: 'Text',
          text: { path: '/release/summary' },
          variant: 'body',
          tone: 'subtle',
        },
        {
          id: 'alert',
          component: 'Alert',
          text: { path: '/release/notice' },
          tone: 'danger',
          live: 'polite',
        },
        {
          id: 'checks_list',
          component: 'Stack',
          direction: 'column',
          gap: 'tight',
          align: 'start',
          children: { componentId: 'check_item', path: '/checks' },
        },
        {
          id: 'check_item',
          component: 'Text',
          text: { path: 'label' },
          variant: 'caption',
          tone: 'accent',
        },
        {
          id: 'actions',
          component: 'Stack',
          direction: 'row',
          gap: 'tight',
          align: 'center',
          children: ['approve_btn', 'rollback_btn'],
        },
        {
          id: 'approve_btn',
          component: 'Button',
          label: { path: '/actions/approveLabel' },
          tone: 'accent',
          size: 'md',
          disabled: { path: '/release/blocked' },
          accessibility: {
            label: { path: '/actions/approveA11y' },
          },
          action: {
            event: {
              name: 'approve_release',
              userMessage: { path: '/release/title' },
              context: {
                version: { path: '/release/version' },
                environment: 'production',
              },
            },
          },
        },
        {
          id: 'rollback_btn',
          component: 'Button',
          label: 'Rollback',
          tone: 'danger',
          size: 'sm',
          action: {
            event: {
              name: 'rollback_release',
              context: {
                version: { path: '/release/version' },
              },
            },
          },
        },
      ],
    },
  },
  {
    version: 'v0.9.1',
    updateDataModel: {
      surfaceId: SURFACE_ID,
      path: '/',
      value: {
        release: {
          version: '0.5.2',
          title: 'Release 0.5.2 Ready Check',
          summary: 'Waiting for the final browser check before promotion.',
          notice: 'Approval is locked until all checks turn green.',
          blocked: true,
        },
        checks: [{ label: 'lint: passed' }, { label: 'rust-tests: 1224 passed' }],
        actions: {
          approveLabel: 'Approve release',
          approveA11y: 'Approve release 0.5.2 for production',
        },
      },
    },
  },
]

/** Live update unblocking the approve button and adding the third check item. */
export const deploymentUnblockUpdates: readonly AgentToRendererMessage[] = [
  {
    version: '1.0',
    updateDataModel: {
      surfaceId: SURFACE_ID,
      path: '/release/blocked',
      value: false,
    },
  },
  {
    version: '1.0',
    updateDataModel: {
      surfaceId: SURFACE_ID,
      path: '/release/notice',
      value: 'All checks passed. Release 0.5.2 can be approved.',
    },
  },
  {
    version: '1.0',
    updateDataModel: {
      surfaceId: SURFACE_ID,
      path: '/checks',
      value: [
        { label: 'lint: passed' },
        { label: 'rust-tests: 1224 passed' },
        { label: 'browser-audit: passed' },
      ],
    },
  },
]

/** Negative fixture: agent tries to inject raw Tailwind classes outside the design system. */
export const invalidClassNameMessage = {
  version: '1.0',
  updateComponents: {
    surfaceId: SURFACE_ID,
    components: [
      {
        id: 'rogue_btn',
        component: 'Button',
        label: 'Escape',
        className: 'bg-[#ff0044] p-20',
      },
    ],
  },
}

/** Negative fixture: agent supplies an out-of-vocabulary tone enum. */
export const invalidToneMessage = {
  version: '1.0',
  updateComponents: {
    surfaceId: SURFACE_ID,
    components: [
      {
        id: 'rogue_alert',
        component: 'Alert',
        text: 'Neon alert',
        tone: 'neon',
      },
    ],
  },
}

/** Negative fixture: cyclic child graph must not hang the renderer. */
export const cyclicGraphMessage = {
  version: '1.0',
  createSurface: {
    surfaceId: 'cyclic-surface',
    catalogId: HOZO_A2UI_CATALOG_ID,
    components: [
      { id: 'root', component: 'Stack', children: ['child_a'] },
      { id: 'child_a', component: 'Card', children: ['root'] },
    ],
  },
}
