use super::*;

#[test]
fn a_semantic_prop_the_author_already_wrote_is_not_emitted_twice() {
    // Ordinary in a React Native file, and unreachable while the
    // integrations required a rewrite to `@hozo/core`: the author sets
    // the role their own `<FlatList>` needs, and Hozo adds the same
    // one to every FlatList it lowers.
    let source = "import { FlatList } from 'react-native'
export const C = () => <FlatList accessibilityRole=\"list\" data={[]} renderItem={() => null} />
";
    let parsed = hozo_parser::parse_tsx(source);
    let output = lower(&parsed.roots[0].node, source, &Theme::default());
    // One role, in ARIA's spelling: React Native has taken `role`
    // since 0.71, and it is the vocabulary both platforms share.
    assert_eq!(output.jsx.matches("role=").count(), 1, "{}", output.jsx);
    assert!(output.jsx.contains(r#"role="list""#), "{}", output.jsx);
}

#[test]
fn the_authors_value_is_the_one_that_survives() {
    // Dropping ours rather than theirs. JSX resolves duplicates
    // last-wins and passthrough props are emitted last, so this was
    // already the effective answer -- now it is also the written one.
    let source = "import { List } from '@hozo/core'
export const C = () => <List accessibilityRole=\"menu\">x</List>
";
    let parsed = hozo_parser::parse_tsx(source);
    let output = lower(&parsed.roots[0].node, source, &Theme::default());
    assert!(output.jsx.contains(r#"role="menu""#), "{}", output.jsx);
    assert!(!output.jsx.contains(r#""list""#), "{}", output.jsx);
}

#[test]
fn a_spread_does_not_suppress_the_semantic_prop() {
    // Its contents are not knowable here, and it lands after ours --
    // so if it does carry the prop it still wins, and if it doesn't
    // the element still has its role.
    let source = "import { List } from '@hozo/core'
export const C = (p) => <List {...p}>x</List>
";
    let parsed = hozo_parser::parse_tsx(source);
    let output = lower(&parsed.roots[0].node, source, &Theme::default());
    assert!(
        output.jsx.contains(r#"accessibilityRole="list""#),
        "{}",
        output.jsx
    );
}

#[test]
fn a_dialog_is_lowered_with_its_styles_and_its_two_diagnostics() {
    // A primitive rather than a component the compiler walks past:
    // otherwise its className never compiles and neither of these
    // checks ever runs. The behaviour itself is `@hozo/a11y`'s.
    let source = r#"
            import { Dialog, Text } from '@hozo/core'
            const el = (
              <Dialog className="p-6" open={showing} onClose={dismiss} accessibilityLabel="Confirm">
                <Text>Delete?</Text>
              </Dialog>
            )
            "#;
    let parsed = hozo_parser::parse_tsx(source);
    let output = lower(&parsed.roots[0].node, source, &Theme::default());
    assert!(output.diagnostics.is_empty(), "{:?}", output.diagnostics);
    assert!(
        output.jsx.contains("<HozoDialog style={hozoStyles.hozo0}"),
        "{}",
        output.jsx
    );
    assert!(output.jsx.contains("open={showing}"), "{}", output.jsx);
    assert!(
        output.runtime_imports.contains(&"HozoDialog"),
        "{:?}",
        output.runtime_imports
    );
    assert!(
        output.styles.contains("paddingTop: 24,"),
        "{}",
        output.styles
    );
}

#[test]
fn a_dialog_with_no_way_out_is_diagnosed() {
    // The one part of §10.3's quality bar a compiler can see: focus
    // trapping and restoration are behaviours, but "there is no
    // onClose" is a missing prop -- and without it Escape and the
    // Android back button both do nothing.
    let source = r#"
            import { Dialog } from '@hozo/core'
            const el = <Dialog open={showing} accessibilityLabel="Confirm" />
            "#;
    let parsed = hozo_parser::parse_tsx(source);
    let output = lower(&parsed.roots[0].node, source, &Theme::default());
    assert_eq!(output.diagnostics.len(), 1, "{:?}", output.diagnostics);
    assert_eq!(
        output.diagnostics[0].code,
        DiagnosticCode::A11yDialogWithoutDismiss
    );
    assert!(
        output.diagnostics[0].message.contains("trap"),
        "{}",
        output.diagnostics[0].message
    );
}

#[test]
fn a_text_input_without_an_accessible_name_is_diagnosed() {
    // The whole reason `TextInput` was added with a rule attached: a
    // placeholder reads like a label and isn't one.
    let source = r#"
            import { TextInput } from '@hozo/core'
            const el = <TextInput placeholder="you@example.com" />
            "#;
    let parsed = hozo_parser::parse_tsx(source);
    let output = lower(&parsed.roots[0].node, source, &Theme::default());
    let warning = output
        .diagnostics
        .iter()
        .find(|d| d.code == DiagnosticCode::A11yMissingAccessibleName)
        .expect("a nameless field must be diagnosed");
    assert!(
        warning.message.contains("placeholder is not a"),
        "{}",
        warning.message
    );

    // ...and the label, however it was spelled in source, is written
    // under React Native's name for it.
    let named = r#"
            import { TextInput } from '@hozo/core'
            const el = <TextInput aria-label="Email" />
            "#;
    let parsed = hozo_parser::parse_tsx(named);
    let output = lower(&parsed.roots[0].node, named, &Theme::default());
    assert!(output.diagnostics.is_empty(), "{:?}", output.diagnostics);
    assert!(
        output.jsx.contains(r#"accessibilityLabel={"Email"}"#),
        "{}",
        output.jsx
    );
}

#[test]
fn interactive_pressable_without_role_is_diagnosed_from_real_source() {
    // As with hozo_web: previously only reachable by hand-constructing
    // a `Node` -- the parser didn't populate on_press/accessibility_role
    // at all until hozo_parser::jsx gained that attribute parsing.
    let source = r#"
            import { Pressable } from '@hozo/core'
            const el = <Pressable onPress={handleTap}>Tap</Pressable>
            "#;
    let parsed = hozo_parser::parse_tsx(source);
    let output = lower(&parsed.roots[0].node, source, &Theme::default());
    assert_eq!(output.diagnostics.len(), 1);
    assert_eq!(
        output.diagnostics[0].code,
        hozo_ir::DiagnosticCode::A11yInteractiveWithoutRole
    );
    assert!(output.jsx.contains("onPress={handleTap}"));

    let source_with_role = r#"
            import { Pressable } from '@hozo/core'
            const el = (
              <Pressable onPress={handleTap} accessibilityRole="button">Tap</Pressable>
            )
            "#;
    let parsed_with_role = hozo_parser::parse_tsx(source_with_role);
    let output_with_role = lower(
        &parsed_with_role.roots[0].node,
        source_with_role,
        &Theme::default(),
    );
    assert!(output_with_role.diagnostics.is_empty());
    assert!(output_with_role.jsx.contains(r#"role="button""#));
}

#[test]
fn semantic_primitives_lower_to_native_text_and_view() {
    let source = r#"
            import { Section, Heading, Paragraph } from '@hozo/core'
            const el = <Section><Heading level={2}>Title</Heading><Paragraph>Body</Paragraph></Section>
            "#;
    let parsed = hozo_parser::parse_tsx(source);
    let output = lower(&parsed.roots[0].node, source, &Theme::default());
    assert!(output.diagnostics.is_empty(), "{:?}", output.diagnostics);
    assert_eq!(
        output.jsx,
        "<View><Text accessibilityRole=\"header\">Title</Text><Text>Body</Text></View>"
    );
}

#[test]
fn article_and_navigation_keep_roles_on_native() {
    let source = r#"
            import { Article, Nav, Heading } from '@hozo/core'
            const el = <Article><Heading>Title</Heading><Nav accessibilityLabel="Primary" /></Article>
            "#;
    let parsed = hozo_parser::parse_tsx(source);
    let output = lower(&parsed.roots[0].node, source, &Theme::default());
    assert_eq!(
            output.jsx,
            "<View role=\"article\"><Text accessibilityRole=\"header\">Title</Text><View role=\"navigation\" accessibilityLabel={\"Primary\"}></View></View>"
        );
}

#[test]
fn landmark_primitives_lower_to_native_views_with_roles() {
    let source = r#"
            import { Main, Header, Footer, Aside, Search, Figure, Figcaption, Time, Address } from '@hozo/core'
            const el = (
                <Main>
                    <Header>Banner</Header>
                    <Aside>Sidebar</Aside>
                    <Search>Search</Search>
                    <Figure>
                        <Figcaption>Caption</Figcaption>
                    </Figure>
                    <Time>2026-09-02</Time>
                    <Address>Location</Address>
                    <Footer>Footer</Footer>
                </Main>
            )
            "#;
    let parsed = hozo_parser::parse_tsx(source);
    let output = lower(&parsed.roots[0].node, source, &Theme::default());
    assert!(output.diagnostics.is_empty(), "{:?}", output.diagnostics);
    assert!(output.jsx.contains("<View role=\"main\">"));
    assert!(output.jsx.contains("<View role=\"banner\"><Text>Banner</Text></View>"));
    assert!(output.jsx.contains("<View role=\"complementary\"><Text>Sidebar</Text></View>"));
    assert!(output.jsx.contains("<View role=\"search\"><Text>Search</Text></View>"));
    assert!(output.jsx.contains("<View role=\"figure\"><Text>Caption</Text></View>"));
    assert!(output.jsx.contains("<Text>2026-09-02</Text>"));
    assert!(output.jsx.contains("<View><Text>Location</Text></View>"));
    assert!(output.jsx.contains("<View role=\"contentinfo\"><Text>Footer</Text></View>"));
}

#[test]
fn static_list_and_items_keep_native_roles() {
    let source = r#"
            import { List, ListItem } from '@hozo/core'
            const el = <List ordered><ListItem>First</ListItem></List>
            "#;
    let parsed = hozo_parser::parse_tsx(source);
    let output = lower(&parsed.roots[0].node, source, &Theme::default());
    assert_eq!(
        output.jsx,
        "<View accessibilityRole=\"list\"><View role=\"listitem\"><Text>First</Text></View></View>"
    );
}
