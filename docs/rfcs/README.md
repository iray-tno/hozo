# Hozo RFCs (Requests for Comments)

This directory houses technical specifications, architectural designs, and accessibility verification matrices for Hozo.

While `docs/proposal.md` describes the foundational vision and `docs/decisions/` records settled architectural decisions (ADRs), RFCs define the concrete specifications for component domains, runtime behaviors, compiler lowerings, and cross-platform integrations.

---

## RFC Lifecycle

1. **Draft**: Proposed specification under active design and community review.
2. **Accepted**: Design agreed upon; ready for implementation.
3. **Implemented**: Shipped in the codebase, with automated tests and documentation.
4. **Superseded / Deferred**: Replaced by a newer specification or deferred for future milestones.

---

## Index of RFCs

| # | Title | Target Domain / Package | Status | Tracking Issue |
|---|---|---|---|---|
| [001](001-universal-behaviors.md) | Universal Runtime Behaviors & Floating Positioning | Layer 2 (`@hozo/behaviors`) | **Implemented** | #156, #158, #211 |
| [002](002-universal-dialog.md) | Universal Dialog Component | Layer 3 (`@hozo/patterns`) | **Implemented** | #156, #167, #203 |
| [003](003-universal-navigation-and-links.md) | Universal Navigation, Links, Pressables & Router Adapters | Layer 1 & 2 (`@hozo/core`, `@hozo/navigation`, `@hozo/canvas`) | **Implemented** | #185 |
| [004](004-three-renderer-families.md) | Three.js Renderer Families | `@hozo/three` | **Implemented**; the follow-ups #595 and #596 are closed too | #574 |
| [005](005-universal-media.md) | Universal media: a shared playback contract, platform-owned engines | `@hozo/media` | **Implemented (first slice)**: playback, shared basic controls and inline timed captions | #147 |
| [006](006-native-text-inheritance.md) | Native text inheritance with a measured static fast path | Compiler, primitives, engine, typography and patterns | **Superseded** for the default by [decision 013](../decisions/013-text-inheritance-compiled-where-visible.md) | [#2049](https://github.com/iray-tno/hozo/issues/2049) |
| [007](007-canonical-tailwind-order.md) | One Tailwind ordering plan before platform lowering | Compiler, Tailwind, engine and build integrations | **Implemented** | #1230 |
| [008](008-window-splitter.md) | Window splitter | Behaviors, patterns, core and UI | **Implemented (initial slice)** | #1191 |
| [009](009-code-blocks.md) | Code blocks | Typography, patterns, core and UI | **Implemented (initial slice)** | #1189 |
| [010](010-one-styling-fact-model.md) | One styling fact model | Compiler, engine, component contracts and build integrations | **Draft**; junctions and evidence gate decided in [decision 012](../decisions/012-where-the-styling-workstreams-meet.md) | [#1458](https://github.com/iray-tno/hozo/issues/1458) |
| [011](011-hozo-cli.md) | One `hozo` command | New `@hozo/cli`; migration audit, compiler and navigation | **Implemented (steps 1–4)**; step 5 is measured on the release that ships step 1 | Not assigned |
| [012](012-hozo-add.md) | `hozo add`: an `@hozo/ui` component as project source | `@hozo/cli`, `@hozo/ui` | **Implemented** | Not assigned |
| [013](013-hozo-init.md) | `hozo init`: Hozo added to an existing project | `@hozo/cli`, `@hozo/compiler` | **Implemented** | Not assigned |
| [014](014-windowed-table.md) | Windowed Table | Patterns, core, semantics and primitives | **Implemented (declared-width, fixed-height slice)**; Native screen-reader speech is not yet verified on a device | [#1373](https://github.com/iray-tno/hozo/issues/1373), [#2130](https://github.com/iray-tno/hozo/issues/2130) |

### Unnumbered design notes

These were written for one fix or feature, and are kept because the code
still follows them.

| Note | What it settles | Status | Tracking Issue |
|---|---|---|---|
| [Menu popup layer](menu-popup-layer.md) | Menu's popup goes to the top layer so a later stacking context cannot cover it | **Implemented** | #1035 |
| [Native pattern state styles](native-pattern-state-styles.md) | Which pattern class props get interaction styles on Native, and from which owner | **Implemented**; the supported pairs are listed in `hozo_native::pattern` | Not assigned |
| [Style-slot contracts](style-slot-contracts.md) | One routing for a component's class props, and detection of unregistered ones | **Implemented (first slices)**; the slot catalog is now input F3 of [RFC 010](010-one-styling-fact-model.md) | #987 |

---

## RFC Template

When creating a new RFC, follow this general structure:

```markdown
# RFC [Number]: [Title]

- **Status**: Draft | Accepted | Implemented
- **Authors**: [Name]
- **Tracking Issue**: #[Issue Number]
- **Target Package(s)**: `@hozo/...`

## 1. Summary & Motivation
Brief explanation of the problem, why it matters across Web and React Native, and what this RFC accomplishes.

## 2. Architectural Design
High-level structure, layer placement (Layer 1 primitive vs Layer 2 behavior vs Layer 3 compound component), and component diagrams.

## 3. Compiler Contribution
What the compiler solves statically at build time (e.g. ID wiring, inert propagation, initial focus target resolution, style lowering).

## 4. API Specification
Exported components, props, hooks, and typescript types.

## 5. Platform Lowering
- **Web**: Semantic HTML5 markup, CSS classes, ARIA attributes, keyboard handling.
- **Native**: React Native / Fabric primitives, StyleSheet, accessibility props.

## 6. Accessibility Verification Matrix
Empirical assistive technology (AT) verification plan for real devices:

| Target Platform | Semantic Output | Expected AT Behavior | Automated speech | Verified (Human) |
|---|---|---|---|---|
| Web / Chrome + NVDA | `<role>` / ARIA | Expected announcement & keyboard flow | Which story `screen-readers.yml` reads, or Not covered | ⬜ |
| Web / Safari + VoiceOver | Semantic DOM / ARIA | Expected rotor & swipe flow | Which story `screen-readers.yml` reads, or Not covered | ⬜ |
| iOS + VoiceOver | RN Accessibility Props | Traps swipe focus, announces role | — | ⬜ |
| Android + TalkBack | RN Accessibility Props | Traps touch cursor, modal flag | What `native.yml`'s `talkback` job reaches by Tab, or Not covered | ⬜ |

Automated speech says which CI run hears this behavior, and how much of it. "Not covered" means a capture exists for the platform but reads nothing of this RFC; "—" means the platform has no speech capture at all, which is true of iOS VoiceOver. It never ticks the last column.
```
