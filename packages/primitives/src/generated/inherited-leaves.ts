// Native-only compiler ABI (decision 013). A leaf of its own because nearly
// every Native file emits it, and Metro ships whatever module it imports.
export { HozoInheritedLeafText, HozoInheritedScope } from '../inherited-leaves.native.tsx'
