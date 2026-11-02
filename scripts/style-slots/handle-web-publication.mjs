import { handleClasses } from './handle-publication.mjs'
import { handleStateClasses } from './handle-web.mjs'
import { prepareWebOwnerPublication } from './web-owner-publication.mjs'

export function prepareWebHandlePublication(lifetime = false) {
  const props =
    'open={open} onClose={onClose} portal={false} detents={interactive?[.5,1]:[1]} accessibilityLabel={accessibilityLabel} sheetClassName={sheetClassName} handleStyle={handleStyle}'
  const source = `import {BottomSheet} from '@hozo/patterns';
export function HandleFixture({interactive,open,onClose,accessibilityLabel,sheetClassName,handleStyle,children}) {
 return interactive
  ? <BottomSheet ${props} handleClassName=${JSON.stringify(lifetime ? handleClasses : handleStateClasses)}>{children}</BottomSheet>
  : <BottomSheet ${props} handleClassName=${JSON.stringify(handleClasses)}>{children}</BottomSheet>
}`
  return prepareWebOwnerPublication(source, {
    fixture: lifetime ? 'OwnerHandleLifetimeFixture' : 'OwnerHandleStateFixture',
    imported: 'BottomSheet',
    classProp: 'handleClassName',
    owner: 'BottomSheet.handle',
    sites: 2,
  })
}
