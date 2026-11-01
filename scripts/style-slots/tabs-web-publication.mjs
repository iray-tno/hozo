// Explicit finite fixture; package/session plumbing is shared with the handle probe.
import { tabLabelClasses } from './tabs-probe.mjs'
import { prepareWebOwnerPublication } from './web-owner-publication.mjs'

export function prepareWebTabsPublication() {
  const source = `import {Tabs} from '@hozo/patterns';
export function TabsFixture({tabs,index,onIndexChange}) {return <Tabs tabs={tabs} index={index} onIndexChange={onIndexChange} tabClassName=${JSON.stringify(tabLabelClasses)}/>} `
  return prepareWebOwnerPublication(source, {
    fixture: 'OwnerTabsFixture',
    imported: 'Tabs',
    classProp: 'tabClassName',
    owner: 'Tabs.Tab',
    sites: 1,
  })
}
