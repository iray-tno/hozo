use super::*;
use hozo_ir::{Child, Primitive};

#[test]
fn filename_selects_grammar_without_retrying_invalid_tsx_as_ts() {
    let parse_file = |source, file| parse_module_for_file(source, None, None, &[], Some(file));
    let generic = "export const identity = async <T>(value: T): Promise<T> => value";
    assert!(parse_file(generic, "sheet.ts").syntax_errors.is_empty());
    assert!(!parse_file(generic, "sheet.tsx").syntax_errors.is_empty());
    assert!(!parse_tsx(generic).syntax_errors.is_empty());
    for file in ["Card.js", "Card.jsx", "Card.mjs"] {
        assert!(
            parse_file("export const Card = () => <View />", file)
                .syntax_errors
                .is_empty(),
            "{file}"
        );
        assert!(
            !parse_file("export const value: number = 1", file)
                .syntax_errors
                .is_empty(),
            "{file}"
        );
    }
    assert!(parse_file(
        "export const identity = <T,>(value: T) => value",
        "sheet.mts"
    )
    .syntax_errors
    .is_empty());
    assert!(!parse_file("export const Card = () => <View />", "Card.ts")
        .syntax_errors
        .is_empty());
}

#[test]
fn syntax_errors_survive_without_lowerable_roots() {
    let parsed = super::parse_tsx("export const value = <");
    assert!(parsed.roots.is_empty());
    assert!(!parsed.syntax_errors.is_empty());
    assert!(parsed
        .syntax_errors
        .iter()
        .all(|error| !error.message.is_empty()));
    assert!(super::parse_tsx("export const value = 1")
        .syntax_errors
        .is_empty());
}

#[test]
fn stylex_module_summary_names_export_aliases_and_rule_kinds() {
    let source = r#"
            import type { Token } from '@types'
            import * as stylex from '@stylexjs/stylex'
            import { firstThatWorks } from '@stylexjs/stylex'
            const styles = stylex.create({
              base: { padding: 8 },
              dynamic: (opacity) => ({ opacity }),
              mixed: { color: 'red', touchAction: 'pan-x' },
              unsupported: { transform: 'translateX(calc(100% - 2px))' },
            })
            export { styles as cardStyles }
            "#;
    let summary = summarize_stylex_module(source);
    assert_eq!(summary.imports, vec!["@stylexjs/stylex".to_string()]);
    assert_eq!(summary.exports.len(), 1);
    let sheet = &summary.exports[0];
    assert_eq!(sheet.exported, "cardStyles");
    assert_eq!(sheet.local, "styles");
    assert_eq!(sheet.kind, StylexModuleExportKind::Sheet);
    assert_eq!(
        sheet
            .members
            .iter()
            .map(|member| (member.name.as_str(), member.status))
            .collect::<Vec<_>>(),
        vec![
            ("base", StylexModuleMemberStatus::Static),
            ("dynamic", StylexModuleMemberStatus::Function),
            ("mixed", StylexModuleMemberStatus::Partial),
            ("unsupported", StylexModuleMemberStatus::Unsupported),
        ]
    );
}

#[test]
fn stylex_module_summary_keeps_exported_variables_themeable() {
    let source = r#"
            import * as stylex from '@stylexjs/stylex'
            export const tokens = stylex.defineVars({ accent: '#123456', space: 8 })
            const local = stylex.create({ root: { padding: 8 } })
            "#;
    let summary = summarize_stylex_module(source);
    assert_eq!(
        summary.exports.len(),
        1,
        "a private sheet is not a graph export"
    );
    let variables = &summary.exports[0];
    assert_eq!(variables.exported, "tokens");
    assert_eq!(variables.kind, StylexModuleExportKind::Variables);
    assert_eq!(
        variables
            .members
            .iter()
            .map(|member| member.name.as_str())
            .collect::<Vec<_>>(),
        vec!["accent", "space"]
    );
}

