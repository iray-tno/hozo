---
'@hozo/patterns': minor
'@hozo/ui': minor
---

Accordion panels can animate opening and closing. The pattern now wraps each panel's content in a node of its own (`panelContentClassName`, and `panelContentStyle` on Native) and gives the Web panel its content's measured height as `--hozo-panel-height`; a closing panel is `inert` until its exit transition ends and then `hidden`. On Native, a panel whose classes ask for a `height` transition grows and shrinks through `HozoAnimated` and is removed when it reaches `0`. `@hozo/ui`'s Accordion uses this for a 200ms height transition, with its padding moved to the content node, and opens and closes at once under reduced motion.
