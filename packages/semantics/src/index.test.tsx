import assert from 'node:assert/strict'
import test from 'node:test'
import { renderToStaticMarkup } from 'react-dom/server'

import {
  Address,
  Article,
  Aside,
  Description,
  Details,
  Fieldset,
  Figcaption,
  Figure,
  Footer,
  Header,
  Legend,
  List,
  ListItem,
  Main,
  Nav,
  Search,
  Section,
  Summary,
  Term,
  TermList,
  Time,
} from './index.tsx'

test('semantic landmark and document structure primitives render HTML5 elements', () => {
  const html = renderToStaticMarkup(
    <div>
      <Header>
        <Nav accessibilityLabel="Primary Navigation">Nav</Nav>
      </Header>
      <Main>
        <Section>
          <Article>
            <Time dateTime="2026-09-02">September 2, 2026</Time>
            <Figure>
              <Figcaption>Figure Caption</Figcaption>
            </Figure>
          </Article>
        </Section>
        <Aside>
          <Search>Search form</Search>
        </Aside>
      </Main>
      <Footer>
        <Address>support@hozo.dev</Address>
      </Footer>
    </div>,
  )

  assert.ok(html.includes('<header class="hozo-view">'), 'Header rendered as header')
  assert.ok(
    html.includes('<nav class="hozo-view" aria-label="Primary Navigation">'),
    'Nav rendered as nav with aria-label',
  )
  assert.ok(html.includes('<main class="hozo-view">'), 'Main rendered as main')
  assert.ok(html.includes('<section class="hozo-view">'), 'Section rendered as section')
  assert.ok(html.includes('<article class="hozo-view">'), 'Article rendered as article')
  assert.ok(
    html.includes('<time dateTime="2026-09-02">September 2, 2026</time>'),
    'Time rendered with dateTime',
  )
  assert.ok(html.includes('<figure class="hozo-view">'), 'Figure rendered as figure')
  assert.ok(
    html.includes('<figcaption>Figure Caption</figcaption>'),
    'Figcaption rendered as figcaption',
  )
  assert.ok(html.includes('<aside class="hozo-view">'), 'Aside rendered as aside')
  assert.ok(
    html.includes('<search class="hozo-view">Search form</search>'),
    'Search rendered as search',
  )
  assert.ok(html.includes('<footer class="hozo-view">'), 'Footer rendered as footer')
  assert.ok(
    html.includes('<address class="hozo-view">support@hozo.dev</address>'),
    'Address rendered as address',
  )
})

test('structural form, disclosure, and term list primitives render HTML5 elements', () => {
  const html = renderToStaticMarkup(
    <div>
      <Fieldset accessibilityLabel="Contact Options">
        <Legend>Contact Options</Legend>
      </Fieldset>
      <Details open>
        <Summary>More Information</Summary>
        <div>Detailed content</div>
      </Details>
      <TermList>
        <Term>Hozo</Term>
        <Description>A universal UI compiler</Description>
        <TermList.Term>License</TermList.Term>
        <TermList.Description>MIT</TermList.Description>
      </TermList>
      <List ordered accessibilityLabel="Steps">
        <ListItem>First</ListItem>
        <ListItem>Second</ListItem>
      </List>
    </div>,
  )

  assert.ok(
    html.includes('<fieldset class="hozo-view" aria-label="Contact Options">'),
    'Fieldset rendered as fieldset',
  )
  assert.ok(html.includes('<legend>Contact Options</legend>'), 'Legend rendered as legend')
  assert.ok(html.includes('<details open="">'), 'Details rendered as details with open')
  assert.ok(html.includes('<summary>More Information</summary>'), 'Summary rendered as summary')
  assert.ok(html.includes('<dl class="hozo-view">'), 'TermList rendered as dl')
  assert.ok(html.includes('<dt>Hozo</dt>'), 'Term rendered as dt')
  assert.ok(
    html.includes('<dd class="hozo-view">A universal UI compiler</dd>'),
    'Description rendered as dd',
  )
  assert.ok(html.includes('<dt>License</dt>'), 'TermList.Term rendered as dt')
  assert.ok(html.includes('<dd class="hozo-view">MIT</dd>'), 'TermList.Description rendered as dd')
  assert.ok(
    html.includes('<ol class="hozo-view" aria-label="Steps">'),
    'ordered List rendered as ol',
  )
  assert.ok(html.includes('<li class="hozo-view">First</li>'), 'ListItem rendered as li')
})

test('fallback boxes share one SSR stylesheet without overriding authored styles', () => {
  const html = renderToStaticMarkup(
    <Main>
      <Nav className="flex-row shrink" style={{ flexShrink: 2 }}>
        Navigation
      </Nav>
      <Section className="hozo-view custom">
        <Article />
      </Section>
    </Main>,
  )
  assert.equal((html.match(/data-href="hozo-view-base"/g) ?? []).length, 1)
  assert.ok(
    html.indexOf('<style') < html.indexOf('<main'),
    'resource is hoisted, not a landmark child',
  )
  assert.match(html, /class="hozo-view flex-row shrink" style="flex-shrink:2"/)
  assert.match(html, /class="hozo-view custom"/)
  assert.doesNotMatch(html, /hozo-view hozo-view/)
  assert.match(html, /@layer base/)
  assert.match(html, /flex-direction:column|flex-direction: column/)
})