#[test]
fn stylex_module_summary_records_named_star_and_namespace_reexports() {
    let summary = summarize_stylex_module(
        r#"
            export { styles as cardStyles } from './styles'
            export * from './more-styles'
            export * as theme from './theme'
            "#,
    );
    assert!(summary.exports.is_empty());
    assert_eq!(
        summary.reexports,
        vec![
            StylexModuleReexportSummary {
                specifier: "./more-styles".to_string(),
                imported: "*".to_string(),
                exported: "*".to_string(),
            },
            StylexModuleReexportSummary {
                specifier: "./styles".to_string(),
                imported: "styles".to_string(),
                exported: "cardStyles".to_string(),
            },
            StylexModuleReexportSummary {
                specifier: "./theme".to_string(),
                imported: "*".to_string(),
                exported: "theme".to_string(),
            },
        ]
    );
}

/// Unwraps a child that should be a Hozo primitive.
fn node(child: &Child) -> &hozo_ir::Node {
    match child {
        Child::Node(node) => node,
        other => panic!("expected a primitive, got {other:?}"),
    }
}

#[test]
fn a_component_the_compiler_does_not_model_is_a_boundary_not_a_wall() {
    // `<Card><View/></Card>` compiled to nothing at all. The outermost
    // element is someone else's component, so no root was collected --
    // and the walk stopped there rather than looking inside, so every
    // primitive under any wrapper the author wrote fell back to the
    // runtime components with no diagnostic. Passing children into
    // your own component is ordinary React.
    let source = r#"
            import { View, Text } from '@hozo/core'
            import { Card, Panel } from 'some-lib'
            const el = (
              <Card>
                <Panel><View className="p-4"><Text>deep</Text></View></Panel>
                <View className="p-8">sibling</View>
              </Card>
            )
            "#;
    let parsed = parse_tsx(source);
    // One root per primitive found, however deep the wrappers went.
    assert_eq!(parsed.roots.len(), 2);
    assert_eq!(parsed.roots[0].node.primitive, Primitive::View);
    assert_eq!(parsed.roots[1].node.primitive, Primitive::View);
    // And the tree under each is still built, not flattened.
    assert_eq!(
        node(&parsed.roots[0].node.children[0]).primitive,
        Primitive::Text
    );
}

#[test]
fn a_primitive_under_a_known_root_is_not_collected_twice() {
    // The other half of the same branch: when a node *was* built, its
    // children came with it, so walking again would collect them a
    // second time and splice the same span twice.
    let source = r#"
            import { View, Text } from '@hozo/core'
            const el = <View className="p-4"><Text>once</Text></View>
            "#;
    let parsed = parse_tsx(source);
    assert_eq!(parsed.roots.len(), 1);
    assert_eq!(
        node(&parsed.roots[0].node.children[0]).primitive,
        Primitive::Text
    );
}

const LOGIN_EXAMPLE: &str = r#"
import { View, Text, Button } from '@hozo/core'

export function Login() {
  return (
    <View className="flex-1 items-center justify-center p-6">
      <Text className="text-xl font-bold">
        Welcome
      </Text>

      <Button className="mt-4 px-4 py-2">
        Continue
      </Button>
    </View>
  )
}
"#;

#[test]
fn parses_login_example_into_a_node_tree() {
    let output = parse_tsx(LOGIN_EXAMPLE);
    assert_eq!(output.roots.len(), 1);

    let root = &output.roots[0].node;
    assert_eq!(root.primitive, Primitive::View);
    assert_eq!(root.children.len(), 2);
    assert!(!root.style.is_empty());

    let text = node(&root.children[0]);
    assert_eq!(text.primitive, Primitive::Text);
    assert_eq!(text.children, vec![Child::Text("Welcome".to_string())]);

    let button = node(&root.children[1]);
    assert_eq!(button.primitive, Primitive::Button);
    assert_eq!(button.children, vec![Child::Text("Continue".to_string())]);
}

