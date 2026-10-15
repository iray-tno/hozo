/** The documented DOM metadata channel; never forward arbitrary leftover props. */
export interface ButtonDataProps {
  [name: `data-${string}`]: string | number | boolean | undefined
}

export function buttonDataProps(props: ButtonDataProps): ButtonDataProps {
  const data: ButtonDataProps = {}
  for (const name in props) {
    if (Object.hasOwn(props, name) && name.startsWith('data-')) {
      data[name as `data-${string}`] = props[name as `data-${string}`]
    }
  }
  return data
}
