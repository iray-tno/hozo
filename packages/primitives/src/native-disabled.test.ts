import assert from 'node:assert/strict'
import test from 'node:test'
import { nativeDisabledProps } from './native-disabled.ts'

test('canonical unavailable state never enables a state-disabled control or loses other state keys', () => {
  for (const disabled of [undefined, null, false, true]) {
    for (const stateDisabled of [undefined, false, true]) {
      const state = Object.freeze({
        disabled: stateDisabled,
        selected: true,
        checked: 'mixed' as const,
        busy: true,
      })
      const input = Object.freeze({ disabled, accessibilityState: state, testID: 'owner' })
      const output = nativeDisabledProps(input)
      const unavailable = Boolean(disabled || stateDisabled === true)
      assert.equal(Boolean(output.disabled), unavailable)
      assert.equal(Boolean(output.accessibilityState?.disabled), unavailable)
      assert.equal(output.accessibilityState?.selected, true)
      assert.equal(output.accessibilityState?.checked, 'mixed')
      assert.equal(output.accessibilityState?.busy, true)
      assert.equal(output.testID, 'owner')
      assert.equal(
        nativeDisabledProps(output),
        output,
        'normalized controls have an identity fast path',
      )
      if (!unavailable || (disabled === true && stateDisabled === true)) assert.equal(output, input)
      assert.equal(state.disabled, stateDisabled, 'authored state is never mutated')
      if (stateDisabled === true) assert.equal(output.accessibilityState, state)
    }
    for (const accessibilityState of [undefined, null]) {
      const input = { disabled, accessibilityState }
      const output = nativeDisabledProps(input)
      assert.equal(Boolean(output.disabled), Boolean(disabled))
      assert.equal(Boolean(output.accessibilityState?.disabled), Boolean(disabled))
      if (!disabled) assert.equal(output, input)
    }
  }
})
