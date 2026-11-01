// Selected measurement contract, not a published/audited catalog contribution.
import { OWNER_SHADOW_VERSION } from '../../packages/compiler/src/owner-contract.ts'

export const tabsProbeOwnerShadow = JSON.stringify({
  schema: OWNER_SHADOW_VERSION,
  contracts: [
    {
      owner: 'Tabs.Tab',
      classProp: 'tabClassName',
      audit: 'unknown',
      bindings: ['present'],
      abi: { nativePreparedProp: 'hozoTabStyle', webClassProp: 'tabClassName' },
      authoredStyles: [{ prop: 'tabStyle', order: 0 }],
      shapes: [
        {
          id: 'tab',
          when: { eq: ['present', true] },
          nativeHost: 'Pressable',
          webHost: 'button',
          events: ['pressed', 'hovered', 'focused', 'focusVisible'],
          inputs: { facts: ['disabled', 'aria-selected', 'aria-disabled'], splitText: true },
        },
      ],
    },
  ],
})
