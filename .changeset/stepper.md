---
"@hozo/patterns": minor
"@hozo/ui": minor
"@hozo/core": minor
"@hozo/compiler": minor
"@hozo/behaviors": minor
---

Add `Stepper`: where a person is in a process of several steps. Each step is read with its position and status in words ("Step 2 of 3: Profile, current"), so the status is never carried by colour alone. The current step is marked `aria-current="step"` on the Web and `selected` on Native. With `onStepPress` the steps are buttons. Each status has class lists for the step and its indicator, applied by the pattern, so the look reaches React Native as well.