#[test]
fn children_the_compiler_does_not_model_are_carried_not_dropped() {
    // Until 2026-08-15 every one of these vanished from the output with
    // no diagnostic: `children` could only hold Hozo primitives, so
    // anything else had nowhere to go.
    let source = r#"
            import { View, Text } from '@hozo/core'
            export function C({ show, items, name }) {
              return (
                <View>
                  <ProfilePicture />
                  {show && <Text>hi</Text>}
                  {items.map((i) => <Text key={i}>{i}</Text>)}
                  <Text>Hello {name}</Text>
                </View>
              )
            }
            "#;
    let output = parse_tsx(source);
    let root = &output.roots[0].node;

    let verbatim: Vec<&str> = root
        .children
        .iter()
        .filter_map(|child| match child {
            Child::Verbatim { source: r, .. } => {
                Some(&source[r.0.start as usize..r.0.end as usize])
            }
            _ => None,
        })
        .collect();
    assert_eq!(verbatim.len(), 3, "{:?}", root.children);
    assert_eq!(verbatim[0], "<ProfilePicture />");
    assert!(verbatim[1].starts_with("{show &&"), "{}", verbatim[1]);
    assert!(verbatim[2].starts_with("{items.map"), "{}", verbatim[2]);

    // Mixed text and expression keeps both, in order -- `<Text>Hello
    // {name}</Text>` is not `<Text>{name} Hello</Text>`.
    let last = node(root.children.last().unwrap());
    assert_eq!(last.children.len(), 2);
    // The trailing space is significant -- `Hello {name}` is not
    // `Hello{name}`. Only whitespace containing a newline is dropped.
    assert_eq!(last.children[0], Child::Text("Hello ".to_string()));
    assert!(matches!(last.children[1], Child::Verbatim { .. }));
}

#[test]
fn jsx_whitespace_rules_are_followed_not_trimmed() {
    // Whitespace containing a newline goes (that is what makes
    // indented markup work); whitespace inside a line stays (that is
    // what keeps `Hello {name}` from becoming `Hello{name}`).
    let source = r#"
            import { Text } from '@hozo/core'
            export function C({ name }) {
              return (
                <Text>
                  Hello {name}, welcome
                </Text>
              )
            }
            "#;
    let root = &parse_tsx(source).roots[0].node;
    assert_eq!(root.children[0], Child::Text("Hello ".to_string()));
    assert_eq!(root.children[2], Child::Text(", welcome".to_string()));
}

#[test]
fn whitespace_between_tags_is_not_a_child() {
    // JSX collapses it away, so recording it would give every indented
    // element empty text siblings.
    let output = parse_tsx(LOGIN_EXAMPLE);
    assert_eq!(output.roots[0].node.children.len(), 2);
}

/// The slot is where a generated `const x = useSomething()` can be
/// spliced. A statement is the only safe position: calling a hook
/// inline in the JSX breaks the rules of hooks the moment the element
/// sits behind a conditional.
#[test]
fn a_function_component_offers_a_hook_slot_just_inside_its_brace() {
    let output = parse_tsx(LOGIN_EXAMPLE);
    let slot = output.roots[0].hook_slot.expect("Login() has a block body");
    assert_eq!(&LOGIN_EXAMPLE[slot as usize - 1..slot as usize], "{");
}

#[test]
fn a_block_bodied_arrow_offers_one_too() {
    let source = "import { View } from '@hozo/core'\n\
                      export const Card = () => { return <View /> }\n";
    let output = parse_tsx(source);
    let slot = output.roots[0].hook_slot.expect("block-bodied arrow");
    assert_eq!(&source[slot as usize - 1..slot as usize], "{");
}

