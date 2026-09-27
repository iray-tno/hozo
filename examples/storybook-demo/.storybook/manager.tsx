import React, { useState } from 'react'
import { addons, types } from 'storybook/manager-api'
import { create } from 'storybook/theming/create'

addons.setConfig({
  theme: create({
    base: 'dark',
    brandTitle: 'Hozo',
    brandUrl: '../',
    brandTarget: '_self',
  }),
})

function HomeButton() {
  const [hovered, setHovered] = useState(false)
  const [focused, setFocused] = useState(false)
  const active = hovered || focused

  return React.createElement(
    'a',
    {
      href: '../',
      target: '_self',
      title: 'Back to Hozo LP Home',
      'aria-label': 'Back to Hozo LP Home',
      onMouseEnter: () => setHovered(true),
      onMouseLeave: () => setHovered(false),
      onFocus: () => setFocused(true),
      onBlur: () => setFocused(false),
      style: {
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        padding: '3px 10px',
        borderRadius: '6px',
        textDecoration: 'none',
        fontSize: '12px',
        fontWeight: 600,
        color: active ? '#ffffff' : '#c8a882',
        border: `1px solid ${active ? '#c8a882' : 'rgba(200, 168, 130, 0.4)'}`,
        backgroundColor: active ? 'rgba(200, 168, 130, 0.25)' : 'rgba(200, 168, 130, 0.1)',
        transition: 'all 0.15s ease-in-out',
        margin: '0 4px',
        outline: focused ? '2px solid #c8a882' : 'none',
        outlineOffset: '2px',
      },
    },
    React.createElement(
      'span',
      { 'aria-hidden': 'true', style: { fontSize: '13px', lineHeight: 1 } },
      '←',
    ),
    React.createElement('span', null, 'Hozo Home'),
  )
}

addons.register('hozo/home-link', () => {
  addons.add('hozo/home-link/tool', {
    title: 'Back to Hozo Home',
    type: types.TOOL,
    match: () => true,
    render: () => React.createElement(HomeButton, null),
  })
})
