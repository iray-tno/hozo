---
"@hozo/compiler": patch
---

Lower Tailwind `before:` and `after:` pseudo-element variants on React Native box containers and text primitives by synthesizing `aria-hidden` leading/trailing `<View>` / `<Text>` / `<HozoInteractionView>` / `<HozoText>` children, supporting `content-['...']` literals, `content-none`, and stacked ambient, interaction, group, peer, and structural variants.
