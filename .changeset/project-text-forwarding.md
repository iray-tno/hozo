---
"@hozo/metro": patch
"@hozo/compiler": patch
---

On React Native, a `Text` nested in one of the project's own components now gets the text classes that component hands its children, as it already did for a component from a package with a `hozo.manifest.json`. Before, `<Button><Text>Save</Text></Button>` lost the button's weight, size and colour when `Button` was project code, such as an `@hozo/ui` file copied into the project. `withHozo` finds these components when Metro starts, through relative imports, `tsconfig` `paths` and `index` re-exports, so editing one takes a Metro restart, as editing a class helper does.
