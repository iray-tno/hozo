# @hozo/primitives

## 0.2.0

- Add `Presence` to retain a child through exit animation and expose `data-state="closed"`.
- Use React 19 ref props for Web components without forwardRef casts, repair Pressable ref forwarding and preserve existing author-facing ref usage.
- Integrate the compiled Native entrance/exit/keyframe path while keeping animated Text as a Text host.

See the [Hozo release notes and migration steps](https://github.com/iray-tno/hozo/blob/main/CHANGELOG.md#020) for cross-package changes and measured boundaries.

### Patch Changes

- Updated Hozo dependencies:
  - @hozo/engine@0.2.0
  - @hozo/behaviors@0.2.0
