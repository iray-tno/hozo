---
'@hozo/form': patch
---

Add `SubmitButton`, the button that submits the enclosing `Form`. On Web it is a real `<button type="submit">`, so Enter in any single-line field submits a form with several fields. On React Native it calls `useFormSubmit()`.
