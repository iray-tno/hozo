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
| [002](002-universal-dialog.md) | Universal Dialog Component | Layer 3 (`@hozo/core`) | **Implemented** | #156, #167, #203 |
| [003](003-universal-navigation-and-links.md) | Universal Navigation, Links, Pressables & Router Adapters | Layer 1 & 2 (`@hozo/core`, `@hozo/navigation`) | **Draft** | #185 |

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

| Target Platform | Semantic Output | Expected AT Behavior | Verified (Human) |
|---|---|---|---|
| Web / Chrome + NVDA | `<role>` / ARIA | Expected announcement & keyboard flow | ⬜ |
| Web / Safari + VoiceOver | Semantic DOM / ARIA | Expected rotor & swipe flow | ⬜ |
| iOS + VoiceOver | RN Accessibility Props | Traps swipe focus, announces role | ⬜ |
| Android + TalkBack | RN Accessibility Props | Traps touch cursor, modal flag | ⬜ |
```
