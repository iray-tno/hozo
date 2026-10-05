# @hozo/compiler

## 0.2.0

- Discover and transform source-distributed dependencies: declared Hozo packages are scanned by default; `content.packages` replaces that list. Resolve stylesheet paths from the project.
- Preserve arbitrary-value data-attribute candidates, resolve chained and paired dark theme tokens, and parse StyleX `@starting-style` / `data-*` conditions.
- Require trusted authoring imports, preserve shapes hidden by unknown spreads, and reject generated import-binding collisions with `RUNTIME_IMPORT_COLLISION`.
- Extend Native lowering for entrance/exit motion, project keyframes, animated Text and the SVG filter imports. Unsupported animation properties remain diagnostic.

See the [Hozo release notes and migration steps](https://github.com/iray-tno/hozo/blob/main/CHANGELOG.md#020) for cross-package changes and measured boundaries.
