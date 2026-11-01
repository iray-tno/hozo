// The probe reads the catalog contribution, not a second contract definition.
// Explicit selection and audit=unknown still do not enable adapter rollout.
import { ownerFixtureShadow } from './owner-fixture.mjs'

export const tabsProbeOwnerShadow = ownerFixtureShadow('Tabs.Tab')
