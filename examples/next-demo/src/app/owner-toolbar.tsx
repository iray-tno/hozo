'use client'

import { Toolbar } from '@hozo/patterns'
import type { Ref } from 'react'

export function OwnerToolbar() {
  return (
    <Toolbar
      accessibilityLabel="Manifest toolbar"
      className="pt-[13px]"
      items={[
        {
          render: (props) => (
            <button {...props} ref={props.ref as Ref<HTMLButtonElement>} type="button">
              Tools
            </button>
          ),
        },
      ]}
    />
  )
}
