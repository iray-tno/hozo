import assert from 'node:assert/strict'
import test from 'node:test'
import { renderToStaticMarkup } from 'react-dom/server'

import {
  Address,
  Article,
  Aside,
  Dd,
  Details,
  Dl,
  Dt,
  Fieldset,
  Figcaption,
  Figure,
  Footer,
  Header,
  Legend,
  Main,
  Nav,
  Search,
  Section,
  Summary,
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

  assert.ok(html.includes('<header>'), 'Header rendered as header')
  assert.ok(
    html.includes('<nav aria-label="Primary Navigation">'),
    'Nav rendered as nav with aria-label',
  )
  assert.ok(html.includes('<main>'), 'Main rendered as main')
  assert.ok(html.includes('<section>'), 'Section rendered as section')
  assert.ok(html.includes('<article>'), 'Article rendered as article')
  assert.ok(
    html.includes('<time dateTime="2026-09-02">September 2, 2026</time>'),
    'Time rendered with dateTime',
  )
  assert.ok(html.includes('<figure>'), 'Figure rendered as figure')
  assert.ok(
    html.includes('<figcaption>Figure Caption</figcaption>'),
    'Figcaption rendered as figcaption',
  )
  assert.ok(html.includes('<aside>'), 'Aside rendered as aside')
  assert.ok(html.includes('<search>Search form</search>'), 'Search rendered as search')
  assert.ok(html.includes('<footer>'), 'Footer rendered as footer')
  assert.ok(html.includes('<address>support@hozo.dev</address>'), 'Address rendered as address')
})

test('structural form, disclosure, and definition list primitives render HTML5 elements', () => {
  const html = renderToStaticMarkup(
    <div>
      <Fieldset accessibilityLabel="Contact Options">
        <Legend>Contact Options</Legend>
      </Fieldset>
      <Details open>
        <Summary>More Information</Summary>
        <div>Detailed content</div>
      </Details>
      <Dl>
        <Dt>Hozo</Dt>
        <Dd>A universal UI compiler</Dd>
      </Dl>
    </div>,
  )

  assert.ok(
    html.includes('<fieldset aria-label="Contact Options">'),
    'Fieldset rendered as fieldset',
  )
  assert.ok(html.includes('<legend>Contact Options</legend>'), 'Legend rendered as legend')
  assert.ok(html.includes('<details open="">'), 'Details rendered as details with open')
  assert.ok(html.includes('<summary>More Information</summary>'), 'Summary rendered as summary')
  assert.ok(html.includes('<dl>'), 'Dl rendered as dl')
  assert.ok(html.includes('<dt>Hozo</dt>'), 'Dt rendered as dt')
  assert.ok(html.includes('<dd>A universal UI compiler</dd>'), 'Dd rendered as dd')
})