#[test]
fn jsx_with_nowhere_to_put_a_statement_has_no_slot() {
    // A concise arrow body is an expression, and module scope has no
    // enclosing function at all. Neither can hold a hook declaration,
    // so conditions that need one must be refused rather than compiled
    // into something invalid.
    for source in [
        "import { View } from '@hozo/core'\nexport const Card = () => <View />\n",
        "import { View } from '@hozo/core'\nconst el = <View />\n",
    ] {
        let output = parse_tsx(source);
        assert_eq!(output.roots[0].hook_slot, None, "{source}");
    }
}

#[test]
fn a_class_components_render_has_no_slot() {
    // A hook in a class's `render()` -- method or arrow field -- is an
    // invalid hook call on every render (#1183). A function component
    // written inside one still has its own.
    for source in [
            "import { Text } from '@hozo/core'\nclass C extends Component {\n  render() {\n    return <Text className=\"dark:text-white\">x</Text>\n  }\n}\n",
            "import { Text } from '@hozo/core'\nclass C extends Component {\n  render = () => {\n    return <Text className=\"dark:text-white\">x</Text>\n  }\n}\n",
        ] {
            let output = parse_tsx(source);
            assert_eq!(output.roots[0].hook_slot, None, "{source}");
        }
    let nested = "import { Text } from '@hozo/core'\nclass C extends Component {\n  render() {\n    function Inner() { return <Text>x</Text> }\n    return <Inner />\n  }\n}\n";
    assert!(parse_tsx(nested).roots[0].hook_slot.is_some(), "{nested}");
}

#[test]
fn a_nested_function_shadows_its_parent() {
    // The hook belongs to the function that actually renders the JSX,
    // not to whatever encloses it.
    let source = "import { View } from '@hozo/core'\n\
                      export function Outer() {\n\
                      \x20 function Inner() { return <View /> }\n\
                      \x20 return Inner\n\
                      }\n";
    let output = parse_tsx(source);
    let slot = output.roots[0].hook_slot.expect("Inner has a block body");
    let inner_brace = source.find("Inner() {").unwrap() + "Inner() {".len();
    assert_eq!(slot as usize, inner_brace);
}

#[test]
fn jsx_text_entities_become_the_characters_they_name() {
    // `&lt;` in a JSX child is the character `<`; that is why an
    // author writes it. Re-emitting the text as a string literal skipped
    // the step JSX would have taken, and the page rendered "a semantic
    // &lt;article&gt; element" with the entities showing.
    let root =
        &parse_tsx(r#"export const A = () => <View>a semantic &lt;article&gt; element</View>;"#)
            .roots[0]
            .node;
    assert_eq!(
        root.children,
        vec![Child::Text("a semantic <article> element".to_string())]
    );
}

#[test]
fn a_bare_ampersand_is_left_alone() {
    // Which is why this went unnoticed: the one character an author is
    // most likely to type raw was always correct.
    let root =
        &parse_tsx(r#"export const A = () => <View>Ordered & Unordered</View>;"#).roots[0].node;
    assert_eq!(
        root.children,
        vec![Child::Text("Ordered & Unordered".to_string())]
    );
}

#[test]
fn numeric_and_unknown_references_follow_the_same_table() {
    // Decimal, hex, a non-breaking space, and a name nothing defines --
    // the last stays exactly as written, which is the rule that comes
    // with the table rather than one chosen here.
    let root =
        &parse_tsx(r#"export const A = () => <View>&#60;&#x3E;&nbsp;&notarealentity;</View>;"#)
            .roots[0]
            .node;
    assert_eq!(
        root.children,
        vec![Child::Text("<>\u{00A0}&notarealentity;".to_string())]
    );
}

#[test]
fn references_resolve_after_whitespace_is_trimmed_not_before() {
    // JSX trims literal whitespace and only then resolves references, so
    // `&#32;` is a space that survives the trim. Decoding first would
    // have eaten it.
    let root = &parse_tsx("export const A = () => <View>\n  a&#32;\n</View>;").roots[0].node;
    assert_eq!(root.children, vec![Child::Text("a ".to_string())]);
}
