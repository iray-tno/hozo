//! Static StyleX frontend.
//!
//! This reads one useful vertical slice rather than impersonating the full
//! StyleX compiler: project-registered and same-file `stylex.create({ ... })`,
//! local unthemeable `stylex.defineVars`, statically called function styles,
//! and `stylex.props(styles.base, condition && styles.active)`. Values become the
//! typed `StyleProperty` variants the Tailwind frontend already produces, so
//! the Web and Native lowerings remain shared.

use std::collections::{HashMap, HashSet};

use hozo_ir::{
    Angle, BorderStyle, Color, Condition, ConditionExpr, Dimension, Edge, Environment, ExprRef,
    FlexDirection, FontWeight, GridLine, GridSpan, GridTracks, Justify, Keyframe, Keyframes, Length, Origin,
    Overflow, Radius, Scale, SourceSpan, StyleDeclaration, StyleProperty, StylexResidual,
    StylexResidualArgument,
    TextOverflow, TextShadowValue, TransformFunction, WhiteSpace,
};
use oxc_ast::ast::{
    Argument, ArrayExpressionElement, ArrowFunctionExpression, BindingPattern, CallExpression,
    Expression, Function, IdentifierReference, LogicalOperator, ObjectExpression,
    ObjectPropertyKind, PropertyKey, Statement, StaticMemberExpression, VariableDeclarationKind,
    VariableDeclarator,
};
use oxc_ast_visit::{
    walk::{
        walk_arrow_function_expression, walk_function, walk_object_expression,
        walk_static_member_expression, walk_variable_declarator,
    },
    Visit,
};
use oxc_span::{GetSpan, Span};
use oxc_syntax::module_record::{
    ExportExportName, ExportImportName, ImportImportName, ModuleRecord,
};
use oxc_syntax::scope::ScopeFlags;

use crate::tailwind;

const STYLEX_MODULE: &str = "@stylexjs/stylex";

#[derive(Debug, Clone)]
pub(crate) struct Gap {
    pub(crate) message: String,
    pub(crate) span: SourceSpan,
}

#[derive(Debug, Clone)]
enum Rule {
    Ready {
        entries: Vec<Entry>,
        residual: Vec<ResidualProperty>,
        gaps: Vec<Gap>,
    },
    Function {
        entries: Vec<FunctionEntry>,
    },
    Gap(Gap),
}

/// The project-wide fact one exported StyleX binding contributes.
///
/// Deliberately owns names rather than AST nodes. A bundler can cache this
/// after the parser allocator is gone, then key the next slice's parsed-rule
/// cache by the defining source's content hash without retaining a source
/// tree per consumer.
#[derive(Debug, Clone, Eq, PartialEq)]
pub struct ModuleExportSummary {
    pub exported: String,
    pub local: String,
    pub kind: ModuleExportKind,
    pub members: Vec<ModuleMemberSummary>,
}

#[derive(Debug, Clone, Copy, Eq, PartialEq)]
pub enum ModuleExportKind {
    Sheet,
    Variables,
}

#[derive(Debug, Clone, Eq, PartialEq)]
pub struct ModuleMemberSummary {
    pub name: String,
    pub status: ModuleMemberStatus,
}

#[derive(Debug, Clone, Copy, Eq, PartialEq)]
pub enum ModuleMemberStatus {
    /// Fully represented by Hozo's typed Style IR.
    Static,
    /// Has both typed declarations and declarations the official transform owns.
    Partial,
    /// A one-argument static function style.
    Function,
    /// The definition was recognised, but cannot be lowered safely.
    Unsupported,
}

#[derive(Debug, Clone, Default, Eq, PartialEq)]
pub struct ModuleSummary {
    pub exports: Vec<ModuleExportSummary>,
    pub reexports: Vec<ModuleReexportSummary>,
    pub imports: Vec<String>,
}

#[derive(Debug, Clone, Eq, PartialEq)]
pub struct ModuleReexportSummary {
    pub specifier: String,
    /// Export name in the target module, or `*` for star/namespace exports.
    pub imported: String,
    /// Name exposed by this module, or `*` only for a plain `export *`.
    pub exported: String,
}

/// One imported StyleX binding resolved by the bundler's project graph.
#[derive(Debug, Clone, Eq, PartialEq)]
pub struct ExternalBinding {
    pub specifier: String,
    pub module_id: String,
}

pub struct ModuleSource {
    pub id: String,
    pub content_hash: String,
    pub source: String,
    pub links: Vec<ExternalBinding>,
}

#[derive(Clone)]
struct RegisteredReexport {
    module_id: String,
    imported: String,
    exported: String,
}

struct RegisteredModule {
    content_hash: String,
    links: Vec<ExternalBinding>,
    own_sheets: HashMap<String, HashMap<String, Rule>>,
    sheets: HashMap<String, HashMap<String, Rule>>,
    reexports: Vec<RegisteredReexport>,
}

/// Parsed exported sheets shared by every compilation in one project.
///
/// The bundler remains responsible for filesystem resolution. This layer
/// owns the expensive source parse and the typed rules, keyed by the source
/// hash already maintained by the project scan.
#[derive(Default)]
pub struct ModuleRegistry {
    modules: HashMap<String, RegisteredModule>,
}

impl ModuleRegistry {
    pub fn replace(&mut self, modules: &[ModuleSource]) {
        let retained = modules.iter().map(|module| module.id.clone()).collect::<HashSet<_>>();
        self.modules.retain(|id, _| retained.contains(id));
        for module in modules {
            if self.modules.get(&module.id).is_some_and(|registered| {
                registered.content_hash == module.content_hash && registered.links == module.links
            }) {
                continue;
            }
            let allocator = oxc_allocator::Allocator::default();
            let source_type = oxc_span::SourceType::from_extension("tsx")
                .expect("\"tsx\" is a known extension");
            let parsed = oxc_parser::Parser::new(&allocator, &module.source, source_type).parse();
            let frontend = Frontend::collect(&parsed.program, &parsed.module_record);
            let own_sheets = frontend.exported_static_sheets(&parsed.module_record);
            let reexports = frontend
                .module_summary(&parsed.program, &parsed.module_record)
                .reexports
                .into_iter()
                .filter_map(|reexport| {
                    let module_id = module
                        .links
                        .iter()
                        .find(|link| link.specifier == reexport.specifier)?
                        .module_id
                        .clone();
                    Some(RegisteredReexport {
                        module_id,
                        imported: reexport.imported,
                        exported: reexport.exported,
                    })
                })
                .collect();
            self.modules.insert(
                module.id.clone(),
                RegisteredModule {
                    content_hash: module.content_hash.clone(),
                    links: module.links.clone(),
                    sheets: own_sheets.clone(),
                    own_sheets,
                    reexports,
                },
            );
        }
        self.resolve_reexports();
    }

    fn resolve_reexports(&mut self) {
        // One pass can move a sheet across one edge. Repeating once per
        // module settles every acyclic chain; cycles remain bounded and
        // contribute only facts that enter them from a real definition.
        for _ in 0..self.modules.len() {
            let previous = self
                .modules
                .iter()
                .map(|(id, module)| (id.clone(), module.sheets.clone()))
                .collect::<HashMap<_, _>>();
            for module in self.modules.values_mut() {
                let mut sheets = module.own_sheets.clone();
                // Stars are the weakest edge: a local or explicit export
                // with the same name wins regardless of traversal order.
                // Two stars supplying the same name are ambiguous in ESM;
                // decline them instead of picking whichever HashMap entry
                // happened to be visited first.
                let mut star_sheets: HashMap<String, (String, HashMap<String, Rule>)> =
                    HashMap::new();
                let mut ambiguous = HashSet::new();
                for reexport in module
                    .reexports
                    .iter()
                    .filter(|edge| edge.imported == "*" && edge.exported == "*")
                {
                    let Some(target) = previous.get(&reexport.module_id) else {
                        continue;
                    };
                    for (name, rules) in target {
                        if name == "default" || sheets.contains_key(name) {
                            continue;
                        }
                        if let Some((first_module, _)) = star_sheets.get(name) {
                            if first_module != &reexport.module_id {
                                ambiguous.insert(name.clone());
                            }
                        } else {
                            star_sheets.insert(
                                name.clone(),
                                (reexport.module_id.clone(), rules.clone()),
                            );
                        }
                    }
                }
                for (name, (_, rules)) in star_sheets {
                    if !ambiguous.contains(&name) {
                        sheets.insert(name, rules);
                    }
                }
                for reexport in module
                    .reexports
                    .iter()
                    .filter(|edge| edge.imported == "*" && edge.exported != "*")
                {
                    let Some(target) = previous.get(&reexport.module_id) else {
                        continue;
                    };
                    for (name, rules) in target {
                        sheets.insert(format!("{}.{}", reexport.exported, name), rules.clone());
                    }
                }
                for reexport in module.reexports.iter().filter(|edge| edge.imported != "*") {
                    let Some(target) = previous.get(&reexport.module_id) else {
                        continue;
                    };
                    if let Some(rules) = target.get(&reexport.imported) {
                        sheets.insert(reexport.exported.clone(), rules.clone());
                        continue;
                    }
                    let prefix = format!("{}.", reexport.imported);
                    for (name, rules) in target
                        .iter()
                        .filter(|(name, _)| name.starts_with(&prefix))
                    {
                        sheets.insert(
                            format!("{}.{}", reexport.exported, &name[prefix.len()..]),
                            rules.clone(),
                        );
                    }
                }
                module.sheets = sheets;
            }
        }
    }

    pub(crate) fn attach(
        &self,
        frontend: &mut Frontend,
        module_record: &ModuleRecord,
        bindings: &[ExternalBinding],
    ) {
        for binding in bindings {
            let Some(module) = self.modules.get(&binding.module_id) else {
                continue;
            };
            for entry in module_record.import_entries.iter().filter(|entry| {
                !entry.is_type && entry.module_request.name.as_str() == binding.specifier
            }) {
                if matches!(entry.import_name, ImportImportName::NamespaceObject) {
                    for (exported, rules) in &module.sheets {
                        frontend.sheets.insert(
                            format!("{}.{}", entry.local_name.name, exported),
                            rules.clone(),
                        );
                    }
                    continue;
                }
                let imported = match &entry.import_name {
                    ImportImportName::Name(name) => name.name.as_str(),
                    ImportImportName::Default(_) => "default",
                    ImportImportName::NamespaceObject => unreachable!(),
                };
                let Some(rules) = module.sheets.get(imported) else {
                    let prefix = format!("{imported}.");
                    for (exported, rules) in module
                        .sheets
                        .iter()
                        .filter(|(exported, _)| exported.starts_with(&prefix))
                    {
                        frontend.sheets.insert(
                            format!("{}.{}", entry.local_name.name, &exported[prefix.len()..]),
                            rules.clone(),
                        );
                    }
                    continue;
                };
                frontend.sheets.insert(entry.local_name.name.to_string(), rules.clone());
            }
        }
    }
}

#[derive(Debug, Clone)]
struct FunctionEntry {
    name: String,
    css_name: String,
    priority: u16,
    value: FunctionValue,
    span: SourceSpan,
}

#[derive(Debug, Clone)]
enum FunctionValue {
    Argument,
    Static(StaticValue),
}

#[derive(Debug, Clone)]
struct ResidualProperty {
    css_name: String,
    span: ExprRef,
}

#[derive(Debug, Clone)]
struct Entry {
    css_name: String,
    priority: u16,
    properties: Vec<StyleProperty>,
    condition: Condition,
    span: SourceSpan,
}

struct ResolvedEntry {
    css_name: String,
    priority: u16,
    declaration: StyleDeclaration,
}

#[derive(Default)]
pub(crate) struct Frontend {
    namespaces: HashSet<String>,
    sheets: HashMap<String, HashMap<String, Rule>>,
    variables: StaticVariables,
    /// StyleX definitions are not Tailwind candidate strings. The fallback
    /// scanner is intentionally broad, so it needs these exact ranges to
    /// avoid turning values such as `display: 'flex'` into duplicate CSS.
    pub(crate) scan_spans: Vec<SourceSpan>,
}

pub(crate) enum Resolution {
    NotStylex,
    Ready(Vec<StyleDeclaration>),
    Partial {
        declarations: Vec<StyleDeclaration>,
        residual: StylexResidual,
        gaps: Vec<Gap>,
    },
    Gap { message: String, span: SourceSpan },
}

fn source_span(span: Span) -> SourceSpan {
    SourceSpan {
        start: span.start,
        end: span.end,
    }
}

fn static_key(key: &PropertyKey) -> Option<String> {
    match key {
        PropertyKey::StaticIdentifier(identifier) => Some(identifier.name.to_string()),
        PropertyKey::StringLiteral(literal) => Some(literal.value.to_string()),
        _ => None,
    }
}

fn static_member_path(expression: &Expression) -> Option<String> {
    match expression {
        Expression::Identifier(identifier) => Some(identifier.name.to_string()),
        Expression::StaticMemberExpression(member) => {
            let mut path = static_member_path(&member.object)?;
            path.push('.');
            path.push_str(member.property.name.as_str());
            Some(path)
        }
        _ => None,
    }
}

fn numeric_text(value: f64) -> String {
    if value.fract() == 0.0 {
        format!("{value:.0}")
    } else {
        value.to_string()
    }
}

#[derive(Debug, Clone)]
enum StaticValue {
    String(String),
    Number(f64),
}

type StaticVariables = HashMap<String, HashMap<String, StaticValue>>;

fn resolved_static_value(
    expression: &Expression,
    variables: &StaticVariables,
) -> Option<StaticValue> {
    if let Some(value) = static_value(expression) {
        return Some(value);
    }
    let Expression::StaticMemberExpression(member) = expression else {
        return None;
    };
    let Expression::Identifier(object) = &member.object else {
        return None;
    };
    variables
        .get(object.name.as_str())?
        .get(member.property.name.as_str())
        .cloned()
}

fn static_value(expression: &Expression) -> Option<StaticValue> {
    match expression {
        Expression::StringLiteral(literal) => Some(StaticValue::String(literal.value.to_string())),
        Expression::NumericLiteral(literal) => Some(StaticValue::Number(literal.value)),
        Expression::UnaryExpression(unary)
            if unary.operator == oxc_syntax::operator::UnaryOperator::UnaryNegation =>
        {
            match &unary.argument {
                Expression::NumericLiteral(literal) => Some(StaticValue::Number(-literal.value)),
                _ => None,
            }
        }
        _ => None,
    }
}

fn first_that_works_call<'a>(
    expression: &'a Expression<'a>,
    namespaces: &HashSet<String>,
) -> Option<&'a CallExpression<'a>> {
    let Expression::CallExpression(call) = expression else {
        return None;
    };
    let Expression::StaticMemberExpression(member) = &call.callee else {
        return None;
    };
    let Expression::Identifier(object) = &member.object else {
        return None;
    };
    (member.property.name.as_str() == "firstThatWorks"
        && namespaces.contains(object.name.as_str()))
    .then_some(call)
}

fn raw_value(value: &StaticValue) -> String {
    match value {
        StaticValue::String(value) => value.clone(),
        StaticValue::Number(value) => numeric_text(*value),
    }
}

fn length_value(value: &StaticValue) -> String {
    match value {
        StaticValue::String(value) => value.clone(),
        StaticValue::Number(value) => format!("{}px", numeric_text(*value)),
    }
}

fn px_length(value: &StaticValue) -> Option<Length> {
    match value {
        StaticValue::Number(value) => Some(Length::Px(*value)),
        StaticValue::String(value) if value == "0" => Some(Length::Px(0.0)),
        StaticValue::String(value) => value
            .strip_suffix("px")
            .and_then(|value| value.parse::<f64>().ok())
            .map(Length::Px),
    }
}

fn dimension(value: &StaticValue) -> Option<Dimension> {
    match value {
        StaticValue::Number(value) => Some(Dimension::Length(Length::Px(*value))),
        StaticValue::String(value) if value == "auto" => Some(Dimension::Auto),
        StaticValue::String(value) => value
            .strip_suffix('%')
            .and_then(|value| value.parse::<f64>().ok())
            .map(Dimension::Percent)
            .or_else(|| {
                if value == "0" {
                    return Some(Dimension::Length(Length::Px(0.0)));
                }
                value
                    .strip_suffix("px")
                    .and_then(|value| value.parse::<f64>().ok())
                    .map(|value| Dimension::Length(Length::Px(value)))
            }),
    }
}

fn css_color(value: &StaticValue) -> Option<Color> {
    let StaticValue::String(value) = value else {
        return None;
    };
    (!value.is_empty() && !value.contains("var(") && !value.contains("env("))
        .then(|| Color::Css(value.clone()))
}

/// One container name the Native runtime can register under its context.
///
/// CSS accepts a whitespace-separated list of custom identifiers, but the
/// existing Hozo container runtime deliberately has one lookup key. Keep a
/// wider StyleX value with the official transform rather than registering a
/// string no Native query could faithfully address.
fn stylex_container_name(value: &StaticValue) -> Option<String> {
    let StaticValue::String(value) = value else {
        return None;
    };
    let mut bytes = value.bytes();
    match bytes.next()? {
        first if first.is_ascii_alphabetic() || first == b'_' => {}
        b'-' => {
            let second = bytes.next()?;
            if !second.is_ascii_alphabetic() && !matches!(second, b'_' | b'-') {
                return None;
            }
        }
        _ => return None,
    }
    let reserved = value.to_ascii_lowercase();
    if !bytes.all(|character| character.is_ascii_alphanumeric() || matches!(character, b'_' | b'-'))
        || matches!(
            reserved.as_str(),
            "none" | "default" | "initial" | "inherit" | "unset" | "revert" | "revert-layer"
        )
    {
        return None;
    }
    Some(value.clone())
}

fn stylex_container_type(value: &StaticValue) -> Option<&'static str> {
    let StaticValue::String(value) = value else {
        return None;
    };
    match value.as_str() {
        "normal" => Some("normal"),
        "size" => Some("size"),
        "inline-size" => Some("inline-size"),
        _ => None,
    }
}

fn stylex_container(value: &StaticValue) -> Option<Vec<StyleProperty>> {
    let StaticValue::String(value) = value else {
        return None;
    };
    let mut parts = value.split('/');
    let name = parts.next()?.trim();
    let kind = parts.next().map(str::trim).unwrap_or("normal");
    if parts.next().is_some() || name.is_empty() || kind.is_empty() {
        return None;
    }
    let name = stylex_container_name(&StaticValue::String(name.to_string()))?;
    let kind = stylex_container_type(&StaticValue::String(kind.to_string()))?;
    Some(vec![
        StyleProperty::ContainerName(name),
        StyleProperty::Keyword("container-type", kind),
    ])
}

fn stylex_flex_flow(value: &StaticValue) -> Option<Vec<StyleProperty>> {
    let StaticValue::String(value) = value else {
        return None;
    };
    let parts = web_components(value)?;
    if !(1..=2).contains(&parts.len()) {
        return None;
    }
    let mut direction = None;
    let mut wrap = None;
    for part in parts {
        match part.as_str() {
            "row" if direction.is_none() => direction = Some(FlexDirection::Row),
            "row-reverse" => {
                if direction.is_some() {
                    return None;
                }
                direction = Some(FlexDirection::RowReverse);
            }
            "column" if direction.is_none() => direction = Some(FlexDirection::Column),
            "column-reverse" => {
                if direction.is_some() {
                    return None;
                }
                direction = Some(FlexDirection::ColumnReverse);
            }
            "nowrap" | "wrap" | "wrap-reverse" if wrap.is_none() => {
                wrap = Some(match part.as_str() {
                    "nowrap" => "nowrap",
                    "wrap" => "wrap",
                    _ => "wrap-reverse",
                });
            }
            _ => return None,
        }
    }
    Some(vec![
        StyleProperty::FlexDirection(direction.unwrap_or(FlexDirection::Row)),
        StyleProperty::Keyword("flex-wrap", wrap.unwrap_or("nowrap")),
    ])
}

fn stylex_gap(value: &StaticValue) -> Option<Vec<StyleProperty>> {
    let parts = match value {
        StaticValue::Number(_) => vec![value.clone()],
        StaticValue::String(value) => web_components(value)?
            .into_iter()
            .map(StaticValue::String)
            .collect(),
    };
    if !(1..=2).contains(&parts.len()) {
        return None;
    }
    let values = parts.iter().map(px_length).collect::<Option<Vec<_>>>()?;
    if values
        .iter()
        .any(|value| !matches!(value, Length::Px(number) if number.is_finite() && *number >= 0.0))
    {
        return None;
    }
    let row = values[0].clone();
    let column = values.get(1).unwrap_or(&row).clone();
    Some(vec![
        StyleProperty::RowGap(row),
        StyleProperty::ColumnGap(column),
    ])
}

fn stylex_border_style(value: &StaticValue) -> Option<BorderStyle> {
    let StaticValue::String(value) = value else {
        return None;
    };
    match value.as_str() {
        "solid" => Some(BorderStyle::Solid),
        "dashed" => Some(BorderStyle::Dashed),
        "dotted" => Some(BorderStyle::Dotted),
        "double" => Some(BorderStyle::Double),
        "hidden" => Some(BorderStyle::Hidden),
        "none" => Some(BorderStyle::None),
        _ => None,
    }
}

fn stylex_web_border_style(property: &str, value: &StaticValue) -> Option<StyleProperty> {
    stylex_border_style(value)?;
    Some(web_longhand(property, raw_value(value)))
}

fn stylex_border_width(value: &StaticValue) -> Option<Length> {
    let value = px_length(value)?;
    matches!(&value, Length::Px(number) if number.is_finite() && *number >= 0.0).then_some(value)
}

fn normalize_stylex_grid_value(value: &str) -> String {
    let value = value.trim();
    // StyleX removes whitespace around commas inside functions but keeps
    // whitespace between tracks. Match that CSS while accepting the usual
    // authored spelling (`minmax(120px, 2fr) 1fr`).
    let mut normalized = String::new();
    let characters = value.chars().collect::<Vec<_>>();
    let mut index = 0;
    while index < characters.len() {
        let character = characters[index];
        if character.is_whitespace() {
            let previous = normalized.chars().next_back();
            let next = characters[index + 1..]
                .iter()
                .copied()
                .find(|character| !character.is_whitespace());
            if !matches!(previous, Some('(' | ','))
                && !matches!(next, Some(')' | ','))
                && !normalized.ends_with(' ')
            {
                normalized.push(' ');
            }
            index += 1;
            continue;
        }
        normalized.push(character);
        index += 1;
    }
    normalized
}

fn normalize_stylex_number_zeros(value: &str) -> String {
    let characters = value.chars().collect::<Vec<_>>();
    let mut normalized = String::new();
    for (index, character) in characters.iter().copied().enumerate() {
        if character == '0'
            && characters.get(index + 1) == Some(&'.')
            && index
                .checked_sub(1)
                .and_then(|previous| characters.get(previous))
                .is_none_or(|previous| !previous.is_ascii_digit() && *previous != '.')
        {
            continue;
        }
        normalized.push(character);
    }
    normalized
}

fn stylex_grid_tracks(value: &StaticValue) -> Option<GridTracks> {
    let StaticValue::String(value) = value else {
        return None;
    };
    let compact = value
        .chars()
        .filter(|character| !character.is_whitespace())
        .collect::<String>();
    if let Some(inner) = compact
        .strip_prefix("repeat(")
        .and_then(|value| value.strip_suffix(",minmax(0,1fr))"))
    {
        let count = inner.parse::<u32>().ok()?;
        return (count > 0)
            .then(|| GridTracks::Css(format!("repeat({count},minmax(0,1fr))")));
    }

    let normalized = normalize_stylex_grid_value(value);
    let valid = normalized.split_whitespace().all(|track| {
        if let Some(inner) = track
            .strip_prefix("minmax(")
            .and_then(|value| value.strip_suffix(')'))
        {
            let Some((min, max)) = inner.split_once(',') else {
                return false;
            };
            let Some(min) = min
                .strip_suffix("px")
                .and_then(|value| value.parse::<f64>().ok())
            else {
                return false;
            };
            let Some(fr) = max
                .strip_suffix("fr")
                .and_then(|value| value.parse::<f64>().ok())
            else {
                return false;
            };
            return min.is_finite() && min >= 0.0 && fr.is_finite() && fr > 0.0;
        }
        if let Some(fr) = track
            .strip_suffix("fr")
            .and_then(|value| value.parse::<f64>().ok())
        {
            return fr.is_finite() && fr > 0.0;
        }
        if let Some(points) = track
            .strip_suffix("px")
            .and_then(|value| value.parse::<f64>().ok())
        {
            return points.is_finite() && points >= 0.0;
        }
        false
    });
    (valid && !normalized.is_empty()).then_some(GridTracks::Css(normalized))
}

fn stylex_grid_line(value: &StaticValue) -> Option<GridLine> {
    match value {
        StaticValue::String(value) if value.trim() == "auto" => Some(GridLine::Auto),
        StaticValue::String(value) => value
            .trim()
            .parse::<i32>()
            .ok()
            .filter(|line| *line != 0)
            .map(GridLine::Line),
        StaticValue::Number(value)
            if value.is_finite()
                && value.fract() == 0.0
                && *value >= i32::MIN as f64
                && *value <= i32::MAX as f64
                && *value != 0.0 =>
        {
            Some(GridLine::Line(*value as i32))
        }
        _ => None,
    }
}

fn stylex_grid_span(value: &StaticValue) -> Option<GridSpan> {
    let StaticValue::String(value) = value else {
        return None;
    };
    let value = value.split_whitespace().collect::<Vec<_>>().join(" ");
    if value == "auto" {
        return Some(GridSpan::Auto);
    }
    if value == "1 / -1" {
        return Some(GridSpan::Full);
    }
    let (start, end) = value.split_once(" / ")?;
    let start = start.strip_prefix("span ")?.parse::<u32>().ok()?;
    let end = end.strip_prefix("span ")?.parse::<u32>().ok()?;
    (start > 0 && start == end).then_some(GridSpan::Span(start))
}

fn stylex_grid_area(value: &StaticValue) -> Option<Vec<StyleProperty>> {
    let StaticValue::String(value) = value else { return None };
    let parts = value.split('/').map(str::trim).collect::<Vec<_>>();
    let [row_start, column_start, row_end, column_end] = parts.as_slice() else {
        return None;
    };
    let line = |value: &str| stylex_grid_line(&StaticValue::String(value.to_string()));
    Some(vec![
        StyleProperty::GridRowStart(line(row_start)?),
        StyleProperty::GridColumnStart(line(column_start)?),
        StyleProperty::GridRowEnd(line(row_end)?),
        StyleProperty::GridColumnEnd(line(column_end)?),
    ])
}

fn stylex_grid_template(value: &StaticValue) -> Option<Vec<StyleProperty>> {
    let StaticValue::String(value) = value else { return None };
    let (rows, columns) = value.split_once('/')?;
    if columns.contains('/') {
        return None;
    }
    let rows = stylex_grid_tracks(&StaticValue::String(rows.trim().to_string()))?;
    let columns = stylex_grid_tracks(&StaticValue::String(columns.trim().to_string()))?;
    Some(vec![
        StyleProperty::GridTemplateRows(rows),
        StyleProperty::GridTemplateColumns(columns),
    ])
}

fn stylex_grid(value: &StaticValue) -> Option<Vec<StyleProperty>> {
    let mut properties = stylex_grid_template(value)?;
    properties.extend([
        web_longhand("grid-template-areas", "none"),
        web_longhand("grid-auto-rows", "auto"),
        web_longhand("grid-auto-columns", "auto"),
        web_longhand("grid-auto-flow", "row"),
    ]);
    Some(properties)
}

fn transform_angle(value: &str) -> Option<Angle> {
    if value == "0" {
        return Some(Angle::Deg(0.0));
    }
    value.strip_suffix("deg")
        .and_then(|value| value.parse::<f64>().ok())
        .filter(|value| value.is_finite())
        .map(Angle::Deg)
}

fn transform_dimension(value: &str) -> Option<Dimension> {
    match dimension(&StaticValue::String(value.to_string()))? {
        value @ (Dimension::Length(_) | Dimension::Percent(_)) => Some(value),
        _ => None,
    }
}

fn stylex_rotate(value: &StaticValue) -> Option<Angle> {
    let StaticValue::String(value) = value else { return None };
    value.ends_with("deg").then(|| transform_angle(value)).flatten()
}

fn stylex_scale_component(value: &str) -> Option<Scale> {
    if let Some(value) = value.strip_suffix('%') {
        let value = value.parse::<f64>().ok()?;
        return value.is_finite().then_some(Scale::Percent(value));
    }
    let value = value.parse::<f64>().ok()?;
    value.is_finite().then_some(Scale::Ratio(value))
}

fn stylex_scale(value: &StaticValue) -> Option<Vec<Scale>> {
    match value {
        StaticValue::Number(value) if value.is_finite() => {
            Some(vec![Scale::Ratio(*value)])
        }
        StaticValue::String(value) => {
            let values: Vec<_> = value.split_whitespace().map(stylex_scale_component).collect();
            ((1..=3).contains(&values.len()) && values.iter().all(Option::is_some))
                .then(|| values.into_iter().flatten().collect())
        }
        _ => None,
    }
}

fn stylex_translate(value: &StaticValue) -> Option<Vec<Dimension>> {
    match value {
        StaticValue::Number(_) => Some(vec![dimension(value)?]),
        StaticValue::String(value) => {
            let values: Vec<_> = value.split_whitespace().map(transform_dimension).collect();
            ((1..=2).contains(&values.len()) && values.iter().all(Option::is_some))
                .then(|| values.into_iter().flatten().collect())
        }
    }
}

fn transform_arguments(value: &str) -> Vec<&str> {
    if value.contains(',') {
        value.split(',').map(str::trim).filter(|value| !value.is_empty()).collect()
    } else {
        value.split_whitespace().collect()
    }
}

/// Parse only functions React Native's public transform array can represent.
fn transform_functions(value: &StaticValue) -> Option<Vec<TransformFunction>> {
    let StaticValue::String(value) = value else { return None };
    let mut rest = value.trim();
    if rest == "none" {
        return Some(Vec::new());
    }
    let mut functions = Vec::new();
    while !rest.is_empty() {
        let open = rest.find('(')?;
        let name = rest[..open].trim();
        if name.is_empty() || !name.chars().all(|character| character.is_ascii_alphanumeric()) {
            return None;
        }
        let tail = &rest[open + 1..];
        let close = tail.find(')')?;
        if tail[..close].contains('(') {
            return None;
        }
        let arguments = transform_arguments(tail[..close].trim());
        let number = |value: &str| value.parse::<f64>().ok().filter(|value| value.is_finite());
        let one = || (arguments.len() == 1).then_some(arguments[0]);
        match name {
            "perspective" => functions.push(TransformFunction::Perspective(px_length(
                &StaticValue::String(one()?.to_string()),
            )?)),
            "rotate" => functions.push(TransformFunction::Rotate(transform_angle(one()?)?)),
            "rotateX" => functions.push(TransformFunction::RotateX(transform_angle(one()?)?)),
            "rotateY" => functions.push(TransformFunction::RotateY(transform_angle(one()?)?)),
            "rotateZ" => functions.push(TransformFunction::RotateZ(transform_angle(one()?)?)),
            "scale" if arguments.len() == 1 => functions.push(TransformFunction::Scale(number(arguments[0])?)),
            "scale" if arguments.len() == 2 => {
                functions.push(TransformFunction::ScaleX(number(arguments[0])?));
                functions.push(TransformFunction::ScaleY(number(arguments[1])?));
            }
            "scaleX" => functions.push(TransformFunction::ScaleX(number(one()?)?)),
            "scaleY" => functions.push(TransformFunction::ScaleY(number(one()?)?)),
            "translate" if arguments.len() == 1 || arguments.len() == 2 => {
                functions.push(TransformFunction::TranslateX(transform_dimension(arguments[0])?));
                if arguments.len() == 2 {
                    functions.push(TransformFunction::TranslateY(transform_dimension(arguments[1])?));
                }
            }
            "translateX" => functions.push(TransformFunction::TranslateX(transform_dimension(one()?)?)),
            "translateY" => functions.push(TransformFunction::TranslateY(transform_dimension(one()?)?)),
            "skewX" => functions.push(TransformFunction::SkewX(transform_angle(one()?)?)),
            "skewY" => functions.push(TransformFunction::SkewY(transform_angle(one()?)?)),
            _ => return None,
        }
        rest = tail[close + 1..].trim_start();
    }
    (!functions.is_empty()).then_some(functions)
}

fn transform_origin(value: &StaticValue) -> Option<String> {
    let StaticValue::String(value) = value else { return None };
    let parts: Vec<_> = value.split_whitespace().collect();
    if !(1..=3).contains(&parts.len()) {
        return None;
    }
    let valid = |part: &str| {
        matches!(part, "left" | "center" | "right" | "top" | "bottom")
            || transform_dimension(part).is_some()
    };
    parts.iter().all(|part| valid(part)).then(|| parts.join(" "))
}

/// Variables, fallbacks, and values needing escaping belong with the later
/// defineVars/theme slice. Refusing them is safer than lossy underscore
/// encoding that merely looks supported.
fn safe_arbitrary(value: String) -> Option<String> {
    (!value.is_empty()
        && !value.chars().any(char::is_whitespace)
        && !value.contains(['[', ']'])
        && !value.contains("var(")
        && !value.contains("env("))
    .then_some(value)
}

fn named(value: &StaticValue, choices: &[(&str, &str)]) -> Option<String> {
    let StaticValue::String(value) = value else {
        return None;
    };
    choices
        .iter()
        .find(|(name, _)| *name == value)
        .map(|(_, token)| (*token).to_string())
}

/// Web-only declarations are accepted through a named value grammar rather
/// than a generic static-string escape hatch. Each newly supported property
/// therefore has an explicit validation boundary that can be tested against
/// the official StyleX transform.
#[derive(Clone, Copy)]
enum WebValueGrammar {
    Keywords(&'static [&'static str]),
    Length {
        keywords: &'static [&'static str],
        minimum: f64,
    },
    LengthPercentage(&'static [&'static str]),
    NonNegativeLengthPercentage(&'static [&'static str]),
    LengthList { minimum: usize, maximum: usize },
    SvgLength(&'static [&'static str]),
    Color,
    Integer {
        keywords: &'static [&'static str],
        minimum: i64,
        maximum: i64,
    },
    Number { minimum: f64, maximum: f64 },
    NumberWithKeywords {
        keywords: &'static [&'static str],
        minimum: f64,
        maximum: f64,
    },
    NumberPercentage { minimum: f64, maximum: f64 },
    ClipRect,
    ClipPath,
    Contain,
    ContainIntrinsicSize { axes: usize },
    OverflowClipMargin,
    SvgDasharray,
    UrlOrNone,
    Time,
    SignedTime,
    AnimationTimingFunction,
    BorderImageOutset,
    BorderImageRepeat,
    BorderImageSlice,
    BorderImageWidth,
    GridAutoFlow,
    GridTemplateAreas,
    GridTrackList,
    CommaKeywordGroups {
        keywords: &'static [&'static str],
        minimum: usize,
        maximum: usize,
    },
    MaskImage,
    MaskPosition,
    MaskSize,
    OffsetPath,
    OffsetPosition(&'static [&'static str]),
    OffsetRotate,
    PerspectiveOrigin,
    ShapeOutside,
    WillChange,
    FontFeatureSettings,
    FontLanguageOverride,
    FontPalette,
    FontSynthesis,
    FontVariantAlternates,
    FontVariantEastAsian,
    FontVariationSettings,
    HangingPunctuation,
    HyphenateCharacter,
    HyphenateLimitChars,
    ImageResolution,
    InitialLetter,
    TimelineNames { allow_all: bool },
    DashedIdent { keyword: &'static str },
    AnimationTimeline,
    AnimationRangeBoundary,
    ViewTimelineInset,
    MasonryAutoFlow,
    Angle(&'static [&'static str]),
    TextDecorationSkip,
    CounterList { allow_reversed: bool },
    ScrollbarColor,
    Quotes,
    Content,
    Zoom,
    TextDecoration,
    TextEmphasis,
    Outline,
    ViewTransitionName,
    MathDepth,
    TabSize,
    TextCombineUpright,
    TextEmphasisStyle,
    Percentage {
        keywords: &'static [&'static str],
        minimum: f64,
        maximum: f64,
    },
}

fn web_only_keyword_spec(property: &str) -> Option<(&'static str, &'static [&'static str])> {
    let (css_property, choices): (&str, &[&str]) = match property {
        "animationComposition" => (
            "animation-composition",
            &["replace", "add", "accumulate"],
        ),
        "positionVisibility" => (
            "position-visibility",
            &["always", "anchors-visible", "no-overflow"],
        ),
        "animationDirection" => (
            "animation-direction",
            &["normal", "reverse", "alternate", "alternate-reverse"],
        ),
        "animationFillMode" => (
            "animation-fill-mode",
            &["none", "forwards", "backwards", "both"],
        ),
        "animationPlayState" => ("animation-play-state", &["running", "paused"]),
        "transformBox" => (
            "transform-box",
            &["content-box", "border-box", "fill-box", "stroke-box", "view-box"],
        ),
        "transformStyle" => ("transform-style", &["flat", "preserve-3d"]),
        "appearance" => ("appearance", &["auto", "none", "textfield"]),
        "alignmentBaseline" => (
            "alignment-baseline",
            &[
                "auto", "baseline", "before-edge", "text-before-edge", "middle", "central",
                "after-edge", "text-after-edge", "ideographic", "alphabetic", "hanging",
                "mathematical",
            ],
        ),
        "alignTracks" => (
            "align-tracks",
            &[
                "normal", "stretch", "center", "start", "end", "flex-start", "flex-end",
                "baseline", "first baseline", "last baseline", "space-between", "space-around",
                "space-evenly",
            ],
        ),
        "backgroundAttachment" => ("background-attachment", &["scroll", "fixed", "local"]),
        "backgroundBlendMode" => (
            "background-blend-mode",
            &[
                "normal", "multiply", "screen", "overlay", "darken", "lighten",
                "color-dodge", "color-burn", "hard-light", "soft-light", "difference",
                "exclusion", "hue", "saturation", "color", "luminosity",
            ],
        ),
        "backgroundClip" => (
            "background-clip",
            &["border-box", "padding-box", "content-box", "text"],
        ),
        "WebkitBackgroundClip" => (
            "-webkit-background-clip",
            &["border-box", "padding-box", "content-box", "text"],
        ),
        "backgroundOrigin" => (
            "background-origin",
            &["border-box", "padding-box", "content-box"],
        ),
        "backgroundPositionX" => ("background-position-x", &["left", "center", "right"]),
        "backgroundPositionY" => ("background-position-y", &["top", "center", "bottom"]),
        "boxDecorationBreak" => ("box-decoration-break", &["slice", "clone"]),
        "borderCollapse" => ("border-collapse", &["collapse", "separate"]),
        "breakAfter" => (
            "break-after",
            &[
                "auto", "avoid", "always", "all", "avoid-page", "page", "left", "right",
                "recto", "verso", "avoid-column", "column", "avoid-region", "region",
            ],
        ),
        "breakBefore" => (
            "break-before",
            &[
                "auto", "avoid", "always", "all", "avoid-page", "page", "left", "right",
                "recto", "verso", "avoid-column", "column", "avoid-region", "region",
            ],
        ),
        "breakInside" => (
            "break-inside",
            &["auto", "avoid", "avoid-page", "avoid-column", "avoid-region"],
        ),
        "captionSide" => (
            "caption-side",
            &["top", "bottom", "block-start", "block-end", "inline-start", "inline-end"],
        ),
        "caretShape" => ("caret-shape", &["auto", "bar", "block", "underscore"]),
        "clipRule" => ("clip-rule", &["nonzero", "evenodd"]),
        "columnFill" => ("column-fill", &["auto", "balance"]),
        "columnRuleStyle" => (
            "column-rule-style",
            &[
                "none", "hidden", "dotted", "dashed", "solid", "double", "groove", "ridge",
                "inset", "outset",
            ],
        ),
        "columnSpan" => ("column-span", &["none", "all"]),
        "WebkitAppearance" => ("-webkit-appearance", &["auto", "none", "textfield"]),
        "WebkitBoxOrient" => (
            "-webkit-box-orient",
            &["vertical", "horizontal", "inline-axis", "block-axis"],
        ),
        "colorScheme" => (
            "color-scheme",
            &["normal", "light", "dark", "light dark", "only light", "only dark"],
        ),
        "forcedColorAdjust" => ("forced-color-adjust", &["auto", "none"]),
        "float" => ("float", &["none", "left", "right"]),
        "clear" => ("clear", &["none", "left", "right", "both"]),
        "dominantBaseline" => (
            "dominant-baseline",
            &[
                "auto", "use-script", "no-change", "reset-size", "ideographic",
                "alphabetic", "hanging", "mathematical", "central", "middle",
                "text-after-edge", "text-before-edge",
            ],
        ),
        "contentVisibility" => ("content-visibility", &["visible", "hidden", "auto"]),
        "displayInside" => ("display-inside", &["auto", "block", "table", "flex", "grid", "ruby"]),
        "displayList" => ("display-list", &["none", "list-item"]),
        "displayOutside" => (
            "display-outside",
            &[
                "block-level", "inline-level", "run-in", "contents", "none",
                "table-row-group", "table-header-group", "table-footer-group", "table-row",
                "table-cell", "table-column-group", "table-column", "table-caption",
                "ruby-base", "ruby-text", "ruby-base-container", "ruby-text-container",
            ],
        ),
        "emptyCells" => ("empty-cells", &["show", "hide"]),
        "fillRule" => ("fill-rule", &["nonzero", "evenodd"]),
        "fontKerning" => ("font-kerning", &["auto", "normal", "none"]),
        "fontOpticalSizing" => ("font-optical-sizing", &["auto", "none"]),
        "fontStretch" => (
            "font-stretch",
            &[
                "normal", "ultra-condensed", "extra-condensed", "condensed",
                "semi-condensed", "semi-expanded", "expanded", "extra-expanded",
                "ultra-expanded",
            ],
        ),
        "fontSynthesisPosition" => ("font-synthesis-position", &["auto", "none"]),
        "fontSynthesisSmallCaps" => ("font-synthesis-small-caps", &["auto", "none"]),
        "fontSynthesisStyle" => ("font-synthesis-style", &["auto", "none"]),
        "fontSynthesisWeight" => ("font-synthesis-weight", &["auto", "none"]),
        "fontVariantCaps" => (
            "font-variant-caps",
            &[
                "normal", "small-caps", "all-small-caps", "petite-caps",
                "all-petite-caps", "unicase", "titling-caps",
            ],
        ),
        "fontVariantLigatures" => ("font-variant-ligatures", &["normal", "none"]),
        "fontVariantNumeric" => (
            "font-variant-numeric",
            &[
                "normal", "lining-nums", "oldstyle-nums", "proportional-nums",
                "tabular-nums", "diagonal-fractions", "stacked-fractions", "ordinal",
                "slashed-zero",
            ],
        ),
        "fontVariantPosition" => ("font-variant-position", &["normal", "sub", "super"]),
        "hyphens" => ("hyphens", &["none", "manual", "auto"]),
        "mathShift" => ("math-shift", &["normal", "compact"]),
        "mathStyle" => ("math-style", &["normal", "compact"]),
        "marginTrim" => (
            "margin-trim",
            &["none", "block", "block-start", "block-end", "inline", "inline-start", "inline-end"],
        ),
        "imageOrientation" => ("image-orientation", &["from-image", "none"]),
        "initialLetterAlign" => (
            "initial-letter-align",
            &["auto", "alphabetic", "hanging", "ideographic"],
        ),
        "imageRendering" => (
            "image-rendering",
            &["auto", "crisp-edges", "pixelated", "optimizeSpeed", "optimizeQuality"],
        ),
        "imeMode" => ("ime-mode", &["auto", "normal", "active", "inactive", "disabled"]),
        "interpolateSize" => ("interpolate-size", &["allow-keywords", "numeric-only"]),
        "justifyItems" => (
            "justify-items",
            &[
                "normal", "stretch", "center", "start", "end", "flex-start", "flex-end",
                "self-start", "self-end", "left", "right", "baseline", "first baseline",
                "last baseline", "safe center", "unsafe center", "legacy right", "legacy left",
                "legacy center", "initial", "inherit", "unset",
            ],
        ),
        "justifyTracks" => (
            "justify-tracks",
            &[
                "normal", "stretch", "center", "start", "end", "flex-start", "flex-end",
                "left", "right", "baseline", "first baseline", "last baseline", "space-between",
                "space-around", "space-evenly",
            ],
        ),
        "MozOsxFontSmoothing" => ("-moz-osx-font-smoothing", &["grayscale"]),
        "MsOverflowStyle" => (
            "-ms-overflow-style",
            &["auto", "none", "scrollbar", "-ms-autohiding-scrollbar"],
        ),
        "overflowBlock" => (
            "overflow-y",
            &["visible", "hidden", "clip", "scroll", "auto"],
        ),
        "overflowBlockX" => (
            "overflow-block-x",
            &["visible", "hidden", "clip", "scroll", "auto"],
        ),
        "overflowAnchor" => ("overflow-anchor", &["auto", "none"]),
        "overscrollBehavior" => ("overscroll-behavior", &["auto", "contain", "none"]),
        "overscrollBehaviorBlock" => {
            ("overscroll-behavior-block", &["auto", "contain", "none"])
        }
        "overscrollBehaviorInline" => {
            ("overscroll-behavior-inline", &["auto", "contain", "none"])
        }
        "overscrollBehaviorX" => ("overscroll-behavior-x", &["auto", "contain", "none"]),
        "overscrollBehaviorY" => ("overscroll-behavior-y", &["auto", "contain", "none"]),
        "printColorAdjust" => ("print-color-adjust", &["economy", "exact"]),
        "paintOrder" => (
            "paint-order",
            &[
                "normal", "stroke", "fill", "markers", "stroke fill", "stroke markers",
                "fill markers", "stroke fill markers",
            ],
        ),
        "pageBreakAfter" => (
            "page-break-after",
            &["auto", "always", "avoid", "left", "right", "recto", "verso"],
        ),
        "pageBreakBefore" => (
            "page-break-before",
            &["auto", "always", "avoid", "left", "right", "recto", "verso"],
        ),
        "pageBreakInside" => ("page-break-inside", &["auto", "avoid"]),
        "resize" => ("resize", &["none", "both", "horizontal", "vertical"]),
        "rubyAlign" => (
            "ruby-align",
            &["start", "center", "space-between", "space-around"],
        ),
        "rubyMerge" => ("ruby-merge", &["separate", "collapse", "auto"]),
        "rubyPosition" => (
            "ruby-position",
            &["over", "under", "alternate", "inter-character"],
        ),
        "scrollSnapAlign" => ("scroll-snap-align", &["none", "start", "end", "center"]),
        "scrollSnapStop" => ("scroll-snap-stop", &["normal", "always"]),
        "scrollSnapType" => (
            "scroll-snap-type",
            &[
                "none", "block", "block mandatory", "block proximity", "both",
                "both mandatory", "both proximity", "inline", "inline mandatory",
                "inline proximity", "x", "x mandatory", "x proximity", "y",
                "y mandatory", "y proximity",
            ],
        ),
        "scrollTimelineAxis" => ("scroll-timeline-axis", &["block", "inline", "x", "y"]),
        "scrollbarGutter" => ("scrollbar-gutter", &["auto", "stable", "stable both-edges"]),
        "scrollbarWidth" => ("scrollbar-width", &["auto", "thin", "none"]),
        "shapeRendering" => (
            "shape-rendering",
            &["auto", "optimizeSpeed", "crispEdges", "geometricPrecision"],
        ),
        "strokeLinecap" => ("stroke-linecap", &["butt", "round", "square"]),
        "strokeLinejoin" => ("stroke-linejoin", &["miter", "round", "bevel"]),
        "textAnchor" => ("text-anchor", &["start", "middle", "end"]),
        "textRendering" => (
            "text-rendering",
            &["auto", "optimizeSpeed", "optimizeLegibility", "geometricPrecision"],
        ),
        "touchAction" => ("touch-action", &["auto", "none", "manipulation"]),
        "unicodeBidi" => (
            "unicode-bidi",
            &["normal", "embed", "isolate", "bidi-override", "isolate-override", "plaintext"],
        ),
        "wordBreak" => ("word-break", &["normal", "break-all", "keep-all", "break-word"]),
        "wordWrap" => ("word-wrap", &["normal", "break-word"]),
        "overflowWrap" => ("overflow-wrap", &["normal", "break-word", "anywhere"]),
        "visibility" => ("visibility", &["visible", "hidden", "collapse"]),
        "viewTimelineAxis" => ("view-timeline-axis", &["block", "inline", "x", "y"]),
        "backgroundPosition" => (
            "background-position",
            &[
                "top", "right", "bottom", "left", "center", "left top", "left center",
                "left bottom", "right top", "right center", "right bottom", "center top",
                "center center", "center bottom",
            ],
        ),
        "backgroundRepeat" => ("background-repeat", &["repeat", "repeat-x", "repeat-y", "no-repeat", "space", "round"]),
        "backgroundSize" => ("background-size", &["auto", "cover", "contain"]),
        "objectPosition" => (
            "object-position",
            &[
                "top", "right", "bottom", "left", "center", "left top", "left center",
                "left bottom", "right top", "right center", "right bottom", "center top",
                "center center", "center bottom",
            ],
        ),
        "justifySelf" => (
            "justify-self",
            &["auto", "normal", "stretch", "center", "start", "end", "self-start", "self-end", "flex-start", "flex-end"],
        ),
        "placeItems" => (
            "place-items",
            &["normal", "stretch", "center", "start", "end", "baseline", "normal normal", "stretch stretch", "center center", "start start", "end end"],
        ),
        "placeSelf" => (
            "place-self",
            &[
                "auto", "normal", "stretch", "center", "start", "end", "self-start",
                "self-end", "flex-start", "flex-end", "baseline", "auto auto",
                "normal normal", "stretch stretch", "center center", "start start", "end end",
            ],
        ),
        "lineBreak" => ("line-break", &["auto", "loose", "normal", "strict"]),
        "listStylePosition" => ("list-style-position", &["inside", "outside"]),
        "listStyleType" => (
            "list-style-type",
            &[
                "none", "disc", "circle", "square", "decimal", "decimal-leading-zero",
                "lower-roman", "upper-roman", "lower-greek", "lower-latin", "upper-latin",
                "armenian", "georgian", "lower-alpha", "upper-alpha",
            ],
        ),
        "tableLayout" => ("table-layout", &["auto", "fixed"]),
        "textAlignLast" => (
            "text-align-last",
            &["auto", "start", "end", "left", "right", "center", "justify", "inherit"],
        ),
        "textDecorationSkipInk" => ("text-decoration-skip-ink", &["auto", "none", "all"]),
        "textJustify" => (
            "text-justify",
            &["none", "auto", "inter-word", "inter-character", "distribute"],
        ),
        "textOrientation" => ("text-orientation", &["mixed", "upright", "sideways"]),
        "textWrap" => ("text-wrap", &["wrap", "nowrap", "balance", "pretty", "stable"]),
        "WebkitFontSmoothing" => ("-webkit-font-smoothing", &["antialiased"]),
        "writingMode" => (
            "writing-mode",
            &[
                "horizontal-tb", "vertical-rl", "vertical-lr", "sideways-rl", "sideways-lr",
                "lr-tb", "rl-tb", "tb-rl", "lr", "rl", "tb",
            ],
        ),
        _ => return None,
    };
    Some((css_property, choices))
}

fn web_only_spec(property: &str) -> Option<(&'static str, WebValueGrammar)> {
    match property {
        "accentColor" => Some(("accent-color", WebValueGrammar::Color)),
        "WebkitLineClamp" => Some((
            "-webkit-line-clamp",
            WebValueGrammar::Integer {
                keywords: &["none"],
                minimum: 1,
                maximum: i64::MAX,
            },
        )),
        "WebkitTextStrokeWidth" => Some((
            "-webkit-text-stroke-width",
            WebValueGrammar::Length {
                keywords: &["thin", "medium", "thick"],
                minimum: 0.0,
            },
        )),
        "hyphenateLimitChars" => Some((
            "hyphenate-limit-chars",
            WebValueGrammar::HyphenateLimitChars,
        )),
        "lineHeightStep" => Some((
            "line-height-step",
            WebValueGrammar::Length {
                keywords: &[],
                minimum: 0.0,
            },
        )),
        "mathDepth" => Some(("math-depth", WebValueGrammar::MathDepth)),
        "masonryAutoFlow" => Some(("masonry-auto-flow", WebValueGrammar::MasonryAutoFlow)),
        "imageResolution" => Some(("image-resolution", WebValueGrammar::ImageResolution)),
        "initialLetter" => Some(("initial-letter", WebValueGrammar::InitialLetter)),
        "scrollTimelineName" => Some((
            "scroll-timeline-name",
            WebValueGrammar::TimelineNames { allow_all: false },
        )),
        "anchorName" => Some((
            "anchor-name",
            WebValueGrammar::TimelineNames { allow_all: false },
        )),
        "positionAnchor" => Some((
            "position-anchor",
            WebValueGrammar::DashedIdent { keyword: "auto" },
        )),
        "timelineScope" => Some((
            "timeline-scope",
            WebValueGrammar::TimelineNames { allow_all: true },
        )),
        "viewTimelineName" => Some((
            "view-timeline-name",
            WebValueGrammar::TimelineNames { allow_all: false },
        )),
        "viewTransitionName" => Some((
            "view-transition-name",
            WebValueGrammar::ViewTransitionName,
        )),
        "viewTimelineInset" => Some(("view-timeline-inset", WebValueGrammar::ViewTimelineInset)),
        "orphans" => Some((
            "orphans",
            WebValueGrammar::Integer {
                keywords: &[],
                minimum: 1,
                maximum: i64::MAX,
            },
        )),
        "widows" => Some((
            "widows",
            WebValueGrammar::Integer {
                keywords: &[],
                minimum: 1,
                maximum: i64::MAX,
            },
        )),
        "borderSpacing" => Some((
            "border-spacing",
            WebValueGrammar::LengthList {
                minimum: 1,
                maximum: 2,
            },
        )),
        "borderImageSource" => Some(("border-image-source", WebValueGrammar::MaskImage)),
        "borderImageSlice" => Some(("border-image-slice", WebValueGrammar::BorderImageSlice)),
        "borderImageWidth" => Some(("border-image-width", WebValueGrammar::BorderImageWidth)),
        "borderImageOutset" => Some(("border-image-outset", WebValueGrammar::BorderImageOutset)),
        "borderImageRepeat" => Some(("border-image-repeat", WebValueGrammar::BorderImageRepeat)),
        "maskBorderMode" => Some((
            "mask-border-mode",
            WebValueGrammar::Keywords(&["alpha", "luminance"]),
        )),
        "maskBorderOutset" => Some(("mask-border-outset", WebValueGrammar::BorderImageOutset)),
        "maskBorderRepeat" => Some(("mask-border-repeat", WebValueGrammar::BorderImageRepeat)),
        "maskBorderSlice" => Some(("mask-border-slice", WebValueGrammar::BorderImageSlice)),
        "maskBorderSource" => Some(("mask-border-source", WebValueGrammar::MaskImage)),
        "maskBorderWidth" => Some(("mask-border-width", WebValueGrammar::BorderImageWidth)),
        "gridAutoColumns" => Some(("grid-auto-columns", WebValueGrammar::GridTrackList)),
        "gridAutoRows" => Some(("grid-auto-rows", WebValueGrammar::GridTrackList)),
        "gridAutoFlow" => Some(("grid-auto-flow", WebValueGrammar::GridAutoFlow)),
        "gridTemplateAreas" => Some(("grid-template-areas", WebValueGrammar::GridTemplateAreas)),
        "glyphOrientationHorizontal" => Some((
            "glyph-orientation-horizontal",
            WebValueGrammar::Angle(&[]),
        )),
        "glyphOrientationVertical" => Some((
            "glyph-orientation-vertical",
            WebValueGrammar::Angle(&["auto"]),
        )),
        "kerning" => Some(("kerning", WebValueGrammar::SvgLength(&["auto"]))),
        "markerOffset" => Some(("marker-offset", WebValueGrammar::SvgLength(&["auto"]))),
        "textDecorationSkip" => Some((
            "text-decoration-skip",
            WebValueGrammar::TextDecorationSkip,
        )),
        "counterIncrement" => Some((
            "counter-increment",
            WebValueGrammar::CounterList {
                allow_reversed: false,
            },
        )),
        "counterReset" => Some((
            "counter-reset",
            WebValueGrammar::CounterList {
                allow_reversed: true,
            },
        )),
        "counterSet" => Some((
            "counter-set",
            WebValueGrammar::CounterList {
                allow_reversed: false,
            },
        )),
        "scrollbarColor" => Some(("scrollbar-color", WebValueGrammar::ScrollbarColor)),
        "quotes" => Some(("quotes", WebValueGrammar::Quotes)),
        "content" => Some(("content", WebValueGrammar::Content)),
        "zoom" => Some(("zoom", WebValueGrammar::Zoom)),
        "textDecoration" => Some(("text-decoration", WebValueGrammar::TextDecoration)),
        "textEmphasis" => Some(("text-emphasis", WebValueGrammar::TextEmphasis)),
        "outline" => Some(("outline", WebValueGrammar::Outline)),
        "baselineShift" => Some((
            "baseline-shift",
            WebValueGrammar::SvgLength(&["baseline", "sub", "super"]),
        )),
        "fill" => Some(("fill", WebValueGrammar::Color)),
        "fillOpacity" => Some((
            "fill-opacity",
            WebValueGrammar::NumberPercentage {
                minimum: 0.0,
                maximum: 1.0,
            },
        )),
        "fontFeatureSettings" => {
            Some(("font-feature-settings", WebValueGrammar::FontFeatureSettings))
        }
        "fontLanguageOverride" => {
            Some(("font-language-override", WebValueGrammar::FontLanguageOverride))
        }
        "fontPalette" => Some(("font-palette", WebValueGrammar::FontPalette)),
        // StyleX 0.19 turns numeric length-like values into px even though the
        // CSS property itself is unitless. Preserve that observable output.
        "fontSizeAdjust" => Some((
            "font-size-adjust",
            WebValueGrammar::Length {
                keywords: &["none"],
                minimum: 0.0,
            },
        )),
        "fontSynthesis" => Some(("font-synthesis", WebValueGrammar::FontSynthesis)),
        "fontVariantAlternates" => Some((
            "font-variant-alternates",
            WebValueGrammar::FontVariantAlternates,
        )),
        "fontVariantEastAsian" => Some((
            "font-variant-east-asian",
            WebValueGrammar::FontVariantEastAsian,
        )),
        "fontVariationSettings" => Some((
            "font-variation-settings",
            WebValueGrammar::FontVariationSettings,
        )),
        "hangingPunctuation" => Some((
            "hanging-punctuation",
            WebValueGrammar::HangingPunctuation,
        )),
        "hyphenateCharacter" => Some((
            "hyphenate-character",
            WebValueGrammar::HyphenateCharacter,
        )),
        "marker" => Some(("marker", WebValueGrammar::UrlOrNone)),
        "markerEnd" => Some(("marker-end", WebValueGrammar::UrlOrNone)),
        "markerMid" => Some(("marker-mid", WebValueGrammar::UrlOrNone)),
        "markerStart" => Some(("marker-start", WebValueGrammar::UrlOrNone)),
        "WebkitMaskImage" => Some(("-webkit-mask-image", WebValueGrammar::MaskImage)),
        "maskImage" => Some(("mask-image", WebValueGrammar::MaskImage)),
        "maskMode" => Some((
            "mask-mode",
            WebValueGrammar::CommaKeywordGroups {
                keywords: &["match-source", "luminance", "alpha"],
                minimum: 1,
                maximum: 1,
            },
        )),
        "maskRepeat" => Some((
            "mask-repeat",
            WebValueGrammar::CommaKeywordGroups {
                keywords: &["repeat-x", "repeat-y", "repeat", "space", "round", "no-repeat"],
                minimum: 1,
                maximum: 2,
            },
        )),
        "maskPosition" => Some(("mask-position", WebValueGrammar::MaskPosition)),
        "maskSize" => Some(("mask-size", WebValueGrammar::MaskSize)),
        "maskOrigin" => Some((
            "mask-origin",
            WebValueGrammar::CommaKeywordGroups {
                keywords: &["content-box", "padding-box", "border-box", "fill-box", "stroke-box", "view-box"],
                minimum: 1,
                maximum: 1,
            },
        )),
        "maskClip" => Some((
            "mask-clip",
            WebValueGrammar::CommaKeywordGroups {
                keywords: &["content-box", "padding-box", "border-box", "fill-box", "stroke-box", "view-box", "no-clip"],
                minimum: 1,
                maximum: 1,
            },
        )),
        "maskComposite" => Some((
            "mask-composite",
            WebValueGrammar::CommaKeywordGroups {
                keywords: &["add", "subtract", "intersect", "exclude"],
                minimum: 1,
                maximum: 1,
            },
        )),
        "maskType" => Some((
            "mask-type",
            WebValueGrammar::Keywords(&["luminance", "alpha"]),
        )),
        "offsetAnchor" => Some((
            "offset-anchor",
            WebValueGrammar::OffsetPosition(&["auto"]),
        )),
        "offsetDistance" => Some((
            "offset-distance",
            WebValueGrammar::LengthPercentage(&[]),
        )),
        "offsetPath" => Some(("offset-path", WebValueGrammar::OffsetPath)),
        "offsetPosition" => Some((
            "offset-position",
            WebValueGrammar::OffsetPosition(&["normal", "auto"]),
        )),
        "offsetRotate" => Some(("offset-rotate", WebValueGrammar::OffsetRotate)),
        "shapeImageThreshold" => Some((
            "shape-image-threshold",
            WebValueGrammar::Number {
                minimum: 0.0,
                maximum: 1.0,
            },
        )),
        "shapeMargin" => Some((
            "shape-margin",
            WebValueGrammar::NonNegativeLengthPercentage(&[]),
        )),
        "shapeOutside" => Some(("shape-outside", WebValueGrammar::ShapeOutside)),
        "clip" => Some(("clip", WebValueGrammar::ClipRect)),
        "columnCount" => Some((
            "column-count",
            WebValueGrammar::Integer {
                keywords: &["auto"],
                minimum: 1,
                maximum: i64::MAX,
            },
        )),
        "columnRuleColor" => Some(("column-rule-color", WebValueGrammar::Color)),
        "columnRuleWidth" => Some((
            "column-rule-width",
            WebValueGrammar::Length {
                keywords: &["thin", "medium", "thick"],
                minimum: 0.0,
            },
        )),
        "columnWidth" => Some((
            "column-width",
            WebValueGrammar::Length {
                keywords: &["auto"],
                minimum: 0.0,
            },
        )),
        "contain" => Some(("contain", WebValueGrammar::Contain)),
        "listStyleImage" => Some(("list-style-image", WebValueGrammar::UrlOrNone)),
        "stroke" => Some(("stroke", WebValueGrammar::Color)),
        "strokeDasharray" => Some(("stroke-dasharray", WebValueGrammar::SvgDasharray)),
        "strokeDashoffset" => Some(("stroke-dashoffset", WebValueGrammar::SvgLength(&[]))),
        "strokeMiterlimit" => Some((
            "stroke-miterlimit",
            WebValueGrammar::Number {
                minimum: 1.0,
                maximum: f64::INFINITY,
            },
        )),
        "strokeOpacity" => Some((
            "stroke-opacity",
            WebValueGrammar::NumberPercentage {
                minimum: 0.0,
                maximum: 1.0,
            },
        )),
        "strokeWidth" => Some(("stroke-width", WebValueGrammar::SvgLength(&[]))),
        "WebkitTapHighlightColor" => {
            Some(("-webkit-tap-highlight-color", WebValueGrammar::Color))
        }
        "WebkitTextFillColor" => Some(("-webkit-text-fill-color", WebValueGrammar::Color)),
        "WebkitTextStrokeColor" => {
            Some(("-webkit-text-stroke-color", WebValueGrammar::Color))
        }
        "blockSize" => Some((
            "height",
            WebValueGrammar::LengthPercentage(&[
                "auto", "available", "min-content", "max-content", "fit-content",
            ]),
        )),
        "inlineSize" => Some((
            "width",
            WebValueGrammar::LengthPercentage(&[
                "auto", "available", "min-content", "max-content", "fit-content",
            ]),
        )),
        "minBlockSize" => Some((
            "min-height",
            WebValueGrammar::LengthPercentage(&[
                "auto", "min-content", "max-content", "fit-content", "fill-available",
            ]),
        )),
        "minInlineSize" => Some((
            "min-width",
            WebValueGrammar::LengthPercentage(&[
                "auto", "min-content", "max-content", "fit-content", "fill-available",
            ]),
        )),
        "maxBlockSize" => Some((
            "max-height",
            WebValueGrammar::LengthPercentage(&[
                "none", "min-content", "max-content", "fit-content", "fill-available",
            ]),
        )),
        "maxInlineSize" => Some((
            "max-width",
            WebValueGrammar::LengthPercentage(&[
                "none", "min-content", "max-content", "fit-content", "fill-available",
            ]),
        )),
        "animationDelay" => Some(("animation-delay", WebValueGrammar::SignedTime)),
        "animationDuration" => Some(("animation-duration", WebValueGrammar::Time)),
        "animationTimingFunction" => Some((
            "animation-timing-function",
            WebValueGrammar::AnimationTimingFunction,
        )),
        "animationTimeline" => Some(("animation-timeline", WebValueGrammar::AnimationTimeline)),
        "animationRangeStart" => Some((
            "animation-range-start",
            WebValueGrammar::AnimationRangeBoundary,
        )),
        "animationRangeEnd" => Some((
            "animation-range-end",
            WebValueGrammar::AnimationRangeBoundary,
        )),
        "clipPath" => Some(("clip-path", WebValueGrammar::ClipPath)),
        "containIntrinsicBlockSize" => Some((
            "contain-intrinsic-height",
            WebValueGrammar::ContainIntrinsicSize { axes: 1 },
        )),
        "containIntrinsicHeight" => Some((
            "contain-intrinsic-height",
            WebValueGrammar::ContainIntrinsicSize { axes: 1 },
        )),
        "containIntrinsicInlineSize" => Some((
            "contain-intrinsic-width",
            WebValueGrammar::ContainIntrinsicSize { axes: 1 },
        )),
        "containIntrinsicSize" => Some((
            "contain-intrinsic-size",
            WebValueGrammar::ContainIntrinsicSize { axes: 2 },
        )),
        "containIntrinsicWidth" => Some((
            "contain-intrinsic-width",
            WebValueGrammar::ContainIntrinsicSize { axes: 1 },
        )),
        "perspective" => Some((
            "perspective",
            WebValueGrammar::Length {
                keywords: &["none"],
                minimum: 0.0,
            },
        )),
        "perspectiveOrigin" => Some((
            "perspective-origin",
            WebValueGrammar::PerspectiveOrigin,
        )),
        "overflowClipMargin" => Some((
            "overflow-clip-margin",
            WebValueGrammar::OverflowClipMargin,
        )),
        "willChange" => Some(("will-change", WebValueGrammar::WillChange)),
        "animationIterationCount" => Some((
            "animation-iteration-count",
            WebValueGrammar::NumberWithKeywords {
                keywords: &["infinite"],
                minimum: 0.0,
                maximum: f64::INFINITY,
            },
        )),
        "tabSize" => Some(("tab-size", WebValueGrammar::TabSize)),
        "textCombineUpright" => {
            Some(("text-combine-upright", WebValueGrammar::TextCombineUpright))
        }
        "textEmphasisColor" => Some(("text-emphasis-color", WebValueGrammar::Color)),
        "textEmphasisPosition" => Some((
            "text-emphasis-position",
            WebValueGrammar::Keywords(&[
                "over", "under", "over right", "over left", "under right", "under left",
            ]),
        )),
        "textEmphasisStyle" => {
            Some(("text-emphasis-style", WebValueGrammar::TextEmphasisStyle))
        }
        "textFillColor" => Some(("text-fill-color", WebValueGrammar::Color)),
        "textSizeAdjust" => Some((
            "text-size-adjust",
            WebValueGrammar::Percentage {
                keywords: &["none", "auto"],
                minimum: 0.0,
                maximum: f64::INFINITY,
            },
        )),
        "textDecorationThickness" => Some((
            "text-decoration-thickness",
            WebValueGrammar::NonNegativeLengthPercentage(&["auto", "from-font"]),
        )),
        "textUnderlineOffset" => Some((
            "text-underline-offset",
            WebValueGrammar::Length {
                keywords: &["auto"],
                minimum: f64::NEG_INFINITY,
            },
        )),
        "textUnderlinePosition" => Some((
            "text-underline-position",
            WebValueGrammar::Keywords(&[
                "auto", "from-font", "under", "left", "right", "under left", "under right",
                "left under", "right under",
            ]),
        )),
        "wordSpacing" => Some((
            "word-spacing",
            WebValueGrammar::LengthPercentage(&["normal"]),
        )),
        _ => web_only_keyword_spec(property)
            .map(|(css_property, choices)| (css_property, WebValueGrammar::Keywords(choices))),
    }
}

fn web_length_percentage(value: &StaticValue) -> bool {
    match value {
        StaticValue::Number(value) => value.is_finite(),
        StaticValue::String(value) => web_length_percentage_string(value),
    }
}

fn web_length_percentage_string(value: &str) -> bool {
    if value == "0" {
        return true;
    }
    [
        "%", "px", "rem", "em", "ch", "ex", "cap", "ic", "lh", "rlh", "vw", "vh",
        "vi", "vb", "vmin", "vmax", "svw", "svh", "lvw", "lvh", "dvw", "dvh",
        "cm", "mm", "q", "in", "pc", "pt",
    ]
    .iter()
    .any(|unit| {
        value
            .strip_suffix(unit)
            .and_then(|number| number.parse::<f64>().ok())
            .is_some_and(f64::is_finite)
    })
}

fn web_length_string(value: &str) -> bool {
    if value == "0" {
        return true;
    }
    [
        "px", "rem", "em", "ch", "ex", "cap", "ic", "lh", "rlh", "vw", "vh", "vi",
        "vb", "vmin", "vmax", "svw", "svh", "lvw", "lvh", "dvw", "dvh", "cm", "mm",
        "q", "in", "pc", "pt",
    ]
    .iter()
    .any(|unit| {
        value
            .strip_suffix(unit)
            .and_then(|number| number.parse::<f64>().ok())
            .is_some_and(f64::is_finite)
    })
}

fn web_length_number(value: &str) -> Option<f64> {
    if value == "0" {
        return Some(0.0);
    }
    value
        .trim_end_matches(|character: char| character.is_ascii_alphabetic() || character == '%')
        .parse::<f64>()
        .ok()
        .filter(|number| number.is_finite())
}

fn web_length(value: &StaticValue, keywords: &[&str], minimum: f64) -> Option<String> {
    match value {
        StaticValue::Number(value) if value.is_finite() && *value >= minimum => {
            Some(format!("{}px", numeric_text(*value)))
        }
        StaticValue::String(value) if keywords.contains(&value.as_str()) => Some(value.clone()),
        StaticValue::String(value)
            if web_length_string(value)
                && web_length_number(value).is_some_and(|number| number >= minimum) =>
        {
            Some(value.clone())
        }
        _ => None,
    }
}

fn web_contain_intrinsic_size(value: &StaticValue, axes: usize) -> Option<String> {
    match value {
        StaticValue::Number(value) if value.is_finite() && *value >= 0.0 => {
            Some(format!("{}px", numeric_text(*value)))
        }
        StaticValue::String(value) if value == "none" => Some(value.clone()),
        StaticValue::String(value) => {
            let tokens = value.split_ascii_whitespace().collect::<Vec<_>>();
            let mut index = 0;
            let mut sizes = 0;
            while index < tokens.len() && sizes < axes {
                if tokens[index] == "auto" {
                    index += 1;
                }
                let token = *tokens.get(index)?;
                let number = web_length_number(token)?;
                if number < 0.0 {
                    return None;
                }
                index += 1;
                sizes += 1;
            }
            (index == tokens.len() && sizes > 0).then(|| value.clone())
        }
        _ => None,
    }
}

fn web_overflow_clip_margin(value: &StaticValue) -> Option<String> {
    match value {
        StaticValue::Number(value) if value.is_finite() && *value >= 0.0 => {
            Some(format!("{}px", numeric_text(*value)))
        }
        StaticValue::String(value) => {
            let tokens = value.split_ascii_whitespace().collect::<Vec<_>>();
            if tokens.is_empty() || tokens.len() > 2 {
                return None;
            }
            let boxes = ["content-box", "padding-box", "border-box"];
            let box_count = tokens.iter().filter(|token| boxes.contains(token)).count();
            let length_count = tokens
                .iter()
                .filter(|token| {
                    web_length_number(token).is_some_and(|number| number >= 0.0)
                })
                .count();
            (box_count <= 1 && length_count <= 1 && box_count + length_count == tokens.len())
                .then(|| value.clone())
        }
        _ => None,
    }
}

fn web_hyphenate_limit_chars(value: &StaticValue) -> Option<String> {
    match value {
        StaticValue::Number(_) => web_integer(value, 1, i64::MAX),
        StaticValue::String(value) if value == "auto" => Some(value.clone()),
        StaticValue::String(value) => {
            let tokens = value.split_ascii_whitespace().collect::<Vec<_>>();
            (tokens.len() <= 3
                && !tokens.is_empty()
                && tokens.iter().all(|token| {
                    token.parse::<u64>().is_ok_and(|number| number > 0)
                }))
            .then(|| value.clone())
        }
    }
}

fn web_math_depth(value: &StaticValue) -> Option<String> {
    match value {
        StaticValue::Number(_) => web_integer(value, i64::MIN, i64::MAX),
        StaticValue::String(value) if value == "auto-add" => Some(value.clone()),
        StaticValue::String(value) => {
            let inner = value.strip_prefix("add(")?.strip_suffix(')')?;
            inner.parse::<i64>().ok().map(|_| value.clone())
        }
    }
}

fn web_image_resolution(value: &StaticValue) -> Option<String> {
    let StaticValue::String(value) = value else { return None };
    let tokens = value.split_ascii_whitespace().collect::<Vec<_>>();
    if tokens.is_empty() || tokens.len() > 3 {
        return None;
    }
    let mut from_image = false;
    let mut snap = false;
    let mut resolution = false;
    for token in tokens {
        match token {
            "from-image" if !from_image => from_image = true,
            "snap" if !snap => snap = true,
            token if !resolution => {
                let number = ["dppx", "dpi", "dpcm", "x"]
                    .iter()
                    .find_map(|unit| token.strip_suffix(unit))?
                    .parse::<f64>()
                    .ok()?;
                if !number.is_finite() || number <= 0.0 {
                    return None;
                }
                resolution = true;
            }
            _ => return None,
        }
    }
    (from_image || resolution || snap).then(|| value.clone())
}

fn web_initial_letter(value: &StaticValue) -> Option<String> {
    let StaticValue::String(value) = value else { return None };
    if value == "normal" {
        return Some(value.clone());
    }
    let tokens = value.split_ascii_whitespace().collect::<Vec<_>>();
    if tokens.is_empty() || tokens.len() > 2 {
        return None;
    }
    let size = tokens[0].parse::<f64>().ok()?;
    if !size.is_finite() || size < 1.0 {
        return None;
    }
    if let Some(sink) = tokens.get(1) {
        sink.parse::<u64>().ok().filter(|sink| *sink > 0)?;
    }
    Some(value.clone())
}

fn web_timeline_names(value: &StaticValue, allow_all: bool) -> Option<String> {
    let StaticValue::String(value) = value else { return None };
    if value == "none" || allow_all && value == "all" {
        return Some(value.clone());
    }
    web_comma_groups(value)?
        .iter()
        .all(|name| name.trim().starts_with("--") && web_css_identifier(name.trim()))
        .then(|| value.clone())
}

fn web_dashed_ident(value: &StaticValue, keyword: &str) -> Option<String> {
    let StaticValue::String(value) = value else { return None };
    (value == keyword || value.starts_with("--") && web_css_identifier(value))
        .then(|| value.clone())
}

fn web_view_transition_name(value: &StaticValue) -> Option<String> {
    let StaticValue::String(value) = value else { return None };
    (matches!(value.as_str(), "none" | "match-element")
        || web_css_identifier(value)
            && !matches!(value.as_str(), "auto" | "normal" | "inherit" | "initial" | "unset"))
    .then(|| value.clone())
}

fn web_animation_timeline(value: &StaticValue) -> Option<String> {
    let StaticValue::String(value) = value else { return None };
    web_comma_groups(value)?
        .iter()
        .all(|item| {
            let item = item.trim();
            matches!(item, "auto" | "none")
                || item.starts_with("--") && web_css_identifier(item)
        })
        .then(|| value.clone())
}

fn web_animation_range_boundary(value: &StaticValue) -> Option<String> {
    match value {
        StaticValue::Number(_) => Some(length_value(value)),
        StaticValue::String(value) if value == "normal" => Some(value.clone()),
        StaticValue::String(value) => {
            let tokens = value.split_ascii_whitespace().collect::<Vec<_>>();
            let names = [
                "cover",
                "contain",
                "entry",
                "exit",
                "entry-crossing",
                "exit-crossing",
            ];
            let valid = match tokens.as_slice() {
                [token] => names.contains(token) || web_length_percentage_string(token),
                [name, offset] => names.contains(name) && web_length_percentage_string(offset),
                _ => false,
            };
            valid.then(|| value.clone())
        }
    }
}

fn web_view_timeline_inset(value: &StaticValue) -> Option<String> {
    match value {
        StaticValue::Number(_) => Some(length_value(value)),
        StaticValue::String(value) => {
            let tokens = value.split_ascii_whitespace().collect::<Vec<_>>();
            (tokens.len() <= 2
                && !tokens.is_empty()
                && tokens
                    .iter()
                    .all(|token| *token == "auto" || web_length_percentage_string(token)))
            .then(|| value.clone())
        }
    }
}

fn stylex_animation_range(value: &StaticValue) -> Option<Vec<StyleProperty>> {
    let StaticValue::String(value) = value else { return None };
    if value.contains(',') {
        return None;
    }
    let parts = web_components(value)?;
    let boundary = |parts: &[String]| {
        let value = StaticValue::String(parts.join(" "));
        web_animation_range_boundary(&value).map(|_| match value {
            StaticValue::String(value) => value,
            StaticValue::Number(_) => unreachable!(),
        })
    };
    let (start, end) = if let Some(start) = boundary(&parts) {
        (start, "normal".to_string())
    } else {
        let candidates = (1..parts.len())
            .filter_map(|split| Some((boundary(&parts[..split])?, boundary(&parts[split..])?)))
            .collect::<Vec<_>>();
        if candidates.len() != 1 {
            return None;
        }
        candidates.into_iter().next()?
    };
    Some(vec![
        web_longhand("animation-range-start", start),
        web_longhand("animation-range-end", end),
    ])
}

fn stylex_scroll_timeline(value: &StaticValue) -> Option<Vec<StyleProperty>> {
    let StaticValue::String(value) = value else { return None };
    let mut name = None;
    let mut axis = None;
    for part in web_components(value)? {
        if matches!(part.as_str(), "block" | "inline" | "x" | "y") && axis.is_none() {
            axis = Some(part);
        } else if (part == "none" || part.starts_with("--") && web_css_identifier(&part))
            && name.is_none()
        {
            name = Some(part);
        } else {
            return None;
        }
    }
    Some(vec![
        web_longhand("scroll-timeline-name", name.unwrap_or_else(|| "none".to_string())),
        web_longhand("scroll-timeline-axis", axis.unwrap_or_else(|| "block".to_string())),
    ])
}

fn stylex_view_timeline(value: &StaticValue) -> Option<Vec<StyleProperty>> {
    let StaticValue::String(value) = value else { return None };
    let mut name = None;
    let mut axis = None;
    let mut inset = Vec::new();
    for part in web_components(value)? {
        if matches!(part.as_str(), "block" | "inline" | "x" | "y") && axis.is_none() {
            axis = Some(part);
        } else if (part == "none" || part.starts_with("--") && web_css_identifier(&part))
            && name.is_none()
        {
            name = Some(part);
        } else {
            inset.push(part);
        }
    }
    let inset = if inset.is_empty() {
        "auto".to_string()
    } else {
        let inset = inset.join(" ");
        web_view_timeline_inset(&StaticValue::String(inset.clone()))?;
        inset
    };
    Some(vec![
        web_longhand("view-timeline-name", name.unwrap_or_else(|| "none".to_string())),
        web_longhand("view-timeline-axis", axis.unwrap_or_else(|| "block".to_string())),
        web_longhand("view-timeline-inset", inset),
    ])
}

fn web_masonry_auto_flow(value: &StaticValue) -> Option<String> {
    let StaticValue::String(value) = value else { return None };
    let tokens = value.split_ascii_whitespace().collect::<Vec<_>>();
    if tokens.is_empty() || tokens.len() > 2 {
        return None;
    }
    let packing = tokens
        .iter()
        .filter(|token| matches!(**token, "pack" | "next"))
        .count();
    let ordering = tokens
        .iter()
        .filter(|token| matches!(**token, "definite-first" | "ordered"))
        .count();
    (packing <= 1 && ordering <= 1 && packing + ordering == tokens.len())
        .then(|| value.clone())
}

fn web_angle(value: &StaticValue, keywords: &[&str]) -> Option<String> {
    match value {
        StaticValue::Number(number) if number.is_finite() => Some(length_value(value)),
        StaticValue::String(value) if keywords.contains(&value.as_str()) => Some(value.clone()),
        StaticValue::String(value) if value == "0" => Some(value.clone()),
        StaticValue::String(value) => ["deg", "grad", "rad", "turn"]
            .iter()
            .find_map(|unit| value.strip_suffix(unit))?
            .parse::<f64>()
            .ok()
            .filter(|number| number.is_finite())
            .map(|_| value.clone()),
        StaticValue::Number(_) => None,
    }
}

fn web_text_decoration_skip(value: &StaticValue) -> Option<String> {
    let StaticValue::String(value) = value else { return None };
    if value == "none" {
        return Some(value.clone());
    }
    let choices = ["objects", "spaces", "ink", "edges", "box-decoration"];
    let tokens = value.split_ascii_whitespace().collect::<Vec<_>>();
    (tokens.len() <= choices.len()
        && !tokens.is_empty()
        && tokens.iter().all(|token| choices.contains(token))
        && tokens
            .iter()
            .enumerate()
            .all(|(index, token)| !tokens[..index].contains(token)))
    .then(|| value.clone())
}

fn web_counter_list(value: &StaticValue, allow_reversed: bool) -> Option<String> {
    let StaticValue::String(value) = value else {
        return None;
    };
    if value == "none" {
        return Some(value.clone());
    }
    let tokens = value.split_ascii_whitespace().collect::<Vec<_>>();
    let mut index = 0;
    while index < tokens.len() {
        let token = tokens[index];
        let identifier = allow_reversed
            .then(|| token.strip_prefix("reversed(")?.strip_suffix(')'))
            .flatten()
            .unwrap_or(token);
        if !web_css_identifier(identifier)
            || matches!(
                identifier,
                "none" | "inherit" | "initial" | "revert" | "revert-layer" | "unset"
            )
        {
            return None;
        }
        index += 1;
        if index < tokens.len() && tokens[index].parse::<i64>().is_ok() {
            index += 1;
        }
    }
    (!tokens.is_empty()).then(|| value.clone())
}

fn web_scrollbar_color(value: &StaticValue) -> Option<String> {
    let StaticValue::String(value) = value else {
        return None;
    };
    if value == "auto" {
        return Some(value.clone());
    }
    let colors = web_components(value)?;
    (colors.len() == 2 && colors.iter().all(|color| web_shorthand_color(color)))
        .then(|| value.clone())
}

fn web_quotes(value: &StaticValue) -> Option<String> {
    let StaticValue::String(value) = value else {
        return None;
    };
    if matches!(value.as_str(), "auto" | "none") {
        return Some(value.clone());
    }
    let strings = web_components(value)?;
    (strings.len() % 2 == 0 && strings.iter().all(|string| web_css_string(string)))
        .then(|| value.clone())
}

fn web_generated_content(value: &StaticValue) -> Option<String> {
    let StaticValue::String(value) = value else {
        return None;
    };
    if matches!(value.as_str(), "normal" | "none") {
        return Some(value.clone());
    }
    let components = web_components(value)?;
    let quote_keywords = ["open-quote", "close-quote", "no-open-quote", "no-close-quote"];
    components
        .iter()
        .all(|component| web_css_string(component) || quote_keywords.contains(&component.as_str()))
        .then(|| value.clone())
}

fn web_zoom(value: &StaticValue) -> Option<String> {
    match value {
        StaticValue::Number(number) if number.is_finite() && *number >= 0.0 => {
            Some(numeric_text(*number))
        }
        StaticValue::String(value) if matches!(value.as_str(), "normal" | "reset") => {
            Some(value.clone())
        }
        StaticValue::String(value) => value
            .strip_suffix('%')?
            .parse::<f64>()
            .ok()
            .filter(|number| number.is_finite() && *number >= 0.0)
            .map(|_| value.clone()),
        StaticValue::Number(_) => None,
    }
}

fn web_text_decoration(value: &StaticValue) -> Option<String> {
    let StaticValue::String(value) = value else {
        return None;
    };
    let components = web_components(value)?;
    let lines = ["underline", "overline", "line-through", "blink"];
    let styles = ["solid", "double", "dotted", "dashed", "wavy"];
    let mut found_lines = Vec::new();
    let mut has_style = false;
    let mut has_thickness = false;
    let mut has_color = false;
    for component in &components {
        if lines.contains(&component.as_str()) {
            if found_lines.contains(&component) {
                return None;
            }
            found_lines.push(component);
        } else if component == "none" {
            if components.len() != 1 {
                return None;
            }
            found_lines.push(component);
        } else if styles.contains(&component.as_str()) && !has_style {
            has_style = true;
        } else if !has_thickness
            && (matches!(component.as_str(), "auto" | "from-font")
                || web_length_percentage_string(component)
                    && web_length_number(component).is_some_and(|number| number >= 0.0))
        {
            has_thickness = true;
        } else if !has_color && web_shorthand_color(component) {
            has_color = true;
        } else {
            return None;
        }
    }
    (found_lines.len() <= lines.len()).then(|| value.clone())
}

fn web_text_emphasis(value: &StaticValue) -> Option<String> {
    let StaticValue::String(value) = value else {
        return None;
    };
    let components = web_components(value)?;
    let fills = ["filled", "open"];
    let shapes = ["dot", "circle", "double-circle", "triangle", "sesame"];
    let mut fill_count = 0;
    let mut shape_count = 0;
    let mut has_string = false;
    let mut has_none = false;
    let mut has_color = false;
    for component in &components {
        if fills.contains(&component.as_str()) && !has_string && !has_none {
            fill_count += 1;
        } else if shapes.contains(&component.as_str()) && !has_string && !has_none {
            shape_count += 1;
        } else if component == "none" && fill_count == 0 && shape_count == 0 && !has_string {
            has_none = true;
        } else if web_css_string(component)
            && fill_count == 0
            && shape_count == 0
            && !has_none
            && !has_string
        {
            has_string = true;
        } else if !has_color && web_shorthand_color(component) {
            has_color = true;
        } else {
            return None;
        }
    }
    (fill_count <= 1 && shape_count <= 1).then(|| value.clone())
}

fn web_outline(value: &StaticValue) -> Option<String> {
    const STYLES: &[&str] = &[
        "auto", "none", "hidden", "dotted", "dashed", "solid", "double", "groove", "ridge",
        "inset", "outset",
    ];
    let parts = match value {
        StaticValue::Number(number) if number.is_finite() && *number >= 0.0 => {
            return Some(length_value(value));
        }
        StaticValue::String(value) => web_components(value)?,
        _ => return None,
    };
    if parts.len() > 3 {
        return None;
    }
    let mut has_style = false;
    let mut has_width = false;
    let mut has_color = false;
    for part in parts {
        let part_value = StaticValue::String(part.clone());
        if !has_style && STYLES.contains(&part.as_str()) {
            has_style = true;
        } else if !has_width
            && web_length(&part_value, &["thin", "medium", "thick"], 0.0).is_some()
        {
            has_width = true;
        } else if !has_color && (part == "invert" || web_shorthand_color(&part)) {
            has_color = true;
        } else {
            return None;
        }
    }
    Some(match value {
        StaticValue::String(value) => value.clone(),
        _ => unreachable!("numeric outlines return above"),
    })
}

fn web_length_list(value: &StaticValue, minimum: usize, maximum: usize) -> Option<String> {
    if let StaticValue::Number(number) = value {
        return (minimum <= 1 && number.is_finite() && *number >= 0.0)
            .then(|| length_value(value));
    }
    let StaticValue::String(value) = value else {
        return None;
    };
    let parts = value.split_ascii_whitespace().collect::<Vec<_>>();
    (parts.len() >= minimum
        && parts.len() <= maximum
        && parts.iter().all(|part| {
            web_length_string(part)
                && web_length_number(part).is_some_and(|number| number >= 0.0)
        }))
    .then(|| value.clone())
}

fn web_integer(value: &StaticValue, minimum: i64, maximum: i64) -> Option<String> {
    let number = match value {
        StaticValue::Number(value) if value.is_finite() && value.fract() == 0.0 => *value,
        StaticValue::String(value) => value
            .parse::<f64>()
            .ok()
            .filter(|value| value.is_finite() && value.fract() == 0.0)?,
        _ => return None,
    };
    (number >= minimum as f64 && number <= maximum as f64).then(|| numeric_text(number))
}

fn web_clip_rect(value: &StaticValue) -> Option<String> {
    let StaticValue::String(value) = value else {
        return None;
    };
    if value == "auto" {
        return Some(value.clone());
    }
    let inside = value.strip_prefix("rect(")?.strip_suffix(')')?;
    let parts = inside
        .split([',', ' ', '\t', '\n', '\r'])
        .filter(|part| !part.is_empty())
        .collect::<Vec<_>>();
    (parts.len() == 4
        && parts
            .iter()
            .all(|part| *part == "auto" || web_length_string(part)))
    .then(|| value.clone())
}

fn web_contain(value: &StaticValue) -> Option<String> {
    let StaticValue::String(value) = value else {
        return None;
    };
    if matches!(value.as_str(), "none" | "strict" | "content") {
        return Some(value.clone());
    }
    let parts = value.split_ascii_whitespace().collect::<Vec<_>>();
    let allowed = ["size", "inline-size", "layout", "style", "paint"];
    (!parts.is_empty()
        && parts.iter().all(|part| allowed.contains(part))
        && parts.iter().enumerate().all(|(index, part)| !parts[..index].contains(part))
        && !(parts.contains(&"size") && parts.contains(&"inline-size")))
    .then(|| value.clone())
}

fn web_svg_length(value: &StaticValue) -> bool {
    match value {
        StaticValue::Number(value) => value.is_finite(),
        StaticValue::String(value) => {
            value.parse::<f64>().is_ok_and(f64::is_finite)
                || web_length_percentage_string(value)
        }
    }
}

fn web_number(value: &StaticValue, minimum: f64, maximum: f64) -> Option<String> {
    let number = match value {
        StaticValue::Number(value) => *value,
        StaticValue::String(value) => value.parse::<f64>().ok()?,
    };
    (number.is_finite() && number >= minimum && number <= maximum)
        .then(|| numeric_text(number))
}

fn web_number_percentage(value: &StaticValue, minimum: f64, maximum: f64) -> Option<String> {
    match value {
        StaticValue::String(value) if value.ends_with('%') => {
            let percentage = value.strip_suffix('%')?.parse::<f64>().ok()?;
            (percentage.is_finite()
                && percentage >= minimum * 100.0
                && percentage <= maximum * 100.0)
                .then(|| value.clone())
        }
        value => web_number(value, minimum, maximum),
    }
}

fn web_non_negative_number_token(value: &str) -> bool {
    value
        .parse::<f64>()
        .is_ok_and(|number| number.is_finite() && number >= 0.0)
}

fn web_border_image_slice(value: &StaticValue) -> Option<String> {
    if let StaticValue::Number(number) = value {
        return (number.is_finite() && *number >= 0.0).then(|| numeric_text(*number));
    }
    let StaticValue::String(value) = value else { return None };
    let parts = value.split_ascii_whitespace().collect::<Vec<_>>();
    let fill_count = parts.iter().filter(|part| **part == "fill").count();
    let slices = parts.iter().filter(|part| **part != "fill").copied().collect::<Vec<_>>();
    (fill_count <= 1
        && (1..=4).contains(&slices.len())
        && slices.iter().all(|part| {
            web_non_negative_number_token(part)
                || part.strip_suffix('%').is_some_and(web_non_negative_number_token)
        }))
    .then(|| parts.join(" "))
}

fn web_border_image_width(value: &StaticValue) -> Option<String> {
    if let StaticValue::Number(number) = value {
        return (number.is_finite() && *number >= 0.0).then(|| numeric_text(*number));
    }
    let StaticValue::String(value) = value else { return None };
    let parts = value.split_ascii_whitespace().collect::<Vec<_>>();
    ((1..=4).contains(&parts.len())
        && parts.iter().all(|part| {
            *part == "auto"
                || web_non_negative_number_token(part)
                || (web_length_percentage_string(part)
                    && web_length_number(part).is_some_and(|number| number >= 0.0))
        }))
    .then(|| parts.join(" "))
}

fn web_border_image_outset(value: &StaticValue) -> Option<String> {
    if let StaticValue::Number(number) = value {
        return (number.is_finite() && *number >= 0.0).then(|| numeric_text(*number));
    }
    let StaticValue::String(value) = value else { return None };
    let parts = value.split_ascii_whitespace().collect::<Vec<_>>();
    ((1..=4).contains(&parts.len())
        && parts.iter().all(|part| {
            web_non_negative_number_token(part)
                || (web_length_string(part)
                    && web_length_number(part).is_some_and(|number| number >= 0.0))
        }))
    .then(|| parts.join(" "))
}

fn web_border_image_repeat(value: &StaticValue) -> Option<String> {
    let StaticValue::String(value) = value else { return None };
    let parts = value.split_ascii_whitespace().collect::<Vec<_>>();
    ((1..=2).contains(&parts.len())
        && parts.iter().all(|part| matches!(*part, "stretch" | "repeat" | "round" | "space")))
    .then(|| parts.join(" "))
}

fn web_grid_track_breadth(value: &str, flex: bool, fit_content: bool) -> bool {
    if matches!(value, "auto" | "min-content" | "max-content") {
        return true;
    }
    if web_length_percentage_string(value)
        && web_length_number(value).is_some_and(|number| number >= 0.0)
    {
        return true;
    }
    if flex
        && value
            .strip_suffix("fr")
            .and_then(|number| number.parse::<f64>().ok())
            .is_some_and(|number| number.is_finite() && number > 0.0)
    {
        return true;
    }
    if fit_content {
        if let Some(inner) = value
            .strip_prefix("fit-content(")
            .and_then(|value| value.strip_suffix(')'))
        {
            return web_length_percentage_string(inner)
                && web_length_number(inner).is_some_and(|number| number >= 0.0);
        }
    }
    let Some(inner) = value
        .strip_prefix("minmax(")
        .and_then(|value| value.strip_suffix(')'))
    else {
        return false;
    };
    let Some((minimum, maximum)) = inner.split_once(',') else {
        return false;
    };
    web_grid_track_breadth(minimum, false, false)
        && web_grid_track_breadth(maximum, true, false)
}

fn web_grid_track_list(value: &StaticValue) -> Option<String> {
    let StaticValue::String(value) = value else { return None };
    let normalized = normalize_stylex_grid_value(value);
    let tracks = web_components(&normalized)?;
    tracks
        .iter()
        .all(|track| web_grid_track_breadth(track, true, true))
        .then_some(normalized)
}

fn web_grid_auto_flow(value: &StaticValue) -> Option<String> {
    let StaticValue::String(value) = value else { return None };
    let value = value.split_ascii_whitespace().collect::<Vec<_>>().join(" ");
    matches!(value.as_str(), "row" | "column" | "dense" | "row dense" | "column dense")
        .then_some(value)
}

fn web_grid_template_areas(value: &StaticValue) -> Option<String> {
    let StaticValue::String(value) = value else { return None };
    let value = value.trim();
    if value == "none" {
        return Some(value.to_string());
    }
    let rows = web_components(value)?;
    let mut cells = Vec::with_capacity(rows.len());
    for row in &rows {
        let quote = row.chars().next()?;
        if !matches!(quote, '\'' | '"') || !row.ends_with(quote) || row.len() < 2 {
            return None;
        }
        let row = row[1..row.len() - 1].split_ascii_whitespace().collect::<Vec<_>>();
        if row.is_empty()
            || row.iter().any(|cell| {
                !cell.chars().all(|character| character == '.') && !web_css_identifier(cell)
            })
        {
            return None;
        }
        cells.push(row);
    }
    let columns = cells.first()?.len();
    if cells.iter().any(|row| row.len() != columns) {
        return None;
    }
    let mut bounds: HashMap<&str, (usize, usize, usize, usize)> = HashMap::new();
    for (row, columns) in cells.iter().enumerate() {
        for (column, area) in columns.iter().enumerate() {
            if area.chars().all(|character| character == '.') {
                continue;
            }
            bounds
                .entry(area)
                .and_modify(|bounds| {
                    bounds.1 = row;
                    bounds.2 = column.min(bounds.2);
                    bounds.3 = column.max(bounds.3);
                })
                .or_insert((row, row, column, column));
        }
    }
    for (area, (row_start, row_end, column_start, column_end)) in bounds {
        if (row_start..=row_end).any(|row| {
            (column_start..=column_end).any(|column| cells[row][column] != area)
        }) {
            return None;
        }
    }
    Some(rows.join(" "))
}

fn web_svg_dasharray(value: &StaticValue) -> Option<String> {
    let StaticValue::String(value) = value else {
        return None;
    };
    if value == "none" {
        return Some(value.clone());
    }
    let mut saw_length = false;
    for part in value.split([',', ' ', '\t', '\n', '\r']).filter(|part| !part.is_empty()) {
        if !(part.parse::<f64>().is_ok_and(f64::is_finite)
            || web_length_percentage_string(part))
            || part
                .trim_end_matches(|character: char| character.is_ascii_alphabetic() || character == '%')
                .parse::<f64>()
                .is_ok_and(|number| number < 0.0)
        {
            return None;
        }
        saw_length = true;
    }
    saw_length.then(|| value.clone())
}

fn web_url_or_none(value: &StaticValue) -> Option<String> {
    let StaticValue::String(value) = value else {
        return None;
    };
    (value == "none"
        || (value.starts_with("url(")
            && value.ends_with(')')
            && !value.contains(['\n', '\r', ';', '{', '}'])))
    .then(|| value.clone())
}

fn web_signed_time(value: &StaticValue) -> Option<String> {
    let StaticValue::String(value) = value else {
        return None;
    };
    let (number, milliseconds) = if let Some(number) = value.strip_suffix("ms") {
        (number.parse::<f64>().ok()?, true)
    } else {
        (value.strip_suffix('s')?.parse::<f64>().ok()?, false)
    };
    if !number.is_finite() {
        return None;
    }
    // StyleX's CSS minifier currently leaves negative times in their input
    // unit, while non-negative times use the shorter exact spelling.
    if number < 0.0 {
        return Some(value.clone());
    }
    let milliseconds_value = if milliseconds { number } else { number * 1000.0 };
    let in_ms = format!("{}ms", minified_css_number(milliseconds_value));
    let in_seconds = format!("{}s", minified_css_number(milliseconds_value / 1000.0));
    if in_ms.len() < in_seconds.len() {
        Some(in_ms)
    } else if in_seconds.len() < in_ms.len() {
        Some(in_seconds)
    } else if milliseconds {
        Some(in_ms)
    } else {
        Some(in_seconds)
    }
}

fn minified_css_number(value: f64) -> String {
    let value = numeric_text(value);
    value
        .strip_prefix("0.")
        .map(|fraction| format!(".{fraction}"))
        .or_else(|| value.strip_prefix("-0.").map(|fraction| format!("-.{fraction}")))
        .unwrap_or(value)
}

fn web_animation_timing_function(value: &StaticValue) -> Option<String> {
    let StaticValue::String(value) = value else {
        return None;
    };
    if matches!(
        value.as_str(),
        "linear" | "ease" | "ease-in" | "ease-out" | "ease-in-out" | "step-start" | "step-end"
    ) {
        return Some(value.clone());
    }
    if let Some(arguments) = value
        .strip_prefix("cubic-bezier(")
        .and_then(|value| value.strip_suffix(')'))
    {
        let numbers = arguments
            .split(',')
            .map(|part| part.trim().parse::<f64>().ok().filter(|value| value.is_finite()))
            .collect::<Option<Vec<_>>>()?;
        if numbers.len() != 4 || !(0.0..=1.0).contains(&numbers[0]) || !(0.0..=1.0).contains(&numbers[2]) {
            return None;
        }
        return Some(format!(
            "cubic-bezier({},{},{},{})",
            minified_css_number(numbers[0]),
            minified_css_number(numbers[1]),
            minified_css_number(numbers[2]),
            minified_css_number(numbers[3])
        ));
    }
    let arguments = value
        .strip_prefix("steps(")
        .and_then(|value| value.strip_suffix(')'))?;
    let parts = arguments.split(',').map(str::trim).collect::<Vec<_>>();
    if !(1..=2).contains(&parts.len()) {
        return None;
    }
    let count = parts[0].parse::<u32>().ok().filter(|count| *count > 0)?;
    let position = parts.get(1).copied();
    if position.is_some_and(|position| {
        !matches!(
            position,
            "jump-start" | "jump-end" | "jump-none" | "jump-both" | "start" | "end"
        )
    }) || position == Some("jump-none") && count == 1
    {
        return None;
    }
    Some(match position {
        Some(position) => format!("steps({count},{position})"),
        None => format!("steps({count})"),
    })
}

fn minify_css_commas(value: &str) -> String {
    let mut output = String::with_capacity(value.len());
    let mut characters = value.chars().peekable();
    let mut quote = None;
    let mut escaped = false;
    while let Some(character) = characters.next() {
        if escaped {
            output.push(character);
            escaped = false;
            continue;
        }
        if character == '\\' && quote.is_some() {
            output.push(character);
            escaped = true;
            continue;
        }
        if let Some(active_quote) = quote {
            output.push(character);
            if character == active_quote {
                quote = None;
            }
            continue;
        }
        if matches!(character, '\'' | '"') {
            quote = Some(character);
            output.push(character);
        } else if character == ',' {
            while output.ends_with(char::is_whitespace) {
                output.pop();
            }
            output.push(',');
            while characters.peek().is_some_and(|next| next.is_whitespace()) {
                characters.next();
            }
        } else {
            output.push(character);
        }
    }
    output
}

fn web_single_function(value: &str, names: &[&str]) -> bool {
    if value.contains([';', '{', '}', '\n', '\r']) || !value.ends_with(')') {
        return false;
    }
    let Some(open) = value.find('(') else { return false };
    if !names.contains(&value[..open].trim()) {
        return false;
    }
    let mut depth = 0_u32;
    for (index, character) in value.char_indices().skip(open) {
        match character {
            '(' => depth += 1,
            ')' => {
                let Some(next) = depth.checked_sub(1) else { return false };
                depth = next;
                if depth == 0 && index + character.len_utf8() != value.len() {
                    return false;
                }
            }
            _ => {}
        }
    }
    depth == 0
}

fn web_clip_path(value: &StaticValue) -> Option<String> {
    let StaticValue::String(value) = value else { return None };
    let value = value.trim();
    if value == "none" || web_url_or_none(&StaticValue::String(value.to_string())).is_some() {
        return Some(value.to_string());
    }
    web_single_function(value, &["circle", "ellipse", "inset", "polygon", "path"])
        .then(|| minify_css_commas(value))
}

fn web_perspective_origin(value: &StaticValue) -> Option<String> {
    let StaticValue::String(value) = value else { return None };
    let parts = value.split_ascii_whitespace().collect::<Vec<_>>();
    ((1..=2).contains(&parts.len())
        && parts.iter().all(|part| {
            matches!(*part, "left" | "center" | "right" | "top" | "bottom")
                || transform_dimension(part).is_some()
        }))
    .then(|| parts.join(" "))
}

fn web_will_change(value: &StaticValue) -> Option<String> {
    let StaticValue::String(value) = value else { return None };
    if value == "auto" {
        return Some(value.clone());
    }
    let names = web_comma_groups(value)?;
    names
        .iter()
        .all(|name| {
            web_css_identifier(name)
                && !matches!(*name, "auto" | "initial" | "inherit" | "revert" | "unset")
        })
        .then(|| names.join(","))
}

fn web_comma_keyword_groups(
    value: &StaticValue,
    keywords: &[&str],
    minimum: usize,
    maximum: usize,
) -> Option<String> {
    let StaticValue::String(value) = value else { return None };
    let groups = web_comma_groups(value)?;
    groups
        .iter()
        .all(|group| {
            let words = group.split_ascii_whitespace().collect::<Vec<_>>();
            (minimum..=maximum).contains(&words.len())
                && words.iter().all(|word| keywords.contains(word))
        })
        .then(|| groups.join(","))
}

fn web_mask_image(value: &StaticValue) -> Option<String> {
    let StaticValue::String(value) = value else { return None };
    let groups = web_comma_groups(value)?;
    groups
        .iter()
        .all(|image| {
            *image == "none"
                || web_url_or_none(&StaticValue::String((*image).to_string())).is_some()
                || web_single_function(
                    image,
                    &[
                        "linear-gradient",
                        "radial-gradient",
                        "conic-gradient",
                        "repeating-linear-gradient",
                        "repeating-radial-gradient",
                        "repeating-conic-gradient",
                    ],
                )
        })
        .then(|| minify_css_commas(value))
}

fn web_mask_position(value: &StaticValue) -> Option<String> {
    let StaticValue::String(value) = value else { return None };
    let groups = web_comma_groups(value)?;
    groups
        .iter()
        .all(|position| {
            let parts = position.split_ascii_whitespace().collect::<Vec<_>>();
            (1..=4).contains(&parts.len())
                && parts.iter().all(|part| {
                    matches!(*part, "left" | "center" | "right" | "top" | "bottom")
                        || transform_dimension(part).is_some()
                })
        })
        .then(|| groups.join(","))
}

fn web_mask_size(value: &StaticValue) -> Option<String> {
    let StaticValue::String(value) = value else { return None };
    let groups = web_comma_groups(value)?;
    groups
        .iter()
        .all(|size| {
            if matches!(*size, "cover" | "contain") {
                return true;
            }
            let parts = size.split_ascii_whitespace().collect::<Vec<_>>();
            (1..=2).contains(&parts.len())
                && parts.iter().all(|part| {
                    *part == "auto"
                        || (web_length_percentage_string(part)
                            && web_length_number(part).is_some_and(|number| number >= 0.0))
                })
        })
        .then(|| groups.join(","))
}

fn web_offset_path(value: &StaticValue) -> Option<String> {
    let StaticValue::String(value) = value else { return None };
    let value = value.trim();
    if value == "none" || web_url_or_none(&StaticValue::String(value.to_string())).is_some() {
        return Some(value.to_string());
    }
    web_single_function(
        value,
        &["path", "ray", "circle", "ellipse", "inset", "polygon"],
    )
    .then(|| minify_css_commas(value))
}

fn web_offset_position(value: &StaticValue, keywords: &[&str]) -> Option<String> {
    let StaticValue::String(value) = value else { return None };
    if keywords.contains(&value.as_str()) {
        return Some(value.clone());
    }
    let parts = value.split_ascii_whitespace().collect::<Vec<_>>();
    ((1..=4).contains(&parts.len())
        && parts.iter().all(|part| {
            matches!(*part, "left" | "center" | "right" | "top" | "bottom")
                || transform_dimension(part).is_some()
        }))
    .then(|| parts.join(" "))
}

fn web_offset_rotate(value: &StaticValue) -> Option<String> {
    let StaticValue::String(value) = value else { return None };
    let parts = value.split_ascii_whitespace().collect::<Vec<_>>();
    if !(1..=2).contains(&parts.len()) {
        return None;
    }
    let keyword_count = parts
        .iter()
        .filter(|part| matches!(**part, "auto" | "reverse"))
        .count();
    let angle_count = parts
        .iter()
        .filter(|part| transform_angle(part).is_some())
        .count();
    (keyword_count <= 1
        && angle_count <= 1
        && keyword_count + angle_count == parts.len())
    .then(|| parts.join(" "))
}

fn web_shape_outside(value: &StaticValue) -> Option<String> {
    let StaticValue::String(value) = value else { return None };
    let value = value.trim();
    if matches!(
        value,
        "none" | "margin-box" | "border-box" | "padding-box" | "content-box"
    ) || web_url_or_none(&StaticValue::String(value.to_string())).is_some()
    {
        return Some(value.to_string());
    }
    web_single_function(value, &["circle", "ellipse", "inset", "polygon"])
        .then(|| minify_css_commas(value))
}

fn web_css_string(value: &str) -> bool {
    let mut characters = value.chars();
    let Some(quote @ ('\'' | '"')) = characters.next() else {
        return false;
    };
    if value.len() < 2 || !value.ends_with(quote) {
        return false;
    }
    let mut escaped = false;
    for character in value[quote.len_utf8()..value.len() - quote.len_utf8()].chars() {
        if matches!(character, '\n' | '\r' | '\0') {
            return false;
        }
        if escaped {
            escaped = false;
        } else if character == '\\' {
            escaped = true;
        } else if character == quote {
            return false;
        }
    }
    !escaped
}

fn web_css_identifier(value: &str) -> bool {
    let mut characters = value.chars();
    let Some(first) = characters.next() else { return false };
    let valid_start = first.is_ascii_alphabetic()
        || first == '_'
        || (first == '-'
            && characters
                .clone()
                .next()
                .is_some_and(|next| next.is_ascii_alphabetic() || matches!(next, '_' | '-')));
    valid_start
        && characters.all(|character| {
            character.is_ascii_alphanumeric() || matches!(character, '-' | '_')
        })
}

fn web_comma_groups(value: &str) -> Option<Vec<&str>> {
    if value.contains([';', '{', '}', '\n', '\r']) {
        return None;
    }
    let mut groups = Vec::new();
    let mut start = 0;
    let mut depth = 0_u32;
    let mut quote = None;
    let mut escaped = false;
    for (index, character) in value.char_indices() {
        if escaped {
            escaped = false;
            continue;
        }
        if character == '\\' && quote.is_some() {
            escaped = true;
            continue;
        }
        if let Some(active_quote) = quote {
            if character == active_quote {
                quote = None;
            }
            continue;
        }
        match character {
            '\'' | '"' => quote = Some(character),
            '(' => depth += 1,
            ')' => depth = depth.checked_sub(1)?,
            ',' if depth == 0 => {
                let group = value[start..index].trim();
                if group.is_empty() {
                    return None;
                }
                groups.push(group);
                start = index + character.len_utf8();
            }
            _ => {}
        }
    }
    if depth != 0 || quote.is_some() || escaped {
        return None;
    }
    let group = value[start..].trim();
    if group.is_empty() {
        return None;
    }
    groups.push(group);
    Some(groups)
}

fn web_font_setting(value: &StaticValue, variation: bool) -> Option<String> {
    let StaticValue::String(value) = value else { return None };
    if value == "normal" {
        return Some(value.clone());
    }
    for group in web_comma_groups(value)? {
        let parts = web_components(group)?;
        if parts.is_empty() || parts.len() > 2 || !web_css_string(&parts[0]) {
            return None;
        }
        let tag = &parts[0][1..parts[0].len() - 1];
        if tag.len() != 4 || !tag.bytes().all(|byte| (0x20..=0x7e).contains(&byte)) {
            return None;
        }
        let Some(setting) = parts.get(1) else {
            if variation {
                return None;
            }
            continue;
        };
        if variation {
            if !setting.parse::<f64>().is_ok_and(f64::is_finite) {
                return None;
            }
        } else if !matches!(setting.as_str(), "on" | "off")
            && setting.parse::<u64>().is_err()
        {
            return None;
        }
    }
    Some(value.clone())
}

fn web_font_synthesis(value: &StaticValue) -> Option<String> {
    let StaticValue::String(value) = value else { return None };
    if value == "none" {
        return Some(value.clone());
    }
    let parts = value.split_ascii_whitespace().collect::<Vec<_>>();
    let allowed = ["weight", "style", "small-caps", "position"];
    (!parts.is_empty()
        && parts.iter().all(|part| allowed.contains(part))
        && parts.iter().enumerate().all(|(index, part)| !parts[..index].contains(part)))
    .then(|| value.clone())
}

fn web_font_variant_alternates(value: &StaticValue) -> Option<String> {
    let StaticValue::String(value) = value else { return None };
    if matches!(value.as_str(), "normal" | "historical-forms") {
        return Some(value.clone());
    }
    let parts = web_components(value)?;
    let mut kinds = Vec::new();
    for part in &parts {
        let open = part.find('(')?;
        let kind = &part[..open];
        let inner = part[open + 1..].strip_suffix(')')?;
        if !matches!(
            kind,
            "stylistic" | "styleset" | "character-variant" | "swash" | "ornaments"
                | "annotation"
        ) || kinds.contains(&kind)
        {
            return None;
        }
        let names = inner.split(',').map(str::trim).collect::<Vec<_>>();
        if names.is_empty()
            || names.iter().any(|name| !web_css_identifier(name))
            || (!matches!(kind, "styleset" | "character-variant") && names.len() != 1)
        {
            return None;
        }
        kinds.push(kind);
    }
    Some(value.clone())
}

fn web_font_variant_east_asian(value: &StaticValue) -> Option<String> {
    let StaticValue::String(value) = value else { return None };
    if value == "normal" {
        return Some(value.clone());
    }
    let parts = value.split_ascii_whitespace().collect::<Vec<_>>();
    let variants = ["jis78", "jis83", "jis90", "jis04", "simplified", "traditional"];
    let widths = ["full-width", "proportional-width"];
    let variant_count = parts.iter().filter(|part| variants.contains(part)).count();
    let width_count = parts.iter().filter(|part| widths.contains(part)).count();
    (!parts.is_empty()
        && parts
            .iter()
            .all(|part| variants.contains(part) || widths.contains(part) || *part == "ruby")
        && variant_count <= 1
        && width_count <= 1
        && parts.iter().filter(|part| **part == "ruby").count() <= 1)
    .then(|| value.clone())
}

fn web_hanging_punctuation(value: &StaticValue) -> Option<String> {
    let StaticValue::String(value) = value else { return None };
    if value == "none" {
        return Some(value.clone());
    }
    let parts = value.split_ascii_whitespace().collect::<Vec<_>>();
    let allowed = ["first", "force-end", "allow-end", "last"];
    (!parts.is_empty()
        && parts.iter().all(|part| allowed.contains(part))
        && parts.iter().enumerate().all(|(index, part)| !parts[..index].contains(part))
        && !(parts.contains(&"force-end") && parts.contains(&"allow-end")))
    .then(|| value.clone())
}

fn web_tab_size(value: &StaticValue) -> Option<String> {
    match value {
        StaticValue::Number(value) if value.is_finite() && *value >= 0.0 => {
            Some(numeric_text(*value))
        }
        StaticValue::String(value)
            if value
                .parse::<f64>()
                .is_ok_and(|number| number.is_finite() && number >= 0.0) =>
        {
            Some(value.clone())
        }
        StaticValue::String(value)
            if web_length_string(value)
                && web_length_number(value).is_some_and(|number| number >= 0.0) =>
        {
            Some(value.clone())
        }
        _ => None,
    }
}

fn web_text_combine_upright(value: &StaticValue) -> Option<String> {
    let StaticValue::String(value) = value else { return None };
    if matches!(value.as_str(), "none" | "all") {
        return Some(value.clone());
    }
    value
        .strip_prefix("digits ")
        .is_some_and(|count| matches!(count, "2" | "3" | "4"))
        .then(|| value.clone())
}

fn web_text_emphasis_style(value: &StaticValue) -> Option<String> {
    let StaticValue::String(value) = value else { return None };
    if value == "none" || web_css_string(value) {
        return Some(value.clone());
    }
    let parts = value.split_ascii_whitespace().collect::<Vec<_>>();
    let fills = ["filled", "open"];
    let shapes = ["dot", "circle", "double-circle", "triangle", "sesame"];
    (!parts.is_empty()
        && parts.iter().all(|part| fills.contains(part) || shapes.contains(part))
        && parts.iter().filter(|part| fills.contains(part)).count() <= 1
        && parts.iter().filter(|part| shapes.contains(part)).count() <= 1)
    .then(|| value.clone())
}

/// Split one CSS component list without cutting whitespace inside functions
/// or quoted strings. The supported shorthands do not need a complete CSS
/// parser, but ordinary values such as `rgb(0 0 0)` must remain one token.
fn web_components(value: &str) -> Option<Vec<String>> {
    let mut parts = Vec::new();
    let mut current = String::new();
    let mut depth = 0_u32;
    let mut quote = None;
    let mut escaped = false;
    for character in value.chars() {
        if escaped {
            current.push(character);
            escaped = false;
            continue;
        }
        if character == '\\' && quote.is_some() {
            current.push(character);
            escaped = true;
            continue;
        }
        if let Some(active_quote) = quote {
            current.push(character);
            if character == active_quote {
                quote = None;
            }
            continue;
        }
        match character {
            '\'' | '"' => {
                quote = Some(character);
                current.push(character);
            }
            '(' => {
                depth += 1;
                current.push(character);
            }
            ')' => {
                depth = depth.checked_sub(1)?;
                current.push(character);
            }
            character if character.is_whitespace() && depth == 0 => {
                if !current.is_empty() {
                    parts.push(std::mem::take(&mut current));
                }
            }
            _ => current.push(character),
        }
    }
    if depth != 0 || quote.is_some() {
        return None;
    }
    if !current.is_empty() {
        parts.push(current);
    }
    (!parts.is_empty()).then_some(parts)
}

fn web_longhand(property: &str, value: impl Into<String>) -> StyleProperty {
    StyleProperty::WebOnly(property.to_string(), value.into())
}

fn web_shorthand_color(value: &str) -> bool {
    if value.contains([';', '{', '}']) {
        return false;
    }
    let lower = value.to_ascii_lowercase();
    matches!(
        lower.as_str(),
        "transparent" | "currentcolor" | "black" | "silver" | "gray" | "white"
            | "maroon" | "red" | "purple" | "fuchsia" | "green" | "lime" | "olive"
            | "yellow" | "navy" | "blue" | "teal" | "aqua" | "orange"
    ) || (lower.starts_with('#')
        && matches!(lower.len(), 4 | 5 | 7 | 9)
        && lower[1..].bytes().all(|byte| byte.is_ascii_hexdigit()))
        || [
            "rgb(", "rgba(", "hsl(", "hsla(", "hwb(", "lab(", "lch(", "oklab(",
            "oklch(", "color(",
        ]
        .iter()
        .any(|prefix| lower.starts_with(prefix) && lower.ends_with(')'))
}

fn portable_text_shadow_color(value: &str) -> bool {
    let lower = value.to_ascii_lowercase();
    if matches!(
        lower.as_str(),
        "transparent" | "black" | "silver" | "gray" | "white" | "maroon" | "red"
            | "purple" | "fuchsia" | "green" | "lime" | "olive" | "yellow" | "navy"
            | "blue" | "teal" | "aqua" | "orange"
    ) || (lower.starts_with('#')
        && matches!(lower.len(), 4 | 5 | 7 | 9)
        && lower[1..].bytes().all(|byte| byte.is_ascii_hexdigit()))
    {
        return true;
    }

    let inner = lower
        .strip_prefix("rgb(")
        .or_else(|| lower.strip_prefix("rgba("))
        .and_then(|value| value.strip_suffix(')'));
    let Some(inner) = inner else { return false };
    let parts = inner.split(',').map(str::trim).collect::<Vec<_>>();
    if !matches!(parts.len(), 3 | 4) {
        return false;
    }
    parts.iter().all(|part| {
        let number = part.strip_suffix('%').unwrap_or(part).parse::<f64>();
        number.is_ok_and(f64::is_finite)
    })
}

fn has_top_level_comma(value: &str) -> bool {
    let mut depth = 0_u32;
    let mut quote = None;
    let mut escaped = false;
    for character in value.chars() {
        if escaped {
            escaped = false;
            continue;
        }
        if character == '\\' && quote.is_some() {
            escaped = true;
            continue;
        }
        if let Some(active_quote) = quote {
            if character == active_quote {
                quote = None;
            }
            continue;
        }
        match character {
            '\'' | '"' => quote = Some(character),
            '(' => depth += 1,
            ')' => depth = depth.saturating_sub(1),
            ',' if depth == 0 => return true,
            _ => {}
        }
    }
    false
}

/// The exact intersection of CSS `text-shadow` and React Native's three
/// text-shadow fields. Multiple layers and relative/dynamic lengths stay in
/// the official StyleX transform; a single px layer can be losslessly split.
fn stylex_text_shadow(value: &StaticValue) -> Option<TextShadowValue> {
    let StaticValue::String(value) = value else { return None };
    let value = value.trim();
    if value == "none" {
        return Some(TextShadowValue::Portable {
            css: value.to_string(),
            color: Color::Css("transparent".to_string()),
            offset_x: Length::Px(0.0),
            offset_y: Length::Px(0.0),
            radius: Length::Px(0.0),
        });
    }
    if has_top_level_comma(value) {
        return None;
    }

    let mut color = None;
    let mut lengths = Vec::new();
    for part in web_components(value)? {
        if portable_text_shadow_color(&part) {
            if color.replace(Color::Css(part)).is_some() {
                return None;
            }
            continue;
        }
        let length = px_length(&StaticValue::String(part))?;
        if !matches!(length, Length::Px(number) if number.is_finite()) {
            return None;
        }
        lengths.push(length);
    }
    if !(2..=3).contains(&lengths.len()) {
        return None;
    }
    let radius = lengths.get(2).cloned().unwrap_or(Length::Px(0.0));
    if !matches!(radius, Length::Px(number) if number >= 0.0) {
        return None;
    }
    Some(TextShadowValue::Portable {
        css: normalize_stylex_number_zeros(&normalize_stylex_grid_value(value)),
        color: color?,
        offset_x: lengths[0].clone(),
        offset_y: lengths[1].clone(),
        radius,
    })
}

fn stylex_place_content(value: &StaticValue) -> Option<Vec<StyleProperty>> {
    let StaticValue::String(value) = value else { return None };
    let parts = value.split_ascii_whitespace().collect::<Vec<_>>();
    if !(1..=2).contains(&parts.len()) {
        return None;
    }
    let alignment = |value| {
        Some(match value {
            "flex-start" => Justify::Start,
            "center" => Justify::Center,
            "flex-end" => Justify::End,
            "space-between" => Justify::Between,
            "space-around" => Justify::Around,
            "space-evenly" => Justify::Evenly,
            _ => return None,
        })
    };
    let align = alignment(parts[0])?;
    let justify = alignment(parts.get(1).copied().unwrap_or(parts[0]))?;
    Some(vec![
        StyleProperty::AlignContent(align),
        StyleProperty::JustifyContent(justify),
    ])
}

fn stylex_columns(value: &StaticValue) -> Option<Vec<StyleProperty>> {
    let mut width = "auto".to_string();
    let mut count = "auto".to_string();
    match value {
        // StyleX treats a numeric shorthand value as a length and appends px.
        StaticValue::Number(number) if number.is_finite() && *number > 0.0 => {
            width = format!("{}px", numeric_text(*number));
        }
        StaticValue::String(value) if value == "auto" => {}
        StaticValue::String(value) => {
            let parts = web_components(value)?;
            if parts.len() > 2 {
                return None;
            }
            for part in parts {
                let part_value = StaticValue::String(part.clone());
                if count == "auto" && web_integer(&part_value, 1, i64::MAX).is_some() {
                    count = part;
                } else if width == "auto"
                    && web_length(&part_value, &[], f64::MIN_POSITIVE).is_some()
                {
                    width = part;
                } else {
                    return None;
                }
            }
        }
        _ => return None,
    }
    Some(vec![
        web_longhand("column-width", width),
        web_longhand("column-count", count),
    ])
}

fn stylex_column_rule(value: &StaticValue) -> Option<Vec<StyleProperty>> {
    const STYLES: &[&str] = &[
        "none", "hidden", "dotted", "dashed", "solid", "double", "groove", "ridge",
        "inset", "outset",
    ];
    let mut width = "medium".to_string();
    let mut style = "none".to_string();
    let mut color = "currentcolor".to_string();
    let mut saw_width = false;
    let mut saw_style = false;
    let mut saw_color = false;
    let parts = match value {
        StaticValue::Number(number) if number.is_finite() && *number >= 0.0 => {
            vec![format!("{}px", numeric_text(*number))]
        }
        StaticValue::String(value) => web_components(value)?,
        _ => return None,
    };
    if parts.len() > 3 {
        return None;
    }
    for part in parts {
        let part_value = StaticValue::String(part.clone());
        if !saw_style && STYLES.contains(&part.as_str()) {
            style = part;
            saw_style = true;
        } else if !saw_width
            && web_length(&part_value, &["thin", "medium", "thick"], 0.0).is_some()
        {
            width = part;
            saw_width = true;
        } else if !saw_color
            && web_shorthand_color(&part)
        {
            color = part;
            saw_color = true;
        } else {
            return None;
        }
    }
    Some(vec![
        web_longhand("column-rule-width", width),
        web_longhand("column-rule-style", style),
        web_longhand("column-rule-color", color),
    ])
}

fn stylex_list_style(value: &StaticValue) -> Option<Vec<StyleProperty>> {
    const TYPES: &[&str] = &[
        "none", "disc", "circle", "square", "decimal", "decimal-leading-zero",
        "lower-roman", "upper-roman", "lower-greek", "lower-latin", "upper-latin",
        "armenian", "georgian", "lower-alpha", "upper-alpha",
    ];
    let StaticValue::String(value) = value else {
        return None;
    };
    if matches!(value.as_str(), "inherit" | "initial" | "revert" | "unset") {
        return Some(vec![
            web_longhand("list-style-type", value.clone()),
            web_longhand("list-style-position", value.clone()),
            web_longhand("list-style-image", value.clone()),
        ]);
    }
    let mut kind = "disc".to_string();
    let mut position = "outside".to_string();
    let mut image = "none".to_string();
    let mut saw_kind = false;
    let mut saw_position = false;
    let mut saw_image = false;
    for part in web_components(value)? {
        if !saw_position && matches!(part.as_str(), "inside" | "outside") {
            position = part;
            saw_position = true;
        } else if !saw_kind && TYPES.contains(&part.as_str()) {
            kind = part;
            saw_kind = true;
        } else if !saw_image
            && web_url_or_none(&StaticValue::String(part.clone())).is_some()
        {
            image = part;
            saw_image = true;
        } else {
            return None;
        }
    }
    Some(vec![
        web_longhand("list-style-type", kind),
        web_longhand("list-style-position", position),
        web_longhand("list-style-image", image),
    ])
}

fn stylex_box_lengths(value: &StaticValue) -> Option<[Length; 4]> {
    let parts = match value {
        StaticValue::Number(_) => vec![value.clone()],
        StaticValue::String(value) => web_components(value)?
            .into_iter()
            .map(StaticValue::String)
            .collect(),
    };
    if !(1..=4).contains(&parts.len()) {
        return None;
    }
    let lengths = parts
        .iter()
        .map(px_length)
        .collect::<Option<Vec<_>>>()?;
    if !lengths.iter().all(|length| matches!(length, Length::Px(value) if value.is_finite())) {
        return None;
    }
    let top = lengths[0].clone();
    let right = lengths.get(1).unwrap_or(&top).clone();
    let bottom = lengths.get(2).unwrap_or(&top).clone();
    let left = lengths.get(3).unwrap_or(&right).clone();
    Some([top, right, bottom, left])
}

fn stylex_scroll_box(value: &StaticValue, padding: bool) -> Option<Vec<StyleProperty>> {
    let lengths = stylex_box_lengths(value)?;
    if padding
        && lengths
            .iter()
            .any(|length| matches!(length, Length::Px(value) if *value < 0.0))
    {
        return None;
    }
    let [top, right, bottom, left] = lengths;
    let property = |edge, value| {
        if padding {
            StyleProperty::ScrollPadding(edge, value)
        } else {
            StyleProperty::ScrollMargin(edge, value)
        }
    };
    Some(vec![
        property(Edge::Top, top),
        property(Edge::Right, right),
        property(Edge::Bottom, bottom),
        property(Edge::Left, left),
    ])
}

fn stylex_scroll_axis(
    value: &StaticValue,
    padding: bool,
    start: Edge,
    end: Edge,
) -> Option<Vec<StyleProperty>> {
    let parts = match value {
        StaticValue::Number(_) => vec![value.clone()],
        StaticValue::String(value) => web_components(value)?
            .into_iter()
            .map(StaticValue::String)
            .collect(),
    };
    if !(1..=2).contains(&parts.len()) {
        return None;
    }
    let lengths = parts
        .iter()
        .map(px_length)
        .collect::<Option<Vec<_>>>()?;
    if !lengths
        .iter()
        .all(|length| matches!(length, Length::Px(value) if value.is_finite() && (!padding || *value >= 0.0)))
    {
        return None;
    }
    let start_value = lengths[0].clone();
    let end_value = lengths.get(1).unwrap_or(&start_value).clone();
    let property = |edge, value| {
        if padding {
            StyleProperty::ScrollPadding(edge, value)
        } else {
            StyleProperty::ScrollMargin(edge, value)
        }
    };
    Some(vec![
        property(start, start_value),
        property(end, end_value),
    ])
}

fn web_only_property(property: &str, value: &StaticValue) -> Option<StyleProperty> {
    let (css_property, grammar) = web_only_spec(property)?;
    let value = match grammar {
        WebValueGrammar::Keywords(choices) => {
            let StaticValue::String(value) = value else { return None };
            choices.contains(&value.as_str()).then(|| value.clone())?
        }
        WebValueGrammar::Length { keywords, minimum } => {
            web_length(value, keywords, minimum)?
        }
        WebValueGrammar::LengthPercentage(keywords) => match value {
            StaticValue::String(value) if keywords.contains(&value.as_str()) => value.clone(),
            value if web_length_percentage(value) => length_value(value),
            _ => return None,
        },
        WebValueGrammar::NonNegativeLengthPercentage(keywords) => match value {
            StaticValue::String(value) if keywords.contains(&value.as_str()) => value.clone(),
            StaticValue::Number(value) if value.is_finite() && *value >= 0.0 => {
                format!("{}px", numeric_text(*value))
            }
            StaticValue::String(value)
                if web_length_percentage_string(value)
                    && web_length_number(value).is_some_and(|number| number >= 0.0) =>
            {
                value.clone()
            }
            _ => return None,
        },
        WebValueGrammar::LengthList { minimum, maximum } => {
            web_length_list(value, minimum, maximum)?
        }
        WebValueGrammar::SvgLength(keywords) => match value {
            StaticValue::String(value) if keywords.contains(&value.as_str()) => value.clone(),
            value if web_svg_length(value) => raw_value(value),
            _ => return None,
        },
        WebValueGrammar::Color => {
            css_color(value)?;
            raw_value(value)
        }
        WebValueGrammar::Integer {
            keywords,
            minimum,
            maximum,
        } => match value {
            StaticValue::String(value) if keywords.contains(&value.as_str()) => value.clone(),
            value => web_integer(value, minimum, maximum)?,
        },
        WebValueGrammar::Number { minimum, maximum } => web_number(value, minimum, maximum)?,
        WebValueGrammar::NumberWithKeywords {
            keywords,
            minimum,
            maximum,
        } => match value {
            StaticValue::String(value) if keywords.contains(&value.as_str()) => value.clone(),
            value => web_number(value, minimum, maximum)?,
        },
        WebValueGrammar::NumberPercentage { minimum, maximum } => {
            web_number_percentage(value, minimum, maximum)?
        }
        WebValueGrammar::ClipRect => web_clip_rect(value)?,
        WebValueGrammar::ClipPath => web_clip_path(value)?,
        WebValueGrammar::Contain => web_contain(value)?,
        WebValueGrammar::ContainIntrinsicSize { axes } => {
            web_contain_intrinsic_size(value, axes)?
        }
        WebValueGrammar::OverflowClipMargin => web_overflow_clip_margin(value)?,
        WebValueGrammar::SvgDasharray => web_svg_dasharray(value)?,
        WebValueGrammar::UrlOrNone => web_url_or_none(value)?,
        WebValueGrammar::Time => {
            let seconds = stylex_transition_duration(value)? as f64 / 1000.0;
            format!("{seconds}s")
        }
        WebValueGrammar::SignedTime => web_signed_time(value)?,
        WebValueGrammar::AnimationTimingFunction => web_animation_timing_function(value)?,
        WebValueGrammar::BorderImageOutset => web_border_image_outset(value)?,
        WebValueGrammar::BorderImageRepeat => web_border_image_repeat(value)?,
        WebValueGrammar::BorderImageSlice => web_border_image_slice(value)?,
        WebValueGrammar::BorderImageWidth => web_border_image_width(value)?,
        WebValueGrammar::GridAutoFlow => web_grid_auto_flow(value)?,
        WebValueGrammar::GridTemplateAreas => web_grid_template_areas(value)?,
        WebValueGrammar::GridTrackList => web_grid_track_list(value)?,
        WebValueGrammar::CommaKeywordGroups {
            keywords,
            minimum,
            maximum,
        } => web_comma_keyword_groups(value, keywords, minimum, maximum)?,
        WebValueGrammar::MaskImage => web_mask_image(value)?,
        WebValueGrammar::MaskPosition => web_mask_position(value)?,
        WebValueGrammar::MaskSize => web_mask_size(value)?,
        WebValueGrammar::OffsetPath => web_offset_path(value)?,
        WebValueGrammar::OffsetPosition(keywords) => web_offset_position(value, keywords)?,
        WebValueGrammar::OffsetRotate => web_offset_rotate(value)?,
        WebValueGrammar::PerspectiveOrigin => web_perspective_origin(value)?,
        WebValueGrammar::ShapeOutside => web_shape_outside(value)?,
        WebValueGrammar::WillChange => web_will_change(value)?,
        WebValueGrammar::FontFeatureSettings => web_font_setting(value, false)?,
        WebValueGrammar::FontLanguageOverride => {
            let StaticValue::String(value) = value else { return None };
            (value == "normal" || web_css_string(value)).then(|| value.clone())?
        }
        WebValueGrammar::FontPalette => {
            let StaticValue::String(value) = value else { return None };
            (matches!(value.as_str(), "normal" | "light" | "dark")
                || web_css_identifier(value))
            .then(|| value.clone())?
        }
        WebValueGrammar::FontSynthesis => web_font_synthesis(value)?,
        WebValueGrammar::FontVariantAlternates => web_font_variant_alternates(value)?,
        WebValueGrammar::FontVariantEastAsian => web_font_variant_east_asian(value)?,
        WebValueGrammar::FontVariationSettings => web_font_setting(value, true)?,
        WebValueGrammar::HangingPunctuation => web_hanging_punctuation(value)?,
        WebValueGrammar::HyphenateCharacter => {
            let StaticValue::String(value) = value else { return None };
            if value == "auto" {
                // Because the published type is open `string`, StyleX 0.19
                // serializes this CSS keyword as a quoted custom character.
                // Keep the official transform's observable output exact.
                "\"auto\"".to_string()
            } else {
                web_css_string(value).then(|| value.clone())?
            }
        }
        WebValueGrammar::HyphenateLimitChars => web_hyphenate_limit_chars(value)?,
        WebValueGrammar::ImageResolution => web_image_resolution(value)?,
        WebValueGrammar::InitialLetter => web_initial_letter(value)?,
        WebValueGrammar::TimelineNames { allow_all } => web_timeline_names(value, allow_all)?,
        WebValueGrammar::DashedIdent { keyword } => web_dashed_ident(value, keyword)?,
        WebValueGrammar::ViewTransitionName => web_view_transition_name(value)?,
        WebValueGrammar::AnimationTimeline => web_animation_timeline(value)?,
        WebValueGrammar::AnimationRangeBoundary => web_animation_range_boundary(value)?,
        WebValueGrammar::ViewTimelineInset => web_view_timeline_inset(value)?,
        WebValueGrammar::MasonryAutoFlow => web_masonry_auto_flow(value)?,
        WebValueGrammar::Angle(keywords) => web_angle(value, keywords)?,
        WebValueGrammar::TextDecorationSkip => web_text_decoration_skip(value)?,
        WebValueGrammar::CounterList { allow_reversed } => {
            web_counter_list(value, allow_reversed)?
        }
        WebValueGrammar::ScrollbarColor => web_scrollbar_color(value)?,
        WebValueGrammar::Quotes => web_quotes(value)?,
        WebValueGrammar::Content => web_generated_content(value)?,
        WebValueGrammar::Zoom => web_zoom(value)?,
        WebValueGrammar::TextDecoration => web_text_decoration(value)?,
        WebValueGrammar::TextEmphasis => web_text_emphasis(value)?,
        WebValueGrammar::Outline => web_outline(value)?,
        WebValueGrammar::MathDepth => web_math_depth(value)?,
        WebValueGrammar::TabSize => web_tab_size(value)?,
        WebValueGrammar::TextCombineUpright => web_text_combine_upright(value)?,
        WebValueGrammar::TextEmphasisStyle => web_text_emphasis_style(value)?,
        WebValueGrammar::Percentage {
            keywords,
            minimum,
            maximum,
        } => match value {
            StaticValue::String(value) if keywords.contains(&value.as_str()) => value.clone(),
            StaticValue::String(value) if value.ends_with('%') => {
                let number = value.strip_suffix('%')?.parse::<f64>().ok()?;
                (number.is_finite() && number >= minimum && number <= maximum)
                    .then(|| value.clone())?
            }
            _ => return None,
        },
    };
    Some(StyleProperty::WebOnly(css_property.to_string(), value))
}

fn stylex_order(value: &StaticValue) -> Option<i32> {
    let value = match value {
        StaticValue::Number(value) if value.is_finite() && value.fract() == 0.0 => *value,
        StaticValue::String(value) => value.parse::<f64>().ok().filter(|value| value.fract() == 0.0)?,
        _ => return None,
    };
    (value >= i32::MIN as f64 && value <= i32::MAX as f64).then_some(value as i32)
}

fn stylex_overflow(value: &StaticValue) -> Option<Overflow> {
    let StaticValue::String(value) = value else { return None };
    Some(match value.as_str() {
        "visible" => Overflow::Visible,
        "hidden" => Overflow::Hidden,
        "clip" => Overflow::Css("clip"),
        "scroll" => Overflow::Scroll,
        "auto" => Overflow::Css("auto"),
        _ => return None,
    })
}

fn stylex_scroll_edge(property: &str) -> Option<Edge> {
    Some(match property {
        "scrollMarginTop" | "scrollPaddingTop" => Edge::Top,
        "scrollMarginRight" | "scrollPaddingRight" => Edge::Right,
        "scrollMarginBottom" | "scrollPaddingBottom" => Edge::Bottom,
        "scrollMarginLeft" | "scrollPaddingLeft" => Edge::Left,
        "scrollMarginBlockStart" => Edge::Top,
        "scrollMarginBlockEnd" => Edge::Bottom,
        "scrollPaddingBlockStart" => Edge::BlockStart,
        "scrollPaddingBlockEnd" => Edge::BlockEnd,
        "scrollMarginInlineStart" | "scrollPaddingInlineStart" => Edge::InlineStart,
        "scrollMarginInlineEnd" | "scrollPaddingInlineEnd" => Edge::InlineEnd,
        _ => return None,
    })
}

fn stylex_transition_property(value: &StaticValue) -> Option<String> {
    let StaticValue::String(value) = value else { return None };
    let properties: Vec<_> = value.split(',').map(str::trim).collect();
    if properties.is_empty()
        || properties.iter().any(|property| {
            !matches!(
                *property,
                "all"
                    | "none"
                    | "opacity"
                    | "transform"
                    | "translate"
                    | "scale"
                    | "rotate"
                    | "color"
                    | "background-color"
            )
        })
        || (properties.len() > 1 && properties.iter().any(|property| matches!(*property, "all" | "none")))
    {
        return None;
    }
    Some(properties.join(","))
}

fn stylex_transition_duration(value: &StaticValue) -> Option<u32> {
    let StaticValue::String(value) = value else { return None };
    let milliseconds = if let Some(value) = value.strip_suffix("ms") {
        value.parse::<f64>().ok()?
    } else {
        let value = value.strip_suffix('s')?;
        value.parse::<f64>().ok()? * 1000.0
    };
    (milliseconds.is_finite()
        && milliseconds >= 0.0
        && milliseconds.fract() == 0.0
        && milliseconds <= u32::MAX as f64)
        .then_some(milliseconds as u32)
}

fn stylex_font_weight(value: &StaticValue) -> Option<FontWeight> {
    let weight = match value {
        StaticValue::Number(value) if value.is_finite() && value.fract() == 0.0 => *value,
        StaticValue::String(value) => match value.as_str() {
            "normal" => 400.0,
            "bold" => 700.0,
            value => value.parse::<f64>().ok().filter(|value| value.fract() == 0.0)?,
        },
        _ => return None,
    };
    ((100.0..=900.0).contains(&weight) && (weight as u16).is_multiple_of(100))
        .then_some(FontWeight(weight as u16))
}

fn stylex_white_space(value: &StaticValue) -> Option<WhiteSpace> {
    let StaticValue::String(value) = value else { return None };
    Some(match value.as_str() {
        "normal" => WhiteSpace::Normal,
        "nowrap" => WhiteSpace::NoWrap,
        "pre" => WhiteSpace::Css("pre"),
        "pre-line" => WhiteSpace::Css("pre-line"),
        "pre-wrap" => WhiteSpace::Css("pre-wrap"),
        "break-spaces" => WhiteSpace::Css("break-spaces"),
        _ => return None,
    })
}

fn stylex_text_overflow(value: &StaticValue) -> Option<TextOverflow> {
    let StaticValue::String(value) = value else { return None };
    Some(match value.as_str() {
        "clip" => TextOverflow::Clip,
        "ellipsis" => TextOverflow::Ellipsis,
        _ => return None,
    })
}

fn stylex_transition_timing(value: &StaticValue) -> Option<String> {
    let StaticValue::String(value) = value else { return None };
    matches!(value.as_str(), "linear" | "ease-in" | "ease-out" | "ease-in-out")
        .then(|| value.clone())
}

/// Lower the practical single-transition shorthand into the same four slots
/// the browser shorthand resets. Comma-separated transition lists and timing
/// functions outside the Native runtime stay with the official StyleX pass.
fn stylex_transition(value: &StaticValue) -> Option<Vec<StyleProperty>> {
    let StaticValue::String(value) = value else {
        return None;
    };
    if value.contains(',') {
        return None;
    }
    let components = web_components(value)?;
    let mut property = None;
    let mut duration = None;
    let mut delay = None;
    let mut timing = None;
    for component in components {
        let static_value = StaticValue::String(component.clone());
        if let Some(milliseconds) = stylex_transition_duration(&static_value) {
            if duration.is_none() {
                duration = Some(milliseconds);
            } else if delay.is_none() {
                delay = Some(milliseconds);
            } else {
                return None;
            }
        } else if timing.is_none() && stylex_transition_timing(&static_value).is_some() {
            timing = Some(component);
        } else if property.is_none() && stylex_transition_property(&static_value).is_some() {
            property = Some(component);
        } else {
            return None;
        }
    }
    // CSS defaults to `ease`, which the deliberately small Native easing
    // contract does not approximate. Require an explicit supported easing.
    Some(vec![
        StyleProperty::TransitionProperty(property.unwrap_or_else(|| "all".to_string())),
        StyleProperty::TransitionDuration(duration.unwrap_or(0), Origin::Written),
        StyleProperty::TransitionTimingFunction(timing?, Origin::Written),
        StyleProperty::TransitionDelay(delay.unwrap_or(0), Origin::Written),
    ])
}

fn stylex_caret(value: &StaticValue) -> Option<Vec<StyleProperty>> {
    let StaticValue::String(value) = value else {
        return None;
    };
    let components = web_components(value)?;
    if components.len() > 2 {
        return None;
    }
    let shapes = ["bar", "block", "underscore"];
    let mut color = None;
    let mut shape = None;
    let mut autos = 0;
    for component in components {
        if component == "auto" {
            autos += 1;
        } else if shapes.contains(&component.as_str()) && shape.is_none() {
            shape = Some(component);
        } else if web_shorthand_color(&component) && color.is_none() {
            color = Some(component);
        } else {
            return None;
        }
    }
    if autos > usize::from(color.is_some()) + usize::from(shape.is_some()) + 1 {
        return None;
    }
    let color = match color {
        Some(value) => StyleProperty::CaretColor(css_color(&StaticValue::String(value))?),
        None => web_longhand("caret-color", "auto"),
    };
    Some(vec![
        color,
        web_longhand("caret-shape", shape.unwrap_or_else(|| "auto".to_string())),
    ])
}

/// Maps CSS-in-JS property spelling onto the already-tested Tailwind parser.
/// The tokens are internal only; no generated class string reaches output.
fn token_for(property: &str, value: &StaticValue) -> Option<String> {
    let arbitrary = |prefix: &str, value: String| {
        safe_arbitrary(value).map(|value| format!("{prefix}-[{value}]"))
    };
    let length = |prefix: &str| arbitrary(prefix, length_value(value));
    let raw = |prefix: &str| arbitrary(prefix, raw_value(value));

    match property {
        "display" => named(
            value,
            &[
                ("none", "hidden"),
                ("flex", "flex"),
                ("block", "block"),
                ("contents", "contents"),
                ("inline-flex", "inline-flex"),
                ("grid", "grid"),
            ],
        ),
        "position" => named(
            value,
            &[
                ("static", "static"),
                ("relative", "relative"),
                ("absolute", "absolute"),
                ("fixed", "fixed"),
                ("sticky", "sticky"),
            ],
        ),
        "flexDirection" => named(
            value,
            &[
                ("row", "flex-row"),
                ("row-reverse", "flex-row-reverse"),
                ("column", "flex-col"),
                ("column-reverse", "flex-col-reverse"),
            ],
        ),
        "flexWrap" => named(
            value,
            &[
                ("nowrap", "flex-nowrap"),
                ("wrap", "flex-wrap"),
                ("wrap-reverse", "flex-wrap-reverse"),
            ],
        ),
        "alignItems" => named(
            value,
            &[
                ("flex-start", "items-start"),
                ("flex-end", "items-end"),
                ("center", "items-center"),
                ("baseline", "items-baseline"),
                ("stretch", "items-stretch"),
            ],
        ),
        "alignSelf" => named(
            value,
            &[
                ("auto", "self-auto"),
                ("flex-start", "self-start"),
                ("flex-end", "self-end"),
                ("center", "self-center"),
                ("baseline", "self-baseline"),
                ("stretch", "self-stretch"),
            ],
        ),
        "alignContent" => named(
            value,
            &[
                ("flex-start", "content-start"),
                ("flex-end", "content-end"),
                ("center", "content-center"),
                ("space-between", "content-between"),
                ("space-around", "content-around"),
                ("space-evenly", "content-evenly"),
                ("stretch", "content-stretch"),
                ("baseline", "content-baseline"),
            ],
        ),
        "justifyContent" => named(
            value,
            &[
                ("flex-start", "justify-start"),
                ("flex-end", "justify-end"),
                ("center", "justify-center"),
                ("space-between", "justify-between"),
                ("space-around", "justify-around"),
                ("space-evenly", "justify-evenly"),
            ],
        ),
        "padding" => length("p"),
        "paddingTop" => length("pt"),
        "paddingRight" => length("pr"),
        "paddingBottom" => length("pb"),
        "paddingLeft" => length("pl"),
        "paddingInlineStart" => length("ps"),
        "paddingInlineEnd" => length("pe"),
        "margin" => length("m"),
        "marginTop" => length("mt"),
        "marginRight" => length("mr"),
        "marginBottom" => length("mb"),
        "marginLeft" => length("ml"),
        "marginInlineStart" => length("ms"),
        "marginInlineEnd" => length("me"),
        "gap" => length("gap"),
        "rowGap" => length("gap-y"),
        "columnGap" => length("gap-x"),
        "width" => length("w"),
        "height" => length("h"),
        "minWidth" => length("min-w"),
        "minHeight" => length("min-h"),
        "maxWidth" => length("max-w"),
        "maxHeight" => length("max-h"),
        "top" => length("top"),
        "right" => length("right"),
        "bottom" => length("bottom"),
        "left" => length("left"),
        "backgroundColor" => raw("bg"),
        "color" => raw("text"),
        "opacity" => raw("opacity"),
        "zIndex" => raw("z"),
        "flexGrow" => raw("grow"),
        "flexShrink" => raw("shrink"),
        "flexBasis" => length("basis"),
        "borderRadius" => length("rounded"),
        "borderTopLeftRadius" => length("rounded-tl"),
        "borderTopRightRadius" => length("rounded-tr"),
        "borderBottomRightRadius" => length("rounded-br"),
        "borderBottomLeftRadius" => length("rounded-bl"),
        "borderStartStartRadius" => length("rounded-ss"),
        "borderStartEndRadius" => length("rounded-se"),
        "borderEndStartRadius" => length("rounded-es"),
        "borderEndEndRadius" => length("rounded-ee"),
        "borderStyle" => named(
            value,
            &[
                ("solid", "border-solid"),
                ("dashed", "border-dashed"),
                ("dotted", "border-dotted"),
                ("double", "border-double"),
                ("hidden", "border-hidden"),
                ("none", "border-none"),
            ],
        ),
        "aspectRatio" => named(
            value,
            &[
                ("auto", "aspect-auto"),
                ("1 / 1", "aspect-square"),
                ("16 / 9", "aspect-video"),
            ],
        ),
        "backfaceVisibility" => named(
            value,
            &[
                ("hidden", "backface-hidden"),
                ("visible", "backface-visible"),
            ],
        ),
        "boxSizing" => named(
            value,
            &[("border-box", "box-border"), ("content-box", "box-content")],
        ),
        "flex" => named(
            value,
            &[
                ("auto", "flex-auto"),
                ("initial", "flex-initial"),
                ("none", "flex-none"),
                ("1", "flex-1"),
            ],
        ),
        "fontStyle" => named(value, &[("italic", "italic"), ("normal", "not-italic")]),
        "isolation" => named(value, &[("isolate", "isolate"), ("auto", "isolation-auto")]),
        "mixBlendMode" => {
            let StaticValue::String(value) = value else {
                return None;
            };
            [
                "normal",
                "multiply",
                "screen",
                "overlay",
                "darken",
                "lighten",
                "color-dodge",
                "color-burn",
                "hard-light",
                "soft-light",
                "difference",
                "exclusion",
                "hue",
                "saturation",
                "color",
                "luminosity",
                "plus-darker",
                "plus-lighter",
            ]
            .contains(&value.as_str())
            .then(|| format!("mix-blend-{value}"))
        }
        "pointerEvents" => named(
            value,
            &[
                ("auto", "pointer-events-auto"),
                ("none", "pointer-events-none"),
            ],
        ),
        "textDecorationColor" => raw("decoration"),
        "textDecorationLine" => named(
            value,
            &[
                ("underline", "underline"),
                ("overline", "overline"),
                ("line-through", "line-through"),
                ("none", "no-underline"),
            ],
        ),
        "textDecorationStyle" => named(
            value,
            &[
                ("solid", "decoration-solid"),
                ("double", "decoration-double"),
                ("dotted", "decoration-dotted"),
                ("dashed", "decoration-dashed"),
                ("wavy", "decoration-wavy"),
            ],
        ),
        "userSelect" => named(
            value,
            &[
                ("all", "select-all"),
                ("auto", "select-auto"),
                ("none", "select-none"),
                ("text", "select-text"),
            ],
        ),
        "verticalAlign" => named(
            value,
            &[
                ("baseline", "align-baseline"),
                ("bottom", "align-bottom"),
                ("middle", "align-middle"),
                ("sub", "align-sub"),
                ("super", "align-super"),
                ("text-bottom", "align-text-bottom"),
                ("text-top", "align-text-top"),
                ("top", "align-top"),
            ],
        ),
        "outlineColor" => raw("outline"),
        "outlineStyle" => named(
            value,
            &[
                ("solid", "outline-solid"),
                ("dashed", "outline-dashed"),
                ("dotted", "outline-dotted"),
                ("double", "outline-double"),
                ("none", "outline-none"),
            ],
        ),
        "fontSize" => length("text"),
        "lineHeight" => raw("leading"),
        "letterSpacing" => length("tracking"),
        "overflow" => named(
            value,
            &[
                ("visible", "overflow-visible"),
                ("hidden", "overflow-hidden"),
                ("clip", "overflow-clip"),
                ("scroll", "overflow-scroll"),
                ("auto", "overflow-auto"),
            ],
        ),
        "textAlign" => named(
            value,
            &[
                ("left", "text-left"),
                ("center", "text-center"),
                ("right", "text-right"),
                ("justify", "text-justify"),
                ("start", "text-start"),
                ("end", "text-end"),
            ],
        ),
        "textTransform" => named(
            value,
            &[
                ("uppercase", "uppercase"),
                ("lowercase", "lowercase"),
                ("capitalize", "capitalize"),
                ("none", "normal-case"),
            ],
        ),
        "objectFit" => named(
            value,
            &[
                ("contain", "object-contain"),
                ("cover", "object-cover"),
                ("fill", "object-fill"),
                ("none", "object-none"),
                ("scale-down", "object-scale-down"),
            ],
        ),
        "cursor" => named(
            value,
            &[("auto", "cursor-auto"), ("pointer", "cursor-pointer")],
        ),
        _ => None,
    }
}

fn direct_properties(property: &str, value: &StaticValue) -> Option<Vec<StyleProperty>> {
    let width = || px_length(value);
    let dimension = || dimension(value);
    let color = || css_color(value);
    Some(match property {
        "accentColor" | "alignTracks" | "alignmentBaseline" | "anchorName"
        | "animationComposition" | "animationDelay"
        | "animationRangeEnd" | "animationRangeStart" | "animationTimeline"
        | "animationDirection" | "animationFillMode" | "animationIterationCount"
        | "animationPlayState" | "animationTimingFunction" | "appearance" | "WebkitAppearance"
        | "WebkitLineClamp" | "WebkitTextStrokeWidth"
        | "backgroundAttachment"
        | "backgroundBlendMode" | "backgroundClip" | "WebkitBackgroundClip"
        | "backgroundOrigin" | "backgroundPositionX" | "backgroundPositionY"
        | "baselineShift" | "blockSize" | "borderCollapse" | "borderImageOutset"
        | "borderImageRepeat" | "borderImageSlice" | "borderImageSource" | "borderImageWidth"
        | "borderSpacing" | "gridAutoColumns" | "gridAutoFlow" | "gridAutoRows"
        | "gridTemplateAreas"
        | "boxDecorationBreak" | "breakAfter" | "breakBefore" | "breakInside"
        | "captionSide" | "caretShape" | "clear" | "clip" | "clipPath" | "clipRule" | "colorScheme"
        | "columnCount" | "columnFill" | "columnRuleColor" | "columnRuleStyle"
        | "columnRuleWidth" | "columnSpan" | "columnWidth" | "contain"
        | "containIntrinsicBlockSize" | "containIntrinsicHeight"
        | "containIntrinsicInlineSize" | "containIntrinsicSize" | "containIntrinsicWidth"
        | "contentVisibility" | "displayInside" | "displayList" | "displayOutside"
        | "dominantBaseline" | "emptyCells" | "fill" | "fillOpacity" | "fillRule"
        | "float" | "forcedColorAdjust"
        | "fontFeatureSettings" | "fontKerning" | "fontLanguageOverride" | "fontOpticalSizing"
        | "fontPalette" | "fontSizeAdjust" | "fontStretch" | "fontSynthesis"
        | "fontSynthesisPosition"
        | "fontSynthesisSmallCaps" | "fontSynthesisStyle" | "fontSynthesisWeight"
        | "fontVariantAlternates" | "fontVariantCaps" | "fontVariantEastAsian"
        | "fontVariantLigatures" | "fontVariantNumeric" | "fontVariantPosition"
        | "counterIncrement" | "counterReset" | "counterSet" | "quotes" | "content"
        | "fontVariationSettings" | "glyphOrientationHorizontal" | "glyphOrientationVertical"
        | "hangingPunctuation" | "hyphenateCharacter"
        | "hyphenateLimitChars" | "hyphens"
        | "imageOrientation" | "imageRendering" | "imageResolution" | "imeMode"
        | "initialLetter" | "initialLetterAlign" | "inlineSize" | "interpolateSize"
        | "justifyItems" | "lineBreak" | "lineHeightStep" | "listStyleImage" | "listStylePosition"
        | "listStyleType" | "maxBlockSize" | "maxInlineSize"
        | "marker" | "markerEnd" | "markerMid" | "markerStart" | "minBlockSize"
        | "maskClip" | "maskComposite" | "maskImage" | "maskMode" | "maskOrigin"
        | "maskBorderMode" | "maskBorderOutset" | "maskBorderRepeat" | "maskBorderSlice"
        | "maskBorderSource" | "maskBorderWidth" | "maskPosition" | "maskRepeat"
        | "maskSize" | "maskType" | "WebkitMaskImage"
        | "justifyTracks" | "kerning" | "marginTrim" | "markerOffset" | "masonryAutoFlow"
        | "mathDepth" | "mathShift"
        | "mathStyle" | "minInlineSize"
        | "MozOsxFontSmoothing" | "MsOverflowStyle"
        | "overflowAnchor" | "overscrollBehavior" | "perspective" | "perspectiveOrigin"
        | "offsetAnchor" | "offsetDistance" | "offsetPath" | "offsetPosition" | "offsetRotate"
        | "overscrollBehaviorBlock" | "overscrollBehaviorInline" | "overscrollBehaviorX"
        | "orphans" | "outline" | "overflowBlock" | "overflowBlockX" | "overflowClipMargin"
        | "overscrollBehaviorY" | "pageBreakAfter"
        | "pageBreakBefore" | "pageBreakInside"
        | "paintOrder" | "positionAnchor" | "positionVisibility" | "printColorAdjust" | "resize"
        | "rubyAlign" | "rubyMerge" | "rubyPosition" | "scrollSnapAlign"
        | "scrollSnapStop" | "scrollSnapType" | "scrollTimelineAxis" | "scrollTimelineName"
        | "scrollbarColor" | "scrollbarGutter" | "scrollbarWidth"
        | "shapeImageThreshold" | "shapeMargin" | "shapeOutside" | "shapeRendering"
        | "stroke" | "strokeDasharray" | "strokeDashoffset"
        | "strokeLinecap" | "strokeLinejoin" | "strokeMiterlimit" | "strokeOpacity"
        | "strokeWidth" | "tabSize" | "tableLayout" | "textAnchor" | "textCombineUpright"
        | "textEmphasisColor" | "textEmphasisPosition" | "textEmphasisStyle" | "textFillColor"
        | "textRendering" | "textSizeAdjust" | "textUnderlineOffset" | "textUnderlinePosition"
        | "timelineScope" | "touchAction" | "transformBox" | "transformStyle" | "unicodeBidi"
        | "viewTimelineAxis" | "viewTimelineInset" | "viewTimelineName" | "viewTransitionName"
        | "widows" | "willChange"
        | "wordBreak" | "wordSpacing" | "wordWrap"
        | "overflowWrap" | "visibility"
        | "backgroundPosition" | "backgroundRepeat" | "backgroundSize" | "objectPosition"
        | "justifySelf" | "placeItems" | "placeSelf" | "textAlignLast"
        | "textDecoration" | "textDecorationSkip" | "textDecorationSkipInk"
        | "textDecorationThickness" | "textEmphasis"
        | "textJustify" | "textOrientation" | "textWrap"
        | "animationDuration" | "WebkitBoxOrient" | "WebkitFontSmoothing" | "WebkitTapHighlightColor"
        | "WebkitTextFillColor" | "WebkitTextStrokeColor" | "writingMode" | "zoom" => {
            vec![web_only_property(property, value)?]
        }
        "caret" => stylex_caret(value)?,
        "fontWeight" => vec![StyleProperty::FontWeight(stylex_font_weight(value)?)],
        "whiteSpace" => vec![StyleProperty::WhiteSpace(stylex_white_space(value)?)],
        "textOverflow" => vec![StyleProperty::TextOverflow(stylex_text_overflow(value)?)],
        "caretColor" => vec![StyleProperty::CaretColor(color()?)],
        "order" => vec![StyleProperty::Order(stylex_order(value)?)],
        "overflowX" => vec![StyleProperty::OverflowX(stylex_overflow(value)?)],
        "overflowY" => vec![StyleProperty::OverflowY(stylex_overflow(value)?)],
        "scrollBehavior" => {
            let StaticValue::String(value) = value else { return None };
            let value = match value.as_str() {
                "auto" => "auto",
                "smooth" => "smooth",
                _ => return None,
            };
            vec![StyleProperty::ScrollBehavior(value)]
        }
        "scrollMarginTop" => vec![StyleProperty::ScrollMargin(stylex_scroll_edge(property)?, width()?)],
        "scrollMarginRight" => vec![StyleProperty::ScrollMargin(stylex_scroll_edge(property)?, width()?)],
        "scrollMarginBottom" => vec![StyleProperty::ScrollMargin(stylex_scroll_edge(property)?, width()?)],
        "scrollMarginLeft" => vec![StyleProperty::ScrollMargin(stylex_scroll_edge(property)?, width()?)],
        "scrollMarginBlockStart" => vec![StyleProperty::ScrollMargin(stylex_scroll_edge(property)?, width()?)],
        "scrollMarginBlockEnd" => vec![StyleProperty::ScrollMargin(stylex_scroll_edge(property)?, width()?)],
        "scrollMarginInlineStart" => vec![StyleProperty::ScrollMargin(stylex_scroll_edge(property)?, width()?)],
        "scrollMarginInlineEnd" => vec![StyleProperty::ScrollMargin(stylex_scroll_edge(property)?, width()?)],
        "scrollPaddingTop" => vec![StyleProperty::ScrollPadding(stylex_scroll_edge(property)?, width()?)],
        "scrollPaddingRight" => vec![StyleProperty::ScrollPadding(stylex_scroll_edge(property)?, width()?)],
        "scrollPaddingBottom" => vec![StyleProperty::ScrollPadding(stylex_scroll_edge(property)?, width()?)],
        "scrollPaddingLeft" => vec![StyleProperty::ScrollPadding(stylex_scroll_edge(property)?, width()?)],
        "scrollPaddingBlockStart" => vec![StyleProperty::ScrollPadding(stylex_scroll_edge(property)?, width()?)],
        "scrollPaddingBlockEnd" => vec![StyleProperty::ScrollPadding(stylex_scroll_edge(property)?, width()?)],
        "scrollPaddingInlineStart" => vec![StyleProperty::ScrollPadding(stylex_scroll_edge(property)?, width()?)],
        "scrollPaddingInlineEnd" => vec![StyleProperty::ScrollPadding(stylex_scroll_edge(property)?, width()?)],
        "textIndent" => vec![StyleProperty::TextIndent(dimension()?)],
        "transitionProperty" => vec![StyleProperty::TransitionProperty(
            stylex_transition_property(value)?,
        )],
        "transitionDuration" => vec![StyleProperty::TransitionDuration(
            stylex_transition_duration(value)?,
            Origin::Written,
        )],
        "transitionDelay" => vec![StyleProperty::TransitionDelay(
            stylex_transition_duration(value)?,
            Origin::Written,
        )],
        "transitionTimingFunction" => vec![StyleProperty::TransitionTimingFunction(
            stylex_transition_timing(value)?,
            Origin::Written,
        )],
        "transition" => stylex_transition(value)?,
        "animationRange" => stylex_animation_range(value)?,
        "scrollTimeline" => stylex_scroll_timeline(value)?,
        "viewTimeline" => stylex_view_timeline(value)?,
        "containerName" => vec![StyleProperty::ContainerName(stylex_container_name(value)?)],
        "containerType" => vec![StyleProperty::Keyword(
            "container-type",
            stylex_container_type(value)?,
        )],
        // These Web-only shorthands are expanded into their final CSS slots.
        // This lets atomic priority suppress only the slot a higher-priority
        // conditional longhand makes unreachable.
        "columns" => stylex_columns(value)?,
        "columnRule" => stylex_column_rule(value)?,
        "container" => stylex_container(value)?,
        "flexFlow" => stylex_flex_flow(value)?,
        "gridGap" => stylex_gap(value)?,
        "gridRowGap" => {
            let value = width()?;
            if matches!(&value, Length::Px(number) if *number < 0.0) {
                return None;
            }
            vec![StyleProperty::RowGap(value)]
        }
        "gridColumnGap" => {
            let value = width()?;
            if matches!(&value, Length::Px(number) if *number < 0.0) {
                return None;
            }
            vec![StyleProperty::ColumnGap(value)]
        }
        "borderBlockWidth" => {
            let value = stylex_border_width(value)?;
            vec![
                StyleProperty::BorderLogicalWidth(Edge::BlockStart, value.clone()),
                StyleProperty::BorderLogicalWidth(Edge::BlockEnd, value),
            ]
        }
        "borderBlockStartWidth" => vec![StyleProperty::BorderTopWidth(stylex_border_width(value)?)],
        "borderBlockEndWidth" => vec![StyleProperty::BorderBottomWidth(stylex_border_width(value)?)],
        "borderInlineWidth" => {
            let value = stylex_border_width(value)?;
            vec![
                StyleProperty::BorderLogicalWidth(Edge::InlineStart, value.clone()),
                StyleProperty::BorderLogicalWidth(Edge::InlineEnd, value),
            ]
        }
        "borderInlineStartWidth" => vec![StyleProperty::BorderLogicalWidth(
            Edge::InlineStart,
            stylex_border_width(value)?,
        )],
        "borderInlineEndWidth" => vec![StyleProperty::BorderLogicalWidth(
            Edge::InlineEnd,
            stylex_border_width(value)?,
        )],
        "borderInlineColor" => {
            let value = color()?;
            vec![
                StyleProperty::BorderInlineStartColor(value.clone()),
                StyleProperty::BorderInlineEndColor(value),
            ]
        }
        "borderInlineStartColor" => vec![StyleProperty::BorderInlineStartColor(color()?)],
        "borderInlineEndColor" => vec![StyleProperty::BorderInlineEndColor(color()?)],
        "borderBlockStyle" => {
            let value = stylex_border_style(value)?;
            vec![
                StyleProperty::BorderLogicalStyle(Edge::BlockStart, value),
                StyleProperty::BorderLogicalStyle(Edge::BlockEnd, value),
            ]
        }
        "borderInlineStyle" => {
            let value = stylex_border_style(value)?;
            vec![
                StyleProperty::BorderLogicalStyle(Edge::InlineStart, value),
                StyleProperty::BorderLogicalStyle(Edge::InlineEnd, value),
            ]
        }
        "borderInlineStartStyle" => vec![StyleProperty::BorderLogicalStyle(
            Edge::InlineStart,
            stylex_border_style(value)?,
        )],
        "borderInlineEndStyle" => vec![StyleProperty::BorderLogicalStyle(
            Edge::InlineEnd,
            stylex_border_style(value)?,
        )],
        // StyleX normalizes the block-start/end aliases to physical top/bottom.
        // Keep the StyleX lane Web-only: React Native has only one global
        // borderStyle and cannot preserve a side-specific authored style.
        "borderBlockStartStyle" => vec![stylex_web_border_style(
            "border-top-style",
            value,
        )?],
        "borderBlockEndStyle" => vec![stylex_web_border_style(
            "border-bottom-style",
            value,
        )?],
        "borderTopStyle" => vec![stylex_web_border_style("border-top-style", value)?],
        "borderBottomStyle" => vec![stylex_web_border_style("border-bottom-style", value)?],
        "borderRightStyle" => vec![stylex_web_border_style("border-right-style", value)?],
        "borderLeftStyle" => vec![stylex_web_border_style("border-left-style", value)?],
        "listStyle" => stylex_list_style(value)?,
        "scrollMargin" => stylex_scroll_box(value, false)?,
        "scrollPadding" => stylex_scroll_box(value, true)?,
        "scrollMarginBlock" => {
            stylex_scroll_axis(value, false, Edge::BlockStart, Edge::BlockEnd)?
        }
        "scrollMarginInline" => {
            stylex_scroll_axis(value, false, Edge::InlineStart, Edge::InlineEnd)?
        }
        "scrollPaddingBlock" => {
            stylex_scroll_axis(value, true, Edge::BlockStart, Edge::BlockEnd)?
        }
        "scrollPaddingInline" => {
            stylex_scroll_axis(value, true, Edge::InlineStart, Edge::InlineEnd)?
        }
        // StyleX emits these as CSS shorthands at a lower atomic priority
        // than their longhands. Split them into the typed final slots here
        // so the same priority resolution works on Web and Native.
        "gap" => stylex_gap(value)?,
        "borderRadius" => {
            let value = Radius::Length(width()?);
            vec![
                StyleProperty::BorderTopLeftRadius(value.clone()),
                StyleProperty::BorderTopRightRadius(value.clone()),
                StyleProperty::BorderBottomRightRadius(value.clone()),
                StyleProperty::BorderBottomLeftRadius(value),
            ]
        }
        "flex" => {
            let StaticValue::String(value) = value else {
                return None;
            };
            let (grow, shrink, basis) = match value.as_str() {
                "auto" => (1.0, 1.0, Dimension::Auto),
                "initial" => (0.0, 1.0, Dimension::Auto),
                "none" => (0.0, 0.0, Dimension::Auto),
                "1" => (1.0, 1.0, Dimension::Percent(0.0)),
                _ => return None,
            };
            vec![
                StyleProperty::FlexGrow(grow),
                StyleProperty::FlexShrink(shrink),
                StyleProperty::FlexBasis(basis),
            ]
        }
        "gridTemplateColumns" => vec![StyleProperty::GridTemplateColumns(stylex_grid_tracks(
            value,
        )?)],
        "gridTemplateRows" => vec![StyleProperty::GridTemplateRows(stylex_grid_tracks(
            value,
        )?)],
        "gridColumnStart" => vec![StyleProperty::GridColumnStart(stylex_grid_line(value)?)],
        "gridColumnEnd" => vec![StyleProperty::GridColumnEnd(stylex_grid_line(value)?)],
        "gridRowStart" => vec![StyleProperty::GridRowStart(stylex_grid_line(value)?)],
        "gridRowEnd" => vec![StyleProperty::GridRowEnd(stylex_grid_line(value)?)],
        "gridColumn" => vec![StyleProperty::GridColumn(stylex_grid_span(value)?)],
        "gridRow" => vec![StyleProperty::GridRow(stylex_grid_span(value)?)],
        "gridArea" => stylex_grid_area(value)?,
        "gridTemplate" => stylex_grid_template(value)?,
        "grid" => stylex_grid(value)?,
        "rotate" => vec![StyleProperty::Rotate(stylex_rotate(value)?)],
        "scale" => vec![StyleProperty::Scale(stylex_scale(value)?)],
        "translate" => vec![StyleProperty::Translate(stylex_translate(value)?)],
        "transform" => vec![StyleProperty::Transform(transform_functions(value)?)],
        "transformOrigin" => vec![StyleProperty::TransformOrigin(transform_origin(value)?)],
        "textShadow" => vec![StyleProperty::TextShadow(stylex_text_shadow(value)?)],
        "placeContent" => stylex_place_content(value)?,
        // The shared IR deliberately keeps the complete shadow list as CSS
        // text. That preserves authored layer order and also maps directly
        // to React Native's string-valued `boxShadow` support.
        "boxShadow" => {
            let StaticValue::String(value) = value else {
                return None;
            };
            let value = value
                .split(',')
                .map(str::trim)
                .collect::<Vec<_>>()
                .join(",");
            vec![StyleProperty::BoxShadow(value)]
        }
        "backgroundImage" => {
            let StaticValue::String(value) = value else { return None };
            let value = value.trim();
            if value == "none" {
                vec![StyleProperty::BackgroundImageNone]
            } else if (value.starts_with("linear-gradient(")
                || value.starts_with("radial-gradient("))
                && value.ends_with(')')
                && !value.contains("var(")
                && !value.contains("env(")
            {
                let value = value.split(',').map(str::trim).collect::<Vec<_>>().join(",");
                vec![StyleProperty::BackgroundImage(value)]
            } else {
                return None;
            }
        }
        "filter" => {
            let StaticValue::String(value) = value else { return None };
            let value = value.trim();
            if value != "none" && !supported_filter_list(value) {
                return None;
            }
            vec![StyleProperty::FilterRaw(value.to_string())]
        }
        "direction" => {
            let StaticValue::String(value) = value else { return None };
            let value = ["inherit", "ltr", "rtl"]
                .into_iter()
                .find(|candidate| *candidate == value)?;
            vec![StyleProperty::Keyword("direction", value)]
        }
        "fontFamily" => {
            let StaticValue::String(value) = value else { return None };
            let value = value.trim();
            if value.is_empty() || value.contains(',') || value.contains("var(") {
                return None;
            }
            vec![StyleProperty::FontFamily(value.to_string())]
        }
        "fontVariant" => {
            let StaticValue::String(value) = value else { return None };
            let variants = value
                .split_whitespace()
                .map(portable_font_variant)
                .collect::<Option<Vec<_>>>()?;
            if variants.is_empty() {
                return None;
            }
            vec![StyleProperty::FontVariant(variants)]
        }
        // Tailwind's border-width utilities intentionally add a solid
        // style so they paint without a reset. StyleX declares exactly the
        // requested property, so it must bypass that Tailwind-specific
        // expansion or `borderWidth: 2` would also change borderStyle.
        "borderWidth" => {
            let value = width()?;
            vec![
                StyleProperty::BorderTopWidth(value.clone()),
                StyleProperty::BorderRightWidth(value.clone()),
                StyleProperty::BorderBottomWidth(value.clone()),
                StyleProperty::BorderLeftWidth(value),
            ]
        }
        "borderTopWidth" => vec![StyleProperty::BorderTopWidth(width()?)],
        "borderRightWidth" => vec![StyleProperty::BorderRightWidth(width()?)],
        "borderBottomWidth" => vec![StyleProperty::BorderBottomWidth(width()?)],
        "borderLeftWidth" => vec![StyleProperty::BorderLeftWidth(width()?)],
        // Expanding the shorthand into the four typed slots makes its
        // overlap with a side longhand visible to `same_property_as`.
        "borderColor" => {
            let value = color()?;
            vec![
                StyleProperty::BorderTopColor(value.clone()),
                StyleProperty::BorderRightColor(value.clone()),
                StyleProperty::BorderBottomColor(value.clone()),
                StyleProperty::BorderLeftColor(value),
            ]
        }
        "borderTopColor" => vec![StyleProperty::BorderTopColor(color()?)],
        "borderRightColor" => vec![StyleProperty::BorderRightColor(color()?)],
        "borderBottomColor" => vec![StyleProperty::BorderBottomColor(color()?)],
        "borderLeftColor" => vec![StyleProperty::BorderLeftColor(color()?)],
        "borderBlockColor" => {
            let value = color()?;
            vec![
                StyleProperty::BorderTopColor(value.clone()),
                StyleProperty::BorderBottomColor(value),
            ]
        }
        // StyleX defines these aliases in terms of physical top/bottom,
        // which its official compiler confirms. Follow that contract even
        // though the CSS names themselves look writing-mode-relative.
        "borderBlockStartColor" => vec![StyleProperty::BorderTopColor(color()?)],
        "borderBlockEndColor" => vec![StyleProperty::BorderBottomColor(color()?)],
        // The arbitrary Tailwind outline-width form also adds `solid`;
        // StyleX does not. Keep width and offset independent here.
        "outlineWidth" => vec![StyleProperty::OutlineWidth(width()?)],
        "outlineOffset" => vec![StyleProperty::OutlineOffset(width()?)],
        // StyleX exposes both the modern inset names and React Native's
        // start/end aliases. Keep all of them logical in IR so RTL is
        // decided by the platform rather than baked into the compiler.
        "start" => vec![StyleProperty::InsetInlineStart(dimension()?)],
        "insetInlineStart" => vec![StyleProperty::InsetInlineStart(dimension()?)],
        "end" => vec![StyleProperty::InsetInlineEnd(dimension()?)],
        "insetInlineEnd" => vec![StyleProperty::InsetInlineEnd(dimension()?)],
        "insetInline" => {
            let value = dimension()?;
            vec![
                StyleProperty::InsetInlineStart(value.clone()),
                StyleProperty::InsetInlineEnd(value),
            ]
        }
        "insetBlockStart" => vec![StyleProperty::InsetTop(dimension()?)],
        "insetBlockEnd" => vec![StyleProperty::InsetBottom(dimension()?)],
        "insetBlock" => {
            let value = dimension()?;
            vec![
                StyleProperty::InsetTop(value.clone()),
                StyleProperty::InsetBottom(value),
            ]
        }
        "inset" => {
            let value = dimension()?;
            vec![
                StyleProperty::InsetTop(value.clone()),
                StyleProperty::InsetRight(value.clone()),
                StyleProperty::InsetBottom(value.clone()),
                StyleProperty::InsetLeft(value),
            ]
        }
        "marginInline" => {
            let value = dimension()?;
            vec![
                StyleProperty::MarginInlineStart(value.clone()),
                StyleProperty::MarginInlineEnd(value),
            ]
        }
        "marginBlockStart" => vec![StyleProperty::MarginTop(dimension()?)],
        "marginBlockEnd" => vec![StyleProperty::MarginBottom(dimension()?)],
        "marginBlock" => {
            let value = dimension()?;
            vec![
                StyleProperty::MarginTop(value.clone()),
                StyleProperty::MarginBottom(value),
            ]
        }
        "paddingInline" => {
            let value = width()?;
            vec![
                StyleProperty::PaddingInlineStart(value.clone()),
                StyleProperty::PaddingInlineEnd(value),
            ]
        }
        "paddingBlockStart" => vec![StyleProperty::PaddingTop(width()?)],
        "paddingBlockEnd" => vec![StyleProperty::PaddingBottom(width()?)],
        "paddingBlock" => {
            let value = width()?;
            vec![
                StyleProperty::PaddingTop(value.clone()),
                StyleProperty::PaddingBottom(value),
            ]
        }
        _ => return None,
    })
}

fn portable_font_variant(value: &str) -> Option<&'static str> {
    const VALUES: &[&str] = &[
        "small-caps", "oldstyle-nums", "lining-nums", "tabular-nums",
        "common-ligatures", "no-common-ligatures", "discretionary-ligatures",
        "no-discretionary-ligatures", "historical-ligatures", "no-historical-ligatures",
        "contextual", "no-contextual", "proportional-nums", "stylistic-one",
        "stylistic-two", "stylistic-three", "stylistic-four", "stylistic-five",
        "stylistic-six", "stylistic-seven", "stylistic-eight", "stylistic-nine",
        "stylistic-ten", "stylistic-eleven", "stylistic-twelve", "stylistic-thirteen",
        "stylistic-fourteen", "stylistic-fifteen", "stylistic-sixteen",
        "stylistic-seventeen", "stylistic-eighteen", "stylistic-nineteen",
        "stylistic-twenty",
    ];
    VALUES.iter().copied().find(|candidate| *candidate == value)
}

fn supported_filter_list(value: &str) -> bool {
    let mut rest = value.trim();
    while !rest.is_empty() {
        let Some(open) = rest.find('(') else { return false };
        let name = rest[..open].trim();
        if !matches!(
            name,
            "blur" | "brightness" | "contrast" | "drop-shadow" | "grayscale"
                | "hue-rotate" | "invert" | "opacity" | "saturate" | "sepia"
        ) {
            return false;
        }
        let mut depth = 0_u32;
        let mut close = None;
        for (index, character) in rest[open..].char_indices() {
            match character {
                '(' => depth += 1,
                ')' => {
                    depth -= 1;
                    if depth == 0 {
                        close = Some(open + index + 1);
                        break;
                    }
                }
                _ => {}
            }
        }
        let Some(close) = close else { return false };
        rest = rest[close..].trim_start();
    }
    true
}

/// The aliases StyleX's default `property-specificity` mode normalizes before
/// it gives a declaration a property key. Exact-key last-wins must therefore
/// see `paddingBlockStart` and `paddingTop` as the same namespace too.
fn canonical_property(property: &str) -> &str {
    match property {
        "borderBlockStartColor" => "borderTopColor",
        "borderBlockEndColor" => "borderBottomColor",
        "borderBlockStartStyle" => "borderTopStyle",
        "borderBlockEndStyle" => "borderBottomStyle",
        "borderBlockStartWidth" => "borderTopWidth",
        "borderBlockEndWidth" => "borderBottomWidth",
        "insetBlockStart" => "top",
        "insetBlockEnd" => "bottom",
        "marginBlockStart" => "marginTop",
        "marginBlockEnd" => "marginBottom",
        "paddingBlockStart" => "paddingTop",
        "paddingBlockEnd" => "paddingBottom",
        "scrollMarginBlockStart" => "scrollMarginTop",
        "scrollMarginBlockEnd" => "scrollMarginBottom",
        "gridGap" => "gap",
        "gridRowGap" => "rowGap",
        "gridColumnGap" => "columnGap",
        "start" => "insetInlineStart",
        "end" => "insetInlineEnd",
        _ => property,
    }
}

/// StyleX 0.19's published property-priority table has four CSS tiers. The
/// frontend expands the supported shorthands into final typed slots, but keeps
/// this rank so a longhand still wins independently of `props()` argument
/// order on both backends.
fn property_priority(property: &str) -> u16 {
    let property = canonical_property(property);
    if matches!(
        property,
        "padding"
            | "margin"
            | "inset"
            | "scrollMargin"
            | "scrollPadding"
            | "grid"
            | "gridArea"
            | "gridTemplate"
    ) {
        return 1000;
    }
    if matches!(
        property,
        "borderColor"
            | "borderStyle"
            | "borderWidth"
            | "borderRadius"
            | "borderBlockStyle"
            | "borderBlockWidth"
            | "borderInlineColor"
            | "borderInlineStyle"
            | "borderInlineWidth"
            | "columnRule"
            | "columns"
            | "flex"
            | "flexFlow"
            | "fontVariant"
            | "gap"
            | "gridColumn"
            | "gridRow"
            | "gridTemplateAreas"
            | "container"
            | "insetBlock"
            | "insetInline"
            | "marginBlock"
            | "marginInline"
            | "listStyle"
            | "transition"
            | "animationRange"
            | "scrollTimeline"
            | "viewTimeline"
            | "caret"
            | "outline"
            | "textDecoration"
            | "textEmphasis"
            | "overflow"
            | "placeContent"
            | "placeItems"
            | "paddingBlock"
            | "paddingInline"
            | "scrollMarginBlock"
            | "scrollMarginInline"
            | "scrollPaddingBlock"
            | "scrollPaddingInline"
    ) {
        return 2000;
    }
    if matches!(
        property,
        "borderTopColor"
            | "borderRightColor"
            | "borderBottomColor"
            | "borderLeftColor"
            | "borderTopWidth"
            | "borderRightWidth"
            | "borderBottomWidth"
            | "borderLeftWidth"
            | "borderTopStyle"
            | "borderRightStyle"
            | "borderBottomStyle"
            | "borderLeftStyle"
            | "borderInlineStartColor"
            | "borderInlineEndColor"
            | "borderInlineStartStyle"
            | "borderInlineEndStyle"
            | "borderInlineStartWidth"
            | "borderInlineEndWidth"
            | "borderTopLeftRadius"
            | "borderTopRightRadius"
            | "borderBottomRightRadius"
            | "borderBottomLeftRadius"
            | "bottom"
            | "height"
            | "left"
            | "marginTop"
            | "marginRight"
            | "marginBottom"
            | "marginLeft"
            | "maxHeight"
            | "maxWidth"
            | "minHeight"
            | "minWidth"
            | "paddingTop"
            | "paddingRight"
            | "paddingBottom"
            | "paddingLeft"
            | "scrollMarginTop"
            | "scrollMarginRight"
            | "scrollMarginBottom"
            | "scrollMarginLeft"
            | "scrollPaddingTop"
            | "scrollPaddingRight"
            | "scrollPaddingBottom"
            | "scrollPaddingLeft"
            | "right"
            | "top"
            | "width"
    ) {
        return 4000;
    }
    3000
}

fn directional_overlap_one_way(left: &StyleProperty, right: &StyleProperty) -> bool {
    let typed_overlap = matches!(
        (left, right),
        (StyleProperty::PaddingInlineStart(_), StyleProperty::PaddingLeft(_))
            | (StyleProperty::PaddingInlineStart(_), StyleProperty::PaddingRight(_))
            | (StyleProperty::PaddingInlineEnd(_), StyleProperty::PaddingLeft(_))
            | (StyleProperty::PaddingInlineEnd(_), StyleProperty::PaddingRight(_))
            | (StyleProperty::MarginInlineStart(_), StyleProperty::MarginLeft(_))
            | (StyleProperty::MarginInlineStart(_), StyleProperty::MarginRight(_))
            | (StyleProperty::MarginInlineEnd(_), StyleProperty::MarginLeft(_))
            | (StyleProperty::MarginInlineEnd(_), StyleProperty::MarginRight(_))
            | (StyleProperty::InsetInlineStart(_), StyleProperty::InsetLeft(_))
            | (StyleProperty::InsetInlineStart(_), StyleProperty::InsetRight(_))
            | (StyleProperty::InsetInlineEnd(_), StyleProperty::InsetLeft(_))
            | (StyleProperty::InsetInlineEnd(_), StyleProperty::InsetRight(_))
            | (
                StyleProperty::ScrollMargin(Edge::InlineStart | Edge::InlineEnd, _),
                StyleProperty::ScrollMargin(Edge::Left | Edge::Right, _),
            )
            | (
                StyleProperty::ScrollPadding(Edge::InlineStart | Edge::InlineEnd, _),
                StyleProperty::ScrollPadding(Edge::Left | Edge::Right, _),
            )
            | (
                StyleProperty::ScrollMargin(Edge::BlockStart | Edge::BlockEnd, _),
                StyleProperty::ScrollMargin(Edge::Top | Edge::Bottom, _),
            )
            | (
                StyleProperty::ScrollPadding(Edge::BlockStart | Edge::BlockEnd, _),
                StyleProperty::ScrollPadding(Edge::Top | Edge::Bottom, _),
            )
            | (
                StyleProperty::BorderLogicalWidth(Edge::InlineStart | Edge::InlineEnd, _),
                StyleProperty::BorderLeftWidth(_) | StyleProperty::BorderRightWidth(_),
            )
            | (
                StyleProperty::BorderLogicalWidth(Edge::BlockStart | Edge::BlockEnd, _),
                StyleProperty::BorderTopWidth(_) | StyleProperty::BorderBottomWidth(_),
            )
            | (
                StyleProperty::BorderInlineStartColor(_) | StyleProperty::BorderInlineEndColor(_),
                StyleProperty::BorderLeftColor(_) | StyleProperty::BorderRightColor(_),
            )
            | (StyleProperty::BorderStartStartRadius(_), StyleProperty::BorderTopLeftRadius(_))
            | (StyleProperty::BorderStartStartRadius(_), StyleProperty::BorderTopRightRadius(_))
            | (StyleProperty::BorderStartEndRadius(_), StyleProperty::BorderTopLeftRadius(_))
            | (StyleProperty::BorderStartEndRadius(_), StyleProperty::BorderTopRightRadius(_))
            | (StyleProperty::BorderEndStartRadius(_), StyleProperty::BorderBottomLeftRadius(_))
            | (StyleProperty::BorderEndStartRadius(_), StyleProperty::BorderBottomRightRadius(_))
            | (StyleProperty::BorderEndEndRadius(_), StyleProperty::BorderBottomLeftRadius(_))
            | (StyleProperty::BorderEndEndRadius(_), StyleProperty::BorderBottomRightRadius(_))
    );
    let style_overlap = match (left, right) {
        (
            StyleProperty::BorderLogicalStyle(Edge::InlineStart | Edge::InlineEnd, _),
            StyleProperty::WebOnly(property, _),
        ) => matches!(property.as_str(), "border-left-style" | "border-right-style"),
        (
            StyleProperty::BorderLogicalStyle(Edge::BlockStart | Edge::BlockEnd, _),
            StyleProperty::WebOnly(property, _),
        ) => matches!(property.as_str(), "border-top-style" | "border-bottom-style"),
        _ => false,
    };
    typed_overlap || style_overlap
}

fn needs_platform_priority(left: &Entry, right: &ResolvedEntry) -> bool {
    let grid_overlap = (left.css_name == "gridColumn" && right.css_name.starts_with("gridColumn"))
        || (right.css_name == "gridColumn" && left.css_name.starts_with("gridColumn"))
        || (left.css_name == "gridRow" && right.css_name.starts_with("gridRow"))
        || (right.css_name == "gridRow" && left.css_name.starts_with("gridRow"));
    grid_overlap
        || left.properties.iter().any(|left| {
            directional_overlap_one_way(left, &right.declaration.property)
                || directional_overlap_one_way(&right.declaration.property, left)
        })
}

fn animation_name_candidate(
    expression: &Expression<'_>,
    keyframes: &HashMap<String, Keyframes>,
) -> Option<StyleProperty> {
    let Expression::Identifier(identifier) = expression else {
        return None;
    };
    keyframes
        .get(identifier.name.as_str())
        .cloned()
        .map(StyleProperty::AnimationName)
}

fn stylex_animation_name(
    expression: &Expression<'_>,
    namespaces: &HashSet<String>,
    keyframes: &HashMap<String, Keyframes>,
) -> Option<Vec<StyleProperty>> {
    if let Some(candidate) = animation_name_candidate(expression, keyframes) {
        return Some(vec![candidate]);
    }
    if let Some(call) = first_that_works_call(expression, namespaces) {
        let candidates = call
            .arguments
            .iter()
            .map(|argument| animation_name_candidate(argument.as_expression()?, keyframes))
            .collect::<Option<Vec<_>>>()?;
        return (!candidates.is_empty())
            .then(|| vec![StyleProperty::FirstThatWorks(candidates)]);
    }
    let Expression::ArrayExpression(array) = expression else {
        return None;
    };
    let mut candidates = array
        .elements
        .iter()
        .map(|element| match element {
            ArrayExpressionElement::Elision(_) | ArrayExpressionElement::SpreadElement(_) => None,
            element => animation_name_candidate(element.as_expression()?, keyframes),
        })
        .collect::<Option<Vec<_>>>()?;
    if candidates.is_empty() {
        return None;
    }
    // A plain StyleX value array is emitted in source order, so its last
    // supported declaration wins. `FirstThatWorks` stores preferred-first
    // and the Web renderer reverses it; reversing here preserves StyleX's
    // distinct array fallback order without adding another IR wrapper.
    candidates.reverse();
    Some(vec![StyleProperty::FirstThatWorks(candidates)])
}

fn property_name_family(property: &str) -> Option<&'static str> {
    let property = canonical_property(property);
    if property.starts_with("padding") {
        Some("padding")
    } else if property.starts_with("margin") {
        Some("margin")
    } else if matches!(property, "top" | "right" | "bottom" | "left")
        || property.starts_with("inset")
    {
        Some("inset")
    } else if matches!(property, "gap" | "rowGap" | "columnGap") {
        Some("gap")
    } else if property == "borderRadius" || property.ends_with("Radius") {
        Some("border-radius")
    } else if property == "borderColor"
        || property.ends_with("Color") && property.starts_with("border")
    {
        Some("border-color")
    } else if property == "borderWidth"
        || property.ends_with("Width") && property.starts_with("border")
    {
        Some("border-width")
    } else if property == "borderStyle"
        || property.ends_with("Style") && property.starts_with("border")
    {
        Some("border-style")
    } else if property == "flex" || matches!(property, "flexGrow" | "flexShrink" | "flexBasis") {
        Some("flex")
    } else if property.starts_with("gridColumn") {
        Some("grid-column")
    } else if property.starts_with("gridRow") {
        Some("grid-row")
    } else if property == "overflow"
        || matches!(property, "overflowX" | "overflowY" | "overflowBlock" | "overflowBlockX")
    {
        Some("overflow")
    } else if property.starts_with("scrollMargin") {
        Some("scroll-margin")
    } else if property.starts_with("scrollPadding") {
        Some("scroll-padding")
    } else if property == "container" || property.starts_with("container") {
        Some("container")
    } else if property == "columns" || matches!(property, "columnCount" | "columnWidth") {
        Some("columns")
    } else if property == "columnRule" || property.starts_with("columnRule") {
        Some("column-rule")
    } else if property == "listStyle" || property.starts_with("listStyle") {
        Some("list-style")
    } else if property == "transition" || property.starts_with("transition") {
        Some("transition")
    } else if property == "background" || property.starts_with("background") {
        Some("background")
    } else if property == "animation" || property.starts_with("animation") {
        Some("animation")
    } else if property == "textDecoration" || property.starts_with("textDecoration") {
        Some("text-decoration")
    } else if property == "textEmphasis" || property.starts_with("textEmphasis") {
        Some("text-emphasis")
    } else if property == "caret" || property.starts_with("caret") {
        Some("caret")
    } else if property == "outline" || property.starts_with("outline") {
        Some("outline")
    } else if matches!(property, "placeContent" | "alignContent" | "justifyContent") {
        Some("place-content")
    } else if matches!(property, "placeItems" | "alignItems" | "justifyItems") {
        Some("place-items")
    } else {
        None
    }
}

fn property_names_overlap(left: &str, right: &str) -> bool {
    let left = canonical_property(left);
    let right = canonical_property(right);
    left == right
        || property_name_family(left)
            .is_some_and(|family| property_name_family(right) == Some(family))
}

/// The static media-query slice shared by Web and React Native.
///
/// Legacy `min-width` is exactly the same inclusive predicate as range
/// syntax. Legacy `max-width` is deliberately absent: CSS makes it
/// inclusive while Hozo's existing `Width { at_least: false }` is `<`, and
/// quietly changing the boundary would be worse than leaving that query to
/// the official StyleX transform.
fn stylex_media_condition(name: &str) -> Option<Condition> {
    let query = name.strip_prefix("@media ")?.trim();
    if query == "print" {
        return Some(Condition::Environment(Environment::Print));
    }
    let width_value = |value: &str| {
        let value = value.trim();
        let number = value.strip_suffix("px").or_else(|| value.strip_suffix("rem"))?;
        number.parse::<f64>().ok()
            .filter(|number| number.is_finite() && *number >= 0.0)
            .map(|_| value.to_string())
    };
    let inner = query.strip_prefix('(').and_then(|query| query.strip_suffix(')'))?;
    let width = |operator: &str, at_least| {
        let (subject, value) = inner.split_once(operator)?;
        (subject.trim() == "width")
            .then(|| width_value(value))
            .flatten()
            .map(|value| Condition::Width { at_least, value })
    };
    inner.strip_prefix("min-width:")
        .and_then(width_value)
        .map(|value| Condition::Width { at_least: true, value })
        .or_else(|| width(">=", true))
        .or_else(|| (!inner.contains("<=")).then(|| width("<", false)).flatten())
        .or(match query {
            "(prefers-color-scheme: dark)" => Some(Condition::Dark),
            "(prefers-reduced-motion: reduce)" => Some(Condition::Environment(Environment::MotionReduce)),
            "(prefers-reduced-motion: no-preference)" => Some(Condition::Environment(Environment::MotionSafe)),
            "(orientation: portrait)" => Some(Condition::Environment(Environment::Portrait)),
            "(orientation: landscape)" => Some(Condition::Environment(Environment::Landscape)),
            "(inverted-colors: inverted)" => Some(Condition::Environment(Environment::InvertedColors)),
            "(prefers-contrast: more)" => Some(Condition::Environment(Environment::ContrastMore)),
            "(prefers-contrast: less)" => Some(Condition::Environment(Environment::ContrastLess)),
            "(forced-colors: active)" => Some(Condition::Environment(Environment::ForcedColors)),
            "(prefers-reduced-transparency: reduce)" => Some(Condition::Environment(Environment::ReduceTransparency)),
            "(scripting: none)" => Some(Condition::Environment(Environment::Noscript)),
            _ => None,
        })
}

/// StyleX's six interaction pseudo-classes already represented by Hozo's
/// condition IR, plus their published 0.19 atomic-priority offsets.
/// Native answers the ones its target exposes and retains the existing
/// explicit diagnostic for conditions such as `:focus-within`.
///
/// `:hover` deliberately reuses Hozo's touch-safe hover contract on Web,
/// including its `(hover: hover)` capability query. That is a stricter
/// condition than StyleX's bare selector, but prevents sticky hover on
/// touch devices and is the same meaning Native's Pressable reports.
fn stylex_pseudo_condition(name: &str) -> Option<(Condition, u16)> {
    Some(match name {
        ":hover" => (Condition::Hover, 130),
        ":focus" => (Condition::Focus, 150),
        ":active" => (Condition::Pressed, 170),
        ":focus-visible" => (Condition::FocusVisible, 40),
        ":focus-within" => (Condition::FocusWithin, 40),
        ":disabled" => (Condition::Disabled, 92),
        _ => return None,
    })
}

fn combine_conditions(outer: &Condition, inner: Condition) -> Condition {
    let mut conditions = match outer {
        Condition::Always => Vec::new(),
        Condition::All(conditions) => conditions.clone(),
        condition => vec![condition.clone()],
    };
    match inner {
        Condition::Always => {}
        Condition::All(inner) => conditions.extend(inner),
        condition => conditions.push(condition),
    }
    Condition::all(conditions)
}

fn resolve_property_priority(mut entries: Vec<ResolvedEntry>) -> Vec<StyleDeclaration> {
    // A higher-priority unconditional declaration makes a lower-priority
    // value for the same final slot unreachable, even when that lower value
    // has a runtime guard. Removing it is necessary on Web because Hozo's
    // guard selector is more specific than its base selector; leaving it in
    // would let selector specificity undo StyleX's property priority.
    let unconditional = entries
        .iter()
        .filter(|entry| entry.declaration.condition == Condition::Always)
        .map(|entry| (entry.priority, entry.declaration.property.clone()))
        .collect::<Vec<_>>();
    entries.retain(|entry| {
        !unconditional.iter().any(|(priority, property)| {
            *priority > entry.priority
                && property.same_property_as(&entry.declaration.property)
        })
    });

    // Stable sort: priority decides across different StyleX property keys;
    // source/argument order remains the tiebreaker within one tier. Both Web
    // declaration order and Native style-array order then inherit the same
    // already-resolved cascade without runtime work.
    entries.sort_by_key(|entry| entry.priority);
    entries
        .into_iter()
        .map(|entry| entry.declaration)
        .collect()
}

fn lower_static_value(name: &str, value: &StaticValue) -> Option<Vec<StyleProperty>> {
    direct_properties(name, value).or_else(|| {
        let token = token_for(name, value)?;
        let (condition, properties) = tailwind::expand_utility(&token);
        (condition == Condition::Always && !properties.is_empty()).then_some(properties)
    })
}

#[allow(clippy::too_many_arguments)]
fn parse_rule_object(
    object: &ObjectExpression,
    namespaces: &HashSet<String>,
    static_objects: &HashMap<String, &ObjectExpression>,
    variables: &StaticVariables,
    keyframes: &HashMap<String, Keyframes>,
    visiting: &mut HashSet<String>,
    out: &mut Vec<Entry>,
    residual: &mut Vec<ResidualProperty>,
    gaps: &mut Vec<Gap>,
    condition: &Condition,
    nesting_priority: u16,
) -> Result<(), Gap> {
    for item in &object.properties {
        let property = match item {
            ObjectPropertyKind::ObjectProperty(property) => property,
            ObjectPropertyKind::SpreadProperty(spread) => {
                let spread_object = match &spread.argument {
                    Expression::ObjectExpression(object) => object,
                    Expression::Identifier(identifier) => {
                        let name = identifier.name.to_string();
                        let Some(object) = static_objects.get(&name) else {
                            return Err(Gap {
                                message: format!(
                                    "StyleX object spread `{name}` must reference a module-scope const object literal."
                                ),
                                span: source_span(spread.span),
                            });
                        };
                        if object.span.end > spread.span.start {
                            return Err(Gap {
                                message: format!(
                                    "StyleX object spread `{name}` must be declared before it is used."
                                ),
                                span: source_span(spread.span),
                            });
                        }
                        if !visiting.insert(name.clone()) {
                            return Err(Gap {
                                message: format!("StyleX object spread `{name}` is recursive."),
                                span: source_span(spread.span),
                            });
                        }
                        parse_rule_object(
                            object,
                            namespaces,
                            static_objects,
                            variables,
                            keyframes,
                            visiting,
                            out,
                            residual,
                            gaps,
                            condition,
                            nesting_priority,
                        )?;
                        visiting.remove(&name);
                        continue;
                    }
                    other => {
                        return Err(Gap {
                            message: "StyleX object spreads must be inline object literals or module-scope const object literals."
                                .to_string(),
                            span: source_span(other.span()),
                        });
                    }
                };
                parse_rule_object(
                    spread_object,
                    namespaces,
                    static_objects,
                    variables,
                    keyframes,
                    visiting,
                    out,
                    residual,
                    gaps,
                    condition,
                    nesting_priority,
                )?;
                continue;
            }
        };
        if property.computed {
            return Err(Gap {
                message: "Computed StyleX property names are not statically lowerable.".to_string(),
                span: source_span(property.span),
            });
        }
        let Some(name) = static_key(&property.key) else {
            return Err(Gap {
                message: "StyleX property names must be identifiers or string literals."
                    .to_string(),
                span: source_span(property.key.span()),
            });
        };
        let nested = if name.starts_with("@media ") {
            Some(stylex_media_condition(&name).map(|condition| (condition, 200)))
        } else if name.starts_with(':') {
            Some(stylex_pseudo_condition(&name))
        } else {
            None
        };
        if let Some(nested) = nested {
            let Some((nested_condition_atom, priority)) = nested else {
                residual.push(ResidualProperty {
                    css_name: name.clone(),
                    span: ExprRef(source_span(property.span)),
                });
                gaps.push(Gap {
                    message: format!("StyleX nested condition `{name}` is outside Hozo's cross-platform condition subset."),
                    span: source_span(property.key.span()),
                });
                continue;
            };
            let Expression::ObjectExpression(nested_object) = &property.value else {
                residual.push(ResidualProperty {
                    css_name: name.clone(),
                    span: ExprRef(source_span(property.span)),
                });
                gaps.push(Gap {
                    message: "StyleX nested-condition values must be static object literals.".to_string(),
                    span: source_span(property.value.span()),
                });
                continue;
            };

            // A residual child cannot be copied out of its media wrapper.
            // Parse transactionally: either the whole nested object becomes
            // typed IR, or the original outer property stays intact for the
            // official transform. This prevents supported siblings from
            // being emitted twice when one child is unsupported.
            // StyleX reverses nested at-rule wrappers: an inner query is
            // emitted around the outer one. Prepending here preserves that
            // observable order when the Web backend renders `Condition::All`.
            let nested_condition = combine_conditions(&nested_condition_atom, condition.clone());
            let mut nested_entries = Vec::new();
            let mut nested_residual = Vec::new();
            let mut nested_gaps = Vec::new();
            parse_rule_object(
                nested_object,
                namespaces,
                static_objects,
                variables,
                keyframes,
                visiting,
                &mut nested_entries,
                &mut nested_residual,
                &mut nested_gaps,
                &nested_condition,
                nesting_priority.saturating_add(priority),
            )?;
            if nested_residual.is_empty() {
                out.extend(nested_entries);
            } else {
                for child in nested_residual {
                    residual.push(ResidualProperty {
                        css_name: child.css_name,
                        span: ExprRef(source_span(property.span)),
                    });
                }
                gaps.extend(nested_gaps);
            }
            continue;
        }
        let properties = if name == "animationName" {
            let Some(properties) =
                stylex_animation_name(&property.value, namespaces, keyframes)
            else {
                residual.push(ResidualProperty {
                    css_name: canonical_property(&name).to_string(),
                    span: ExprRef(source_span(property.span)),
                });
                gaps.push(Gap {
                    message: "StyleX `animationName` lowers local static `stylex.keyframes` bindings, including static `firstThatWorks` and array fallbacks."
                        .to_string(),
                    span: source_span(property.value.span()),
                });
                continue;
            };
            properties
        } else if let Some(call) = first_that_works_call(&property.value, namespaces) {
            let candidates = call
                .arguments
                .iter()
                .map(|argument| {
                    argument
                        .as_expression()
                        .and_then(|expression| resolved_static_value(expression, variables))
                })
                .collect::<Option<Vec<_>>>()
                .and_then(|values| {
                    (!values.is_empty()).then_some(values)
                })
                .and_then(|values| {
                    values
                        .iter()
                        .map(|value| lower_static_value(&name, value))
                        .collect::<Option<Vec<_>>>()
                })
                .and_then(|groups| {
                    groups
                        .into_iter()
                        .map(|mut group| (group.len() == 1).then(|| group.pop().unwrap()))
                        .collect::<Option<Vec<_>>>()
                })
                .filter(|candidates| {
                    candidates.first().is_some_and(|first| {
                        candidates
                            .iter()
                            .skip(1)
                            .all(|candidate| first.same_property_as(candidate))
                    })
                });
            let Some(candidates) = candidates else {
                residual.push(ResidualProperty {
                    css_name: canonical_property(&name).to_string(),
                    span: ExprRef(source_span(property.span)),
                });
                gaps.push(Gap {
                    message: format!(
                        "StyleX `firstThatWorks` for `{name}` needs one or more static candidates that lower to the same typed property."
                    ),
                    span: source_span(property.value.span()),
                });
                continue;
            };
            vec![StyleProperty::FirstThatWorks(candidates)]
        } else {
            let Some(value) = resolved_static_value(&property.value, variables) else {
                residual.push(ResidualProperty {
                    css_name: canonical_property(&name).to_string(),
                    span: ExprRef(source_span(property.span)),
                });
                gaps.push(Gap {
                    message: format!(
                        "`{name}` has a dynamic or nested StyleX value; this frontend slice accepts static strings, numbers, and safe local `defineVars` members."
                    ),
                    span: source_span(property.value.span()),
                });
                continue;
            };
            match lower_static_value(&name, &value) {
                Some(properties) => properties,
                None => {
                    residual.push(ResidualProperty {
                        css_name: canonical_property(&name).to_string(),
                        span: ExprRef(source_span(property.span)),
                    });
                    gaps.push(Gap {
                        message: format!(
                            "StyleX property `{name}` or its value is not in Hozo's typed universal subset yet."
                        ),
                        span: source_span(property.span),
                    });
                    continue;
                }
            }
        };
        out.push(Entry {
            css_name: canonical_property(&name).to_string(),
            // StyleX assigns each nested condition a published offset.
            // Carrying their sum makes a conditional declaration sort after
            // its base even when the author wrote the nested object first.
            priority: property_priority(&name).saturating_add(nesting_priority),
            properties,
            condition: condition.clone(),
            span: source_span(property.span),
        });
    }
    Ok(())
}

#[allow(clippy::type_complexity)]
fn parse_rule(
    expression: &Expression,
    namespaces: &HashSet<String>,
    static_objects: &HashMap<String, &ObjectExpression>,
    variables: &StaticVariables,
    keyframes: &HashMap<String, Keyframes>,
) -> Result<(Vec<Entry>, Vec<ResidualProperty>, Vec<Gap>), Gap> {
    let Expression::ObjectExpression(object) = expression else {
        return Err(Gap {
            message: "StyleX style entries must be static object literals.".to_string(),
            span: source_span(expression.span()),
        });
    };
    let mut out = Vec::new();
    let mut residual = Vec::new();
    let mut gaps = Vec::new();
    parse_rule_object(
        object,
        namespaces,
        static_objects,
        variables,
        keyframes,
        &mut HashSet::new(),
        &mut out,
        &mut residual,
        &mut gaps,
        &Condition::Always,
        0,
    )?;
    Ok((out, residual, gaps))
}

fn parse_function_rule(
    arrow: &ArrowFunctionExpression,
    variables: &StaticVariables,
) -> Result<Vec<FunctionEntry>, Gap> {
    if arrow.r#async || arrow.params.items.len() != 1 || arrow.params.rest.is_some() {
        return Err(Gap {
            message: "Static StyleX function styles require one synchronous positional parameter."
                .to_string(),
            span: source_span(arrow.span),
        });
    }
    let parameter = &arrow.params.items[0];
    if parameter.initializer.is_some() {
        return Err(Gap {
            message: "Default parameters in StyleX function styles are not statically evaluated."
                .to_string(),
            span: source_span(parameter.span),
        });
    }
    let BindingPattern::BindingIdentifier(parameter) = &parameter.pattern else {
        return Err(Gap {
            message: "Destructured StyleX function-style parameters are not statically evaluated."
                .to_string(),
            span: source_span(parameter.span),
        });
    };
    let Some(Expression::ObjectExpression(object)) =
        arrow.get_expression().map(Expression::without_parentheses)
    else {
        return Err(Gap {
            message: "Static StyleX function styles require a concise object-expression body."
                .to_string(),
            span: source_span(arrow.body.span()),
        });
    };

    object
        .properties
        .iter()
        .map(|item| {
            let ObjectPropertyKind::ObjectProperty(property) = item else {
                return Err(Gap {
                    message: "Object spreads in StyleX function styles are not statically evaluated."
                        .to_string(),
                    span: source_span(item.span()),
                });
            };
            if property.computed {
                return Err(Gap {
                    message: "Computed properties in StyleX function styles are not statically evaluated."
                        .to_string(),
                    span: source_span(property.span),
                });
            }
            let Some(name) = static_key(&property.key) else {
                return Err(Gap {
                    message: "StyleX function-style property names must be static.".to_string(),
                    span: source_span(property.key.span()),
                });
            };
            if name.starts_with(':') || name.starts_with('@') {
                return Err(Gap {
                    message: "Nested conditions in StyleX function styles remain with the official transform."
                        .to_string(),
                    span: source_span(property.span),
                });
            }
            let value = match &property.value {
                Expression::Identifier(identifier)
                    if identifier.name.as_str() == parameter.name.as_str() =>
                {
                    FunctionValue::Argument
                }
                expression => resolved_static_value(expression, variables)
                    .map(FunctionValue::Static)
                    .ok_or_else(|| Gap {
                        message: "A static StyleX function-style body may use its parameter or static values."
                            .to_string(),
                        span: source_span(expression.span()),
                    })?,
            };
            Ok(FunctionEntry {
                name: name.clone(),
                css_name: canonical_property(&name).to_string(),
                priority: property_priority(&name),
                value,
                span: source_span(property.span),
            })
        })
        .collect()
}

#[derive(Default)]
struct StaticVariableUses {
    references: HashMap<String, usize>,
    member_reads: HashMap<String, usize>,
}

impl<'a> Visit<'a> for StaticVariableUses {
    fn visit_identifier_reference(&mut self, identifier: &IdentifierReference<'a>) {
        *self.references.entry(identifier.name.to_string()).or_default() += 1;
    }

    fn visit_static_member_expression(&mut self, member: &StaticMemberExpression<'a>) {
        if let Expression::Identifier(identifier) = &member.object {
            *self
                .member_reads
                .entry(identifier.name.to_string())
                .or_default() += 1;
        }
        walk_static_member_expression(self, member);
    }
}

fn define_vars_object<'a>(
    call: &'a CallExpression<'a>,
    namespaces: &HashSet<String>,
) -> Option<&'a ObjectExpression<'a>> {
    let Expression::StaticMemberExpression(member) = &call.callee else {
        return None;
    };
    let Expression::Identifier(object) = &member.object else {
        return None;
    };
    if member.property.name.as_str() != "defineVars"
        || !namespaces.contains(object.name.as_str())
    {
        return None;
    }
    match call.arguments.first()? {
        Argument::ObjectExpression(object) => Some(object),
        _ => None,
    }
}

/// Collect only local token tables that cannot participate in a theme.
///
/// An exported table may be passed to `createTheme` in another module, and a
/// bare local reference may do the same in this one. In either case replacing
/// its CSS variable with the default would be observably wrong, so those stay
/// with the official StyleX transform. A non-exported table whose every use is
/// a static member read is immutable compile-time data and can safely join the
/// universal typed-property path without runtime variable resolution.
fn module_static_variables(
    program: &oxc_ast::ast::Program,
    module: &ModuleRecord,
    namespaces: &HashSet<String>,
) -> (StaticVariables, Vec<SourceSpan>) {
    let mut variables = StaticVariables::new();
    let mut spans = HashMap::new();
    for statement in &program.body {
        let Statement::VariableDeclaration(declaration) = statement else {
            continue;
        };
        if declaration.kind != VariableDeclarationKind::Const {
            continue;
        }
        for declarator in &declaration.declarations {
            let BindingPattern::BindingIdentifier(identifier) = &declarator.id else {
                continue;
            };
            if module.exported_bindings.contains_key(identifier.name.as_str()) {
                continue;
            }
            let Some(Expression::CallExpression(call)) = &declarator.init else {
                continue;
            };
            let Some(object) = define_vars_object(call, namespaces) else {
                continue;
            };
            let values = object
                .properties
                .iter()
                .map(|item| {
                    let ObjectPropertyKind::ObjectProperty(property) = item else {
                        return None;
                    };
                    if property.computed {
                        return None;
                    }
                    Some((static_key(&property.key)?, static_value(&property.value)?))
                })
                .collect::<Option<HashMap<_, _>>>();
            let Some(values) = values else {
                continue;
            };
            variables.insert(identifier.name.to_string(), values);
            spans.insert(identifier.name.to_string(), source_span(object.span));
        }
    }

    let mut uses = StaticVariableUses::default();
    uses.visit_program(program);
    variables.retain(|name, _| {
        uses.references.get(name).copied().unwrap_or_default()
            == uses.member_reads.get(name).copied().unwrap_or_default()
    });
    let scan_spans = variables
        .keys()
        .filter_map(|name| spans.get(name).copied())
        .collect();
    (variables, scan_spans)
}

#[derive(Default)]
struct StaticObjectUses {
    references: HashMap<String, usize>,
    spreads: HashMap<String, usize>,
}

impl<'a> Visit<'a> for StaticObjectUses {
    fn visit_identifier_reference(&mut self, identifier: &IdentifierReference<'a>) {
        *self.references.entry(identifier.name.to_string()).or_default() += 1;
    }

    fn visit_object_expression(&mut self, object: &ObjectExpression<'a>) {
        for property in &object.properties {
            let ObjectPropertyKind::SpreadProperty(spread) = property else {
                continue;
            };
            let Expression::Identifier(identifier) = &spread.argument else {
                continue;
            };
            *self.spreads.entry(identifier.name.to_string()).or_default() += 1;
        }
        walk_object_expression(self, object);
    }
}

fn module_static_objects<'a>(
    program: &'a oxc_ast::ast::Program<'a>,
    module: &ModuleRecord<'a>,
) -> HashMap<String, &'a ObjectExpression<'a>> {
    let mut objects = HashMap::new();
    for statement in &program.body {
        let Statement::VariableDeclaration(declaration) = statement else {
            continue;
        };
        if declaration.kind != VariableDeclarationKind::Const {
            continue;
        }
        for declarator in &declaration.declarations {
            let BindingPattern::BindingIdentifier(identifier) = &declarator.id else {
                continue;
            };
            let Some(Expression::ObjectExpression(object)) = &declarator.init else {
                continue;
            };
            objects.insert(identifier.name.to_string(), object.as_ref());
        }
    }
    let mut uses = StaticObjectUses::default();
    uses.visit_program(program);
    objects.retain(|name, _| {
        uses.references.get(name).copied().unwrap_or_default()
            == uses.spreads.get(name).copied().unwrap_or_default()
            && !module.exported_bindings.contains_key(name.as_str())
    });
    objects
}

fn create_object<'a>(
    call: &'a CallExpression<'a>,
    namespaces: &HashSet<String>,
) -> Option<&'a ObjectExpression<'a>> {
    let Expression::StaticMemberExpression(member) = &call.callee else {
        return None;
    };
    let Expression::Identifier(object) = &member.object else {
        return None;
    };
    if member.property.name.as_str() != "create" || !namespaces.contains(object.name.as_str()) {
        return None;
    }
    match call.arguments.first()? {
        Argument::ObjectExpression(object) => Some(object),
        _ => None,
    }
}

fn keyframes_object<'a>(
    call: &'a CallExpression<'a>,
    namespaces: &HashSet<String>,
) -> Option<&'a ObjectExpression<'a>> {
    let Expression::StaticMemberExpression(member) = &call.callee else {
        return None;
    };
    let Expression::Identifier(object) = &member.object else {
        return None;
    };
    if member.property.name.as_str() != "keyframes" || !namespaces.contains(object.name.as_str()) {
        return None;
    }
    match call.arguments.first()? {
        Argument::ObjectExpression(object) if call.arguments.len() == 1 => Some(object),
        _ => None,
    }
}

fn valid_keyframe_selector(selector: &str) -> bool {
    selector.split(',').all(|part| {
        let part = part.trim();
        matches!(part, "from" | "to")
            || part
                .strip_suffix('%')
                .and_then(|number| number.parse::<f64>().ok())
                .is_some_and(|number| (0.0..=100.0).contains(&number))
    })
}

fn keyframes_name(frames: &[Keyframe]) -> String {
    // FNV-1a is deliberately tiny and stable. This is an identifier, not a
    // security boundary; hashing the canonical typed representation makes
    // formatting-only source edits retain the same animation name.
    let mut hash = 0xcbf29ce484222325u64;
    for byte in format!("{frames:?}").bytes() {
        hash ^= u64::from(byte);
        hash = hash.wrapping_mul(0x100000001b3);
    }
    format!("hozo-kf-{hash:016x}")
}

fn module_keyframes(
    program: &oxc_ast::ast::Program,
    namespaces: &HashSet<String>,
    variables: &StaticVariables,
) -> (HashMap<String, Keyframes>, Vec<SourceSpan>) {
    let mut keyframes = HashMap::new();
    let mut spans = Vec::new();
    for statement in &program.body {
        let Statement::VariableDeclaration(declaration) = statement else {
            continue;
        };
        if declaration.kind != VariableDeclarationKind::Const {
            continue;
        }
        for declarator in &declaration.declarations {
            let BindingPattern::BindingIdentifier(identifier) = &declarator.id else {
                continue;
            };
            let Some(Expression::CallExpression(call)) = &declarator.init else {
                continue;
            };
            let Some(object) = keyframes_object(call, namespaces) else {
                continue;
            };
            let frames = object
                .properties
                .iter()
                .map(|item| {
                    let ObjectPropertyKind::ObjectProperty(frame) = item else {
                        return None;
                    };
                    if frame.computed {
                        return None;
                    }
                    let selector = static_key(&frame.key)?;
                    if !valid_keyframe_selector(&selector) {
                        return None;
                    }
                    let Expression::ObjectExpression(declarations) = &frame.value else {
                        return None;
                    };
                    let properties = declarations
                        .properties
                        .iter()
                        .map(|item| {
                            let ObjectPropertyKind::ObjectProperty(property) = item else {
                                return None;
                            };
                            if property.computed {
                                return None;
                            }
                            let name = static_key(&property.key)?;
                            if name.starts_with(':') || name.starts_with('@') {
                                return None;
                            }
                            let value = resolved_static_value(&property.value, variables)?;
                            lower_static_value(&name, &value)
                        })
                        .collect::<Option<Vec<_>>>()?
                        .into_iter()
                        .flatten()
                        .collect::<Vec<_>>();
                    (!properties.is_empty()).then_some(Keyframe { selector, properties })
                })
                .collect::<Option<Vec<_>>>();
            let Some(frames) = frames.filter(|frames| !frames.is_empty()) else {
                continue;
            };
            spans.push(source_span(object.span));
            keyframes.insert(
                identifier.name.to_string(),
                Keyframes { name: keyframes_name(&frames), frames },
            );
        }
    }
    (keyframes, spans)
}

struct SheetCollector<'n, 'a> {
    namespaces: &'n HashSet<String>,
    static_objects: &'n HashMap<String, &'a ObjectExpression<'a>>,
    variables: &'n StaticVariables,
    keyframes: &'n HashMap<String, Keyframes>,
    sheets: HashMap<String, HashMap<String, Rule>>,
    scan_spans: Vec<SourceSpan>,
    function_depth: usize,
}

struct ExportedVariableCollector<'n> {
    namespaces: &'n HashSet<String>,
    aliases: &'n HashMap<String, Vec<String>>,
    exports: Vec<ModuleExportSummary>,
    function_depth: usize,
}

impl<'a> Visit<'a> for ExportedVariableCollector<'_> {
    fn visit_function(&mut self, function: &Function<'a>, flags: ScopeFlags) {
        self.function_depth += 1;
        walk_function(self, function, flags);
        self.function_depth -= 1;
    }

    fn visit_arrow_function_expression(&mut self, function: &ArrowFunctionExpression<'a>) {
        self.function_depth += 1;
        walk_arrow_function_expression(self, function);
        self.function_depth -= 1;
    }

    fn visit_variable_declarator(&mut self, declarator: &VariableDeclarator<'a>) {
        if self.function_depth > 0 {
            walk_variable_declarator(self, declarator);
            return;
        }
        let BindingPattern::BindingIdentifier(identifier) = &declarator.id else {
            walk_variable_declarator(self, declarator);
            return;
        };
        let local = identifier.name.as_str();
        let Some(exported_names) = self.aliases.get(local) else {
            walk_variable_declarator(self, declarator);
            return;
        };
        let Some(Expression::CallExpression(call)) = &declarator.init else {
            walk_variable_declarator(self, declarator);
            return;
        };
        let Some(object) = define_vars_object(call, self.namespaces) else {
            walk_variable_declarator(self, declarator);
            return;
        };
        let mut members = object
            .properties
            .iter()
            .filter_map(|item| {
                let ObjectPropertyKind::ObjectProperty(property) = item else {
                    return None;
                };
                let name = static_key(&property.key)?;
                Some(ModuleMemberSummary {
                    name,
                    status: if static_value(&property.value).is_some() {
                        ModuleMemberStatus::Static
                    } else {
                        ModuleMemberStatus::Unsupported
                    },
                })
            })
            .collect::<Vec<_>>();
        members.sort_by(|left, right| left.name.cmp(&right.name));
        for exported in exported_names {
            self.exports.push(ModuleExportSummary {
                exported: exported.clone(),
                local: local.to_string(),
                kind: ModuleExportKind::Variables,
                members: members.clone(),
            });
        }
        walk_variable_declarator(self, declarator);
    }
}

impl<'a> Visit<'a> for SheetCollector<'_, 'a> {
    // Module-scope only. Without semantic reference resolution, accepting a
    // local `const styles` would make two functions using that common name
    // overwrite each other in this map and silently apply the last sheet to
    // both. Cross-scope support waits for symbol IDs; declining is exact.
    fn visit_function(&mut self, function: &Function<'a>, flags: ScopeFlags) {
        self.function_depth += 1;
        walk_function(self, function, flags);
        self.function_depth -= 1;
    }

    fn visit_arrow_function_expression(&mut self, function: &ArrowFunctionExpression<'a>) {
        self.function_depth += 1;
        walk_arrow_function_expression(self, function);
        self.function_depth -= 1;
    }

    fn visit_variable_declarator(&mut self, declarator: &VariableDeclarator<'a>) {
        let BindingPattern::BindingIdentifier(identifier) = &declarator.id else {
            walk_variable_declarator(self, declarator);
            return;
        };
        let Some(Expression::CallExpression(call)) = &declarator.init else {
            walk_variable_declarator(self, declarator);
            return;
        };
        let Some(object) = create_object(call, self.namespaces) else {
            walk_variable_declarator(self, declarator);
            return;
        };
        self.scan_spans.push(source_span(object.span));
        if self.function_depth > 0 {
            walk_variable_declarator(self, declarator);
            return;
        }
        let mut rules = HashMap::new();
        for item in &object.properties {
            let ObjectPropertyKind::ObjectProperty(property) = item else {
                continue;
            };
            let Some(name) = static_key(&property.key) else {
                continue;
            };
            let rule = match &property.value {
                Expression::ArrowFunctionExpression(arrow) => {
                    match parse_function_rule(arrow, self.variables) {
                        Ok(entries) => Rule::Function { entries },
                        Err(gap) => Rule::Gap(gap),
                    }
                }
                expression => match parse_rule(
                    expression,
                    self.namespaces,
                    self.static_objects,
                    self.variables,
                    self.keyframes,
                ) {
                    Ok((entries, residual, gaps)) => Rule::Ready {
                        entries,
                        residual,
                        gaps,
                    },
                    Err(gap) => Rule::Gap(gap),
                },
            };
            rules.insert(name, rule);
        }
        self.sheets.insert(identifier.name.to_string(), rules);
        walk_variable_declarator(self, declarator);
    }
}

fn export_aliases(module: &ModuleRecord) -> HashMap<String, Vec<String>> {
    let mut aliases: HashMap<String, Vec<String>> = HashMap::new();
    for entry in &module.local_export_entries {
        if entry.is_type {
            continue;
        }
        let Some(local) = entry.local_name.name() else {
            continue;
        };
        let exported = match &entry.export_name {
            ExportExportName::Name(name) => name.name.to_string(),
            ExportExportName::Default(_) => "default".to_string(),
            ExportExportName::Null => continue,
        };
        aliases.entry(local.to_string()).or_default().push(exported);
    }
    for names in aliases.values_mut() {
        names.sort();
        names.dedup();
    }
    aliases
}

impl Frontend {
    pub(crate) fn collect<'a>(
        program: &oxc_ast::ast::Program<'a>,
        module: &ModuleRecord<'a>,
    ) -> Self {
        let namespaces: HashSet<String> = module
            .import_entries
            .iter()
            .filter(|entry| !entry.is_type && entry.module_request.name.as_str() == STYLEX_MODULE)
            .map(|entry| entry.local_name.name.to_string())
            .collect();
        if namespaces.is_empty() {
            return Self::default();
        }
        let static_objects = module_static_objects(program, module);
        let (variables, variable_spans) = module_static_variables(program, module, &namespaces);
        let (keyframes, keyframe_spans) = module_keyframes(program, &namespaces, &variables);
        let (sheets, scan_spans) = {
            let mut collector = SheetCollector {
                namespaces: &namespaces,
                static_objects: &static_objects,
                variables: &variables,
                keyframes: &keyframes,
                sheets: HashMap::new(),
                scan_spans: Vec::new(),
                function_depth: 0,
            };
            collector.visit_program(program);
            (collector.sheets, collector.scan_spans)
        };
        let mut scan_spans = scan_spans;
        scan_spans.extend(variable_spans);
        scan_spans.extend(keyframe_spans);
        Self {
            namespaces,
            sheets,
            variables,
            scan_spans,
        }
    }

    pub(crate) fn module_summary(
        &self,
        program: &oxc_ast::ast::Program,
        module: &ModuleRecord,
    ) -> ModuleSummary {
        let aliases = export_aliases(module);

        let mut exports = Vec::new();
        for (local, rules) in &self.sheets {
            let Some(exported_names) = aliases.get(local) else {
                continue;
            };
            let mut members = rules
                .iter()
                .map(|(name, rule)| ModuleMemberSummary {
                    name: name.clone(),
                    status: match rule {
                        Rule::Ready { residual, .. } if residual.is_empty() => {
                            ModuleMemberStatus::Static
                        }
                        Rule::Ready { entries, .. } if entries.is_empty() => {
                            ModuleMemberStatus::Unsupported
                        }
                        Rule::Ready { .. } => ModuleMemberStatus::Partial,
                        Rule::Function { .. } => ModuleMemberStatus::Function,
                        Rule::Gap(_) => ModuleMemberStatus::Unsupported,
                    },
                })
                .collect::<Vec<_>>();
            members.sort_by(|left, right| left.name.cmp(&right.name));
            for exported in exported_names {
                exports.push(ModuleExportSummary {
                    exported: exported.clone(),
                    local: local.clone(),
                    kind: ModuleExportKind::Sheet,
                    members: members.clone(),
                });
            }
        }

        // Exported defineVars tables deliberately do not enter
        // `self.variables`: another module may pass one to createTheme, so
        // flattening its defaults would be wrong. They still belong in the
        // graph summary, which is what lets the theme slice resolve them
        // later without weakening that safety rule now.
        let mut variable_collector = ExportedVariableCollector {
            namespaces: &self.namespaces,
            aliases: &aliases,
            exports: Vec::new(),
            function_depth: 0,
        };
        variable_collector.visit_program(program);
        exports.extend(variable_collector.exports);
        exports.sort_by(|left, right| {
            left.exported
                .cmp(&right.exported)
                .then_with(|| left.local.cmp(&right.local))
        });
        let mut reexports = module
            .indirect_export_entries
            .iter()
            .chain(module.star_export_entries.iter())
            .filter(|entry| !entry.is_type)
            .filter_map(|entry| {
                let specifier = entry.module_request.as_ref()?.name.to_string();
                let imported = match &entry.import_name {
                    ExportImportName::Name(name) => name.name.to_string(),
                    ExportImportName::AllButDefault => "*".to_string(),
                    ExportImportName::All => "*".to_string(),
                    ExportImportName::Null => return None,
                };
                let exported = match &entry.export_name {
                    ExportExportName::Name(name) => name.name.to_string(),
                    ExportExportName::Default(_) => "default".to_string(),
                    ExportExportName::Null if imported == "*" => "*".to_string(),
                    ExportExportName::Null => return None,
                };
                Some(ModuleReexportSummary { specifier, imported, exported })
            })
            .collect::<Vec<_>>();
        reexports.sort_by(|left, right| {
            left.specifier
                .cmp(&right.specifier)
                .then_with(|| left.exported.cmp(&right.exported))
                .then_with(|| left.imported.cmp(&right.imported))
        });
        let mut imports = module
            .import_entries
            .iter()
            .filter(|entry| !entry.is_type)
            .map(|entry| entry.module_request.name.to_string())
            .collect::<Vec<_>>();
        imports.sort();
        imports.dedup();
        ModuleSummary { exports, reexports, imports }
    }

    fn exported_static_sheets(
        &self,
        module: &ModuleRecord,
    ) -> HashMap<String, HashMap<String, Rule>> {
        let aliases = export_aliases(module);
        let mut exports = HashMap::new();
        for (local, rules) in &self.sheets {
            let Some(exported_names) = aliases.get(local) else {
                continue;
            };
            let static_rules = rules
                .iter()
                .filter_map(|(name, rule)| match rule {
                    Rule::Ready { residual, gaps, .. }
                        if residual.is_empty() && gaps.is_empty() =>
                    {
                        Some((name.clone(), rule.clone()))
                    }
                    Rule::Function { .. } => Some((name.clone(), rule.clone())),
                    _ => None,
                })
                .collect::<HashMap<_, _>>();
            if static_rules.is_empty() {
                continue;
            }
            for exported in exported_names {
                exports.insert(exported.clone(), static_rules.clone());
            }
        }
        exports
    }

    fn props_namespace<'a>(&self, call: &'a CallExpression) -> Option<&'a str> {
        let Expression::StaticMemberExpression(member) = &call.callee else {
            return None;
        };
        let Expression::Identifier(object) = &member.object else {
            return None;
        };
        (member.property.name.as_str() == "props" && self.namespaces.contains(object.name.as_str()))
            .then_some(object.name.as_str())
    }

    fn rule_from_member(
        &self,
        member: &oxc_ast::ast::StaticMemberExpression,
    ) -> Result<&Rule, Gap> {
        let Some(sheet) = static_member_path(&member.object) else {
            return Err(Gap {
                message: "StyleX styles must be referenced through a static member chain such as `styles.rule` or `namespace.styles.rule`.".to_string(),
                span: source_span(member.span),
            });
        };
        let Some(rules) = self.sheets.get(&sheet) else {
            return Err(Gap {
                message: format!(
                    "StyleX sheet `{}` is not a registered or same-file module-scope static `stylex.create` binding.",
                    sheet
                ),
                span: source_span(member.span),
            });
        };
        rules.get(member.property.name.as_str()).ok_or_else(|| Gap {
            message: format!(
                "StyleX rule `{}.{}` was not found in its static definition.",
                sheet, member.property.name
            ),
            span: source_span(member.span),
        })
    }

    fn append_entries(
        &self,
        entries: &[Entry],
        argument_condition: Condition,
        out: &mut Vec<ResolvedEntry>,
    ) -> Result<(), Gap> {
        let mut previous_arguments = std::mem::take(out);
        let mut current_argument: Vec<ResolvedEntry> = Vec::new();
        for entry in entries {
            let condition = combine_conditions(&entry.condition, argument_condition.clone());
            // Logical/physical edge conflicts need the element's resolved
            // writing direction on Native, and grid shorthands cannot be
            // split into independent lines without changing placement.
            // Keep those two genuinely platform-dependent cases explicit;
            // ordinary shorthand/longhand priority is resolved below.
            if previous_arguments
                .iter()
                .chain(current_argument.iter())
                .any(|existing| needs_platform_priority(entry, existing))
            {
                return Err(Gap {
                    message: format!(
                        "StyleX `{}` overlaps a logical/physical edge or grid shorthand whose Native priority needs runtime context.",
                        entry.css_name
                    ),
                    span: entry.span,
                });
            }
            // For the same StyleX property namespace, later unconditional
            // arguments remove an earlier conditional value exactly as
            // styleq does. A later conditional stays beside the base and
            // overrides only while its guard is true.
            if argument_condition == Condition::Always && entry.condition == Condition::Always {
                previous_arguments.retain(|existing| {
                    existing.css_name != entry.css_name
                        || !entry.properties.iter().any(|property| {
                            property.same_property_as(&existing.declaration.property)
                        })
                });
            }
            // Duplicate keys within one object are last-wins only in the
            // same condition. A base declaration and a media declaration
            // in that object must coexist regardless of their source order.
            current_argument.retain(|existing| {
                existing.declaration.condition != condition
                    || existing.css_name != entry.css_name
                    || !entry.properties.iter().any(|property| {
                        property.same_property_as(&existing.declaration.property)
                    })
            });
            current_argument.extend(
                entry
                    .properties
                    .iter()
                    .cloned()
                    .map(|property| ResolvedEntry {
                        css_name: entry.css_name.clone(),
                        priority: entry.priority,
                        declaration: StyleDeclaration {
                            property,
                            condition: condition.clone(),
                        },
                    }),
            );
        }
        out.extend(previous_arguments);
        out.extend(current_argument);
        Ok(())
    }

    fn resolve_function_call(
        &self,
        call: &CallExpression,
        condition: Option<ConditionExpr>,
        declarations: &mut Vec<ResolvedEntry>,
    ) -> Result<(), Gap> {
        let Expression::StaticMemberExpression(member) = &call.callee else {
            return Err(Gap {
                message: "StyleX function styles must be called as `styles.rule(value)`."
                    .to_string(),
                span: source_span(call.span),
            });
        };
        let entries = match self.rule_from_member(member)? {
            Rule::Function { entries } => entries,
            Rule::Gap(gap) => {
                return Err(Gap {
                    message: gap.message.clone(),
                    span: source_span(call.span),
                });
            }
            Rule::Ready { .. } => {
                return Err(Gap {
                    message: "Only a function-style StyleX rule can be called.".to_string(),
                    span: source_span(call.span),
                });
            }
        };
        if call.arguments.len() != 1 {
            return Err(Gap {
                message: "Static StyleX function styles require exactly one call argument."
                    .to_string(),
                span: source_span(call.span),
            });
        }
        let Some(argument) = call.arguments[0].as_expression() else {
            return Err(Gap {
                message: "Spread arguments in StyleX function styles are not statically evaluated."
                    .to_string(),
                span: source_span(call.arguments[0].span()),
            });
        };
        let Some(argument) = resolved_static_value(argument, &self.variables) else {
            return Err(Gap {
                message: "This StyleX function style has a runtime argument; Hozo currently lowers only static calls and leaves runtime values with the official transform."
                    .to_string(),
                span: source_span(argument.span()),
            });
        };
        let entries = entries
            .iter()
            .map(|entry| {
                let value = match &entry.value {
                    FunctionValue::Argument => &argument,
                    FunctionValue::Static(value) => value,
                };
                let Some(properties) = lower_static_value(&entry.name, value) else {
                    return Err(Gap {
                        message: format!(
                            "StyleX function-style property `{}` or its called value is not in Hozo's typed universal subset yet.",
                            entry.name
                        ),
                        span: source_span(call.span),
                    });
                };
                Ok(Entry {
                    css_name: entry.css_name.clone(),
                    priority: entry.priority,
                    properties,
                    condition: Condition::Always,
                    span: entry.span,
                })
            })
            .collect::<Result<Vec<_>, _>>()?;
        let declaration_condition = condition.map_or(Condition::Always, Condition::Expr);
        self.append_entries(&entries, declaration_condition, declarations)
    }

    fn resolve_props_expression(
        &self,
        expression: &Expression,
        condition: Option<ConditionExpr>,
        declarations: &mut Vec<ResolvedEntry>,
        residual_arguments: &mut Vec<StylexResidualArgument>,
        residual_properties: &mut Vec<ResidualProperty>,
        gaps: &mut Vec<Gap>,
    ) -> Result<(), Gap> {
        if let Expression::CallExpression(call) = expression {
            return self.resolve_function_call(call, condition, declarations);
        }
        let member = match expression {
            Expression::StaticMemberExpression(member) => member,
            Expression::LogicalExpression(logical)
                if logical.operator == LogicalOperator::And =>
            {
                let guard = ConditionExpr::Ref(ExprRef(source_span(logical.left.span())));
                let condition = Some(match condition {
                    Some(existing) => ConditionExpr::And(Box::new(existing), Box::new(guard)),
                    None => guard,
                });
                return self.resolve_props_expression(
                    &logical.right,
                    condition,
                    declarations,
                    residual_arguments,
                    residual_properties,
                    gaps,
                );
            }
            Expression::ConditionalExpression(conditional) => {
                let guard = ConditionExpr::Ref(ExprRef(source_span(conditional.test.span())));
                let when_true = Some(match condition.clone() {
                    Some(existing) => {
                        ConditionExpr::And(Box::new(existing), Box::new(guard.clone()))
                    }
                    None => guard.clone(),
                });
                self.resolve_props_expression(
                    &conditional.consequent,
                    when_true,
                    declarations,
                    residual_arguments,
                    residual_properties,
                    gaps,
                )?;
                let negated = ConditionExpr::Not(Box::new(guard));
                let when_false = Some(match condition {
                    Some(existing) => {
                        ConditionExpr::And(Box::new(existing), Box::new(negated))
                    }
                    None => negated,
                });
                return self.resolve_props_expression(
                    &conditional.alternate,
                    when_false,
                    declarations,
                    residual_arguments,
                    residual_properties,
                    gaps,
                );
            }
            Expression::ArrayExpression(array) => {
                for element in &array.elements {
                    match element {
                        ArrayExpressionElement::Elision(_) => continue,
                        ArrayExpressionElement::SpreadElement(spread) => {
                            return Err(Gap {
                                message: "Spread elements inside StyleX argument arrays are not statically lowerable."
                                    .to_string(),
                                span: source_span(spread.span),
                            });
                        }
                        element => self.resolve_props_expression(
                            element.as_expression().expect("non-spread array element is an expression"),
                            condition.clone(),
                            declarations,
                            residual_arguments,
                            residual_properties,
                            gaps,
                        )?,
                    }
                }
                return Ok(());
            }
            Expression::BooleanLiteral(literal) if !literal.value => return Ok(()),
            Expression::NullLiteral(_) => return Ok(()),
            other => {
                return Err(Gap {
                    message: "Hozo accepts StyleX rule references, falsy values, recursive arrays, logical guards, and ternary branches in `stylex.props`."
                        .to_string(),
                    span: source_span(other.span()),
                });
            }
        };

        let rule = self.rule_from_member(member)?;
        let (entries, residual, rule_gaps) = match rule {
            Rule::Ready {
                entries,
                residual,
                gaps,
            } => (entries, residual, gaps),
            Rule::Gap(gap) => {
                return Err(Gap {
                    message: gap.message.clone(),
                    span: source_span(member.span),
                });
            }
            Rule::Function { .. } => {
                return Err(Gap {
                    message: "A StyleX function-style rule must be called with one value."
                        .to_string(),
                    span: source_span(member.span),
                });
            }
        };
        let declaration_condition = condition
            .clone()
            .map_or(Condition::Always, Condition::Expr);
        self.append_entries(entries, declaration_condition, declarations)?;
        if !residual.is_empty() {
            let mut properties = Vec::new();
            for property in residual {
                if !properties.contains(&property.span) {
                    properties.push(property.span);
                }
            }
            residual_arguments.push(StylexResidualArgument {
                properties,
                condition,
            });
            residual_properties.extend(residual.iter().cloned());
            gaps.extend(rule_gaps.iter().cloned().map(|gap| Gap {
                span: source_span(member.span),
                ..gap
            }));
        }
        Ok(())
    }

    pub(crate) fn resolve_props(&self, expression: &Expression) -> Resolution {
        let Expression::CallExpression(call) = expression else {
            return Resolution::NotStylex;
        };
        let Some(namespace) = self.props_namespace(call) else {
            return Resolution::NotStylex;
        };
        let mut declarations = Vec::new();
        let mut residual_arguments = Vec::new();
        let mut residual_properties = Vec::new();
        let mut gaps = Vec::new();
        for argument in &call.arguments {
            let Some(argument) = argument.as_expression() else {
                return Resolution::Gap {
                    message: "Spread arguments in `stylex.props` are not statically lowerable."
                        .to_string(),
                    span: source_span(argument.span()),
                };
            };
            if let Err(gap) = self.resolve_props_expression(
                argument,
                None,
                &mut declarations,
                &mut residual_arguments,
                &mut residual_properties,
                &mut gaps,
            ) {
                return Resolution::Gap {
                    message: gap.message,
                    span: gap.span,
                };
            }
        }
        if residual_arguments.is_empty() {
            return Resolution::Ready(resolve_property_priority(declarations));
        }
        if declarations.is_empty() {
            let gap = gaps.into_iter().next().expect("a residual property has a gap");
            return Resolution::Gap {
                message: gap.message,
                span: source_span(call.span),
            };
        }
        if let Some((residual, declaration)) = residual_properties.iter().find_map(|residual| {
            declarations
                .iter()
                .find(|declaration| property_names_overlap(&residual.css_name, &declaration.css_name))
                .map(|declaration| (residual, declaration))
        }) {
            return Resolution::Gap {
                message: format!(
                    "StyleX residual `{}` overlaps lowered `{}`; the rule stays with StyleX so its cascade is not approximated.",
                    residual.css_name, declaration.css_name
                ),
                span: source_span(call.span),
            };
        }
        Resolution::Partial {
            declarations: resolve_property_priority(declarations),
            residual: StylexResidual {
                namespace: namespace.to_string(),
                arguments: residual_arguments,
            },
            gaps,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use oxc_allocator::Allocator;
    use oxc_parser::Parser;
    use oxc_span::SourceType;

    fn frontend(source: &str) -> Frontend {
        let allocator = Allocator::default();
        let parsed = Parser::new(
            &allocator,
            source,
            SourceType::from_extension("tsx").unwrap(),
        )
        .parse();
        Frontend::collect(&parsed.program, &parsed.module_record)
    }

    #[test]
    fn collects_static_universal_properties() {
        let frontend = frontend(
            r#"
            import * as stylex from '@stylexjs/stylex'
            const styles = stylex.create({
              root: { padding: 16, backgroundColor: '#f00', flexDirection: 'row' }
            })
        "#,
        );
        let Rule::Ready { entries, .. } = &frontend.sheets["styles"]["root"] else {
            panic!("rule was not lowerable")
        };
        assert_eq!(
            entries
                .iter()
                .map(|entry| entry.properties.len())
                .sum::<usize>(),
            6
        ); // four padding sides, colour, direction
    }

    #[test]
    fn local_unthemeable_define_vars_defaults_become_static_values() {
        let frontend = frontend(
            r#"
            import * as stylex from '@stylexjs/stylex'
            const tokens = stylex.defineVars({ accent: '#123456', space: 12 })
            const styles = stylex.create({
              root: { color: tokens.accent, padding: tokens.space }
            })
        "#,
        );
        let Rule::Ready {
            entries,
            residual,
            gaps,
        } = &frontend.sheets["styles"]["root"]
        else {
            panic!("static local variables should be lowerable")
        };
        assert!(residual.is_empty());
        assert!(gaps.is_empty());
        assert!(entries.iter().any(|entry| {
            entry
                .properties
                .contains(&StyleProperty::TextColor(Color::Css("#123456".into())))
        }));
        assert_eq!(
            entries
                .iter()
                .flat_map(|entry| &entry.properties)
                .filter(|property| matches!(property, StyleProperty::PaddingTop(Length::Px(12.0))))
                .count(),
            1
        );
    }

    #[test]
    fn themeable_define_vars_stay_with_official_stylex() {
        let themed = frontend(
            r#"
            import * as stylex from '@stylexjs/stylex'
            const tokens = stylex.defineVars({ accent: '#123456' })
            const dark = stylex.createTheme(tokens, { accent: '#abcdef' })
            const styles = stylex.create({ root: { color: tokens.accent } })
        "#,
        );
        let Rule::Ready {
            entries,
            residual,
            gaps,
        } = &themed.sheets["styles"]["root"]
        else {
            panic!("the themed value should remain a property residual")
        };
        assert!(entries.is_empty());
        assert_eq!(residual.len(), 1);
        assert_eq!(gaps.len(), 1);

        let exported = frontend(
            r#"
            import * as stylex from '@stylexjs/stylex'
            const tokens = stylex.defineVars({ accent: '#123456' })
            export { tokens }
            const styles = stylex.create({ root: { color: tokens.accent } })
        "#,
        );
        let Rule::Ready {
            entries,
            residual,
            gaps,
        } = &exported.sheets["styles"]["root"]
        else {
            panic!("an exported token should remain a property residual")
        };
        assert!(entries.is_empty());
        assert_eq!(residual.len(), 1);
        assert_eq!(gaps.len(), 1);
    }

    #[test]
    fn statically_called_function_styles_become_typed_ir() {
        let source = r#"
            import * as stylex from '@stylexjs/stylex'
            import { View } from '@hozo/core'
            const styles = stylex.create({
              dynamic: (value) => ({ opacity: value, backgroundColor: '#123456' })
            })
            export const Card = () => <View {...stylex.props(styles.dynamic(0.5))} />
        "#;
        let parsed = crate::parse_tsx(source);
        assert!(parsed.diagnostics.is_empty(), "{:?}", parsed.diagnostics);
        let style = &parsed.roots[0].node.style;
        assert!(style
            .iter()
            .any(|declaration| declaration.property == StyleProperty::Opacity(0.5)));
        assert!(style.iter().any(|declaration| {
            declaration.property
                == StyleProperty::BackgroundColor(Color::Css("#123456".into()))
        }));
        assert!(parsed.roots[0].node.props.stylex_residuals.is_empty());
    }

    #[test]
    fn runtime_function_style_arguments_remain_with_official_stylex() {
        let source = r#"
            import * as stylex from '@stylexjs/stylex'
            import { View } from '@hozo/core'
            const styles = stylex.create({ dynamic: (value) => ({ opacity: value }) })
            export const Card = ({ value }) => (
              <View {...stylex.props(styles.dynamic(value))} />
            )
        "#;
        let parsed = crate::parse_tsx(source);
        let node = &parsed.roots[0].node;
        assert!(node.style.is_empty());
        assert!(node.props.stylex_residuals.is_empty());
        assert_eq!(node.props.passthrough.len(), 1);
        assert_eq!(parsed.diagnostics.len(), 1);
        assert!(parsed.diagnostics[0].message.contains("runtime argument"));
    }

    #[test]
    fn static_function_styles_keep_stylex_argument_order() {
        let source = r#"
            import * as stylex from '@stylexjs/stylex'
            import { View } from '@hozo/core'
            const styles = stylex.create({
              base: { opacity: 0.75 },
              dynamic: (value) => ({ opacity: value })
            })
            export const A = () => (
              <View {...stylex.props(styles.dynamic(0.5), styles.base)} />
            )
            export const B = () => (
              <View {...stylex.props(styles.base, styles.dynamic(0.5))} />
            )
        "#;
        let parsed = crate::parse_tsx(source);
        assert!(parsed.diagnostics.is_empty(), "{:?}", parsed.diagnostics);
        assert!(parsed.roots[0]
            .node
            .style
            .iter()
            .any(|declaration| declaration.property == StyleProperty::Opacity(0.75)));
        assert!(parsed.roots[1]
            .node
            .style
            .iter()
            .any(|declaration| declaration.property == StyleProperty::Opacity(0.5)));
    }

    #[test]
    fn first_that_works_preserves_preference_order_in_typed_ir() {
        let frontend = frontend(
            r#"
            import * as sx from '@stylexjs/stylex'
            const styles = sx.create({
              root: { display: sx.firstThatWorks('grid', 'flex') }
            })
        "#,
        );
        let Rule::Ready { entries, residual, gaps } = &frontend.sheets["styles"]["root"] else {
            panic!("rule was not lowerable")
        };
        assert!(residual.is_empty());
        assert!(gaps.is_empty());
        assert_eq!(
            entries[0].properties,
            vec![StyleProperty::FirstThatWorks(vec![
                StyleProperty::Display(hozo_ir::Display::Grid),
                StyleProperty::Display(hozo_ir::Display::Flex),
            ])]
        );
    }

    #[test]
    fn dynamic_first_that_works_remains_with_official_stylex() {
        let frontend = frontend(
            r#"
            import * as stylex from '@stylexjs/stylex'
            const styles = stylex.create({
              root: { display: stylex.firstThatWorks(preferred, 'flex') }
            })
        "#,
        );
        let Rule::Ready { entries, residual, gaps } = &frontend.sheets["styles"]["root"] else {
            panic!("dynamic fallback should remain as a residual")
        };
        assert!(entries.is_empty());
        assert_eq!(residual.len(), 1);
        assert_eq!(gaps.len(), 1);
        assert!(gaps[0].message.contains("firstThatWorks"));
    }

    #[test]
    fn unsupported_properties_are_named_gaps() {
        let frontend = frontend(
            r#"
            import * as stylex from '@stylexjs/stylex'
            const styles = stylex.create({ root: { transform: 'translateX(calc(100% - 2px))' } })
        "#,
        );
        let Rule::Ready {
            entries,
            residual,
            gaps,
        } = &frontend.sheets["styles"]["root"]
        else {
            panic!("static unsupported property should remain as a residual")
        };
        assert!(entries.is_empty());
        assert_eq!(residual.len(), 1);
        assert_eq!(gaps.len(), 1);
    }

    #[test]
    fn ordered_static_transforms_and_origin_become_typed_ir() {
        let frontend = frontend(
            r#"
            import * as stylex from '@stylexjs/stylex'
            const styles = stylex.create({
              root: {
                transform: 'translateX(12px) rotate(10deg) scale(0.9)',
                transformOrigin: 'left top'
              }
            })
        "#,
        );
        let Rule::Ready { entries, .. } = &frontend.sheets["styles"]["root"] else {
            panic!("rule was not lowerable")
        };
        assert_eq!(
            entries[0].properties,
            vec![StyleProperty::Transform(vec![
                TransformFunction::TranslateX(Dimension::Length(Length::Px(12.0))),
                TransformFunction::Rotate(Angle::Deg(10.0)),
                TransformFunction::Scale(0.9),
            ])]
        );
        assert_eq!(
            entries[1].properties,
            vec![StyleProperty::TransformOrigin("left top".to_string())]
        );
    }

    #[test]
    fn standalone_transform_properties_preserve_components_in_typed_ir() {
        let frontend = frontend(
            r#"
            import * as stylex from '@stylexjs/stylex'
            const styles = stylex.create({
              root: {
                translate: '12px 25%',
                rotate: '10deg',
                scale: '0.9 110%'
              }
            })
        "#,
        );
        let Rule::Ready { entries, residual, gaps } = &frontend.sheets["styles"]["root"] else {
            panic!("rule was not lowerable")
        };
        assert!(residual.is_empty());
        assert!(gaps.is_empty());
        assert_eq!(
            entries[0].properties,
            vec![StyleProperty::Translate(vec![
                Dimension::Length(Length::Px(12.0)),
                Dimension::Percent(25.0),
            ])]
        );
        assert_eq!(entries[1].properties, vec![StyleProperty::Rotate(Angle::Deg(10.0))]);
        assert_eq!(
            entries[2].properties,
            vec![StyleProperty::Scale(vec![
                Scale::Ratio(0.9),
                Scale::Percent(110.0),
            ])]
        );
    }

    #[test]
    fn wider_standalone_transform_values_remain_official_residuals() {
        let frontend = frontend(
            r#"
            import * as stylex from '@stylexjs/stylex'
            const styles = stylex.create({
              root: {
                translate: 'calc(100% - 2px)',
                rotate: '0.25turn',
                scale: 'none'
              }
            })
        "#,
        );
        let Rule::Ready { entries, residual, gaps } = &frontend.sheets["styles"]["root"] else {
            panic!("rule should retain unsupported values as residuals")
        };
        assert!(entries.is_empty());
        assert_eq!(residual.len(), 3);
        assert_eq!(gaps.len(), 3);
    }

    #[test]
    fn static_grid_values_become_the_existing_contextual_ir() {
        let frontend = frontend(
            r#"
            import * as stylex from '@stylexjs/stylex'
            const styles = stylex.create({
              grid: {
                gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
                gridTemplateRows: '80px minmax(120px, 2fr) 1fr'
              },
              span: { gridColumn: 'span 2 / span 2', gridRow: '1 / -1' },
              lines: {
                gridColumnStart: 2,
                gridColumnEnd: -1,
                gridRowStart: '2',
                gridRowEnd: 'auto'
              },
              area: { gridArea: '1 / 2 / 3 / -1' },
              template: { gridTemplate: '80px 1fr / 120px 2fr' },
              shorthand: { grid: '80px 1fr / 120px 2fr' }
            })
        "#,
        );
        let Rule::Ready { entries: grid, .. } = &frontend.sheets["styles"]["grid"] else {
            panic!("grid rule was not lowerable")
        };
        assert_eq!(
            grid[0].properties,
            vec![StyleProperty::GridTemplateColumns(GridTracks::Css(
                "repeat(3,minmax(0,1fr))".to_string()
            ))]
        );
        assert_eq!(
            grid[1].properties,
            vec![StyleProperty::GridTemplateRows(GridTracks::Css(
                "80px minmax(120px,2fr) 1fr".to_string()
            ))]
        );
        let Rule::Ready { entries: span, .. } = &frontend.sheets["styles"]["span"] else {
            panic!("span rule was not lowerable")
        };
        assert_eq!(
            span[0].properties,
            vec![StyleProperty::GridColumn(GridSpan::Span(2))]
        );
        assert_eq!(
            span[1].properties,
            vec![StyleProperty::GridRow(GridSpan::Full)]
        );
        let Rule::Ready { entries: lines, .. } = &frontend.sheets["styles"]["lines"] else {
            panic!("line rule was not lowerable")
        };
        assert_eq!(
            lines[0].properties,
            vec![StyleProperty::GridColumnStart(GridLine::Line(2))]
        );
        assert_eq!(
            lines[1].properties,
            vec![StyleProperty::GridColumnEnd(GridLine::Line(-1))]
        );
        assert_eq!(
            lines[2].properties,
            vec![StyleProperty::GridRowStart(GridLine::Line(2))]
        );
        assert_eq!(
            lines[3].properties,
            vec![StyleProperty::GridRowEnd(GridLine::Auto)]
        );
        let Rule::Ready { entries: area, .. } = &frontend.sheets["styles"]["area"] else {
            panic!("grid area was not lowerable")
        };
        assert_eq!(
            area[0].properties,
            vec![
                StyleProperty::GridRowStart(GridLine::Line(1)),
                StyleProperty::GridColumnStart(GridLine::Line(2)),
                StyleProperty::GridRowEnd(GridLine::Line(3)),
                StyleProperty::GridColumnEnd(GridLine::Line(-1)),
            ]
        );
        let Rule::Ready { entries: template, .. } = &frontend.sheets["styles"]["template"] else {
            panic!("grid template was not lowerable")
        };
        assert_eq!(
            template[0].properties,
            vec![
                StyleProperty::GridTemplateRows(GridTracks::Css("80px 1fr".to_string())),
                StyleProperty::GridTemplateColumns(GridTracks::Css("120px 2fr".to_string())),
            ]
        );
        let Rule::Ready { entries: shorthand, .. } = &frontend.sheets["styles"]["shorthand"]
        else {
            panic!("grid shorthand was not lowerable")
        };
        assert_eq!(
            shorthand[0].properties,
            vec![
                StyleProperty::GridTemplateRows(GridTracks::Css("80px 1fr".to_string())),
                StyleProperty::GridTemplateColumns(GridTracks::Css("120px 2fr".to_string())),
                StyleProperty::WebOnly("grid-template-areas".to_string(), "none".to_string()),
                StyleProperty::WebOnly("grid-auto-rows".to_string(), "auto".to_string()),
                StyleProperty::WebOnly("grid-auto-columns".to_string(), "auto".to_string()),
                StyleProperty::WebOnly("grid-auto-flow".to_string(), "row".to_string()),
            ]
        );
    }

    #[test]
    fn static_transition_configuration_becomes_the_existing_contextual_ir() {
        let frontend = frontend(
            r#"
            import * as stylex from '@stylexjs/stylex'
            const styles = stylex.create({
              motion: {
                transitionProperty: 'opacity, transform',
                transitionDuration: '.2s',
                transitionTimingFunction: 'ease-in-out'
              }
            })
        "#,
        );
        let Rule::Ready {
            entries,
            residual,
            gaps,
        } = &frontend.sheets["styles"]["motion"]
        else {
            panic!("rule was not lowerable")
        };
        assert!(residual.is_empty());
        assert!(gaps.is_empty());
        assert_eq!(
            entries
                .iter()
                .flat_map(|entry| entry.properties.clone())
                .collect::<Vec<_>>(),
            vec![
                StyleProperty::TransitionProperty("opacity,transform".to_string()),
                StyleProperty::TransitionDuration(200, Origin::Written),
                StyleProperty::TransitionTimingFunction(
                    "ease-in-out".to_string(),
                    Origin::Written
                ),
            ]
        );
    }

    #[test]
    fn practical_text_values_become_typed_ir() {
        let frontend = frontend(
            r#"
            import * as stylex from '@stylexjs/stylex'
            const styles = stylex.create({
              text: { fontWeight: 700, whiteSpace: 'nowrap', textOverflow: 'ellipsis' },
              input: { caretColor: '#123456' }
            })
        "#,
        );
        let Rule::Ready { entries: text, .. } = &frontend.sheets["styles"]["text"] else {
            panic!("text values were not lowerable")
        };
        assert_eq!(
            text.iter().flat_map(|entry| entry.properties.clone()).collect::<Vec<_>>(),
            vec![
                StyleProperty::FontWeight(FontWeight(700)),
                StyleProperty::WhiteSpace(WhiteSpace::NoWrap),
                StyleProperty::TextOverflow(TextOverflow::Ellipsis),
            ]
        );
        let Rule::Ready { entries: input, .. } = &frontend.sheets["styles"]["input"] else {
            panic!("input values were not lowerable")
        };
        assert_eq!(
            input[0].properties,
            vec![StyleProperty::CaretColor(Color::Css("#123456".to_string()))]
        );
    }

    #[test]
    fn practical_web_only_values_are_exact_and_wider_values_remain_residual() {
        let frontend = frontend(
            r#"
            import * as stylex from '@stylexjs/stylex'
            const styles = stylex.create({
              exact: {
                wordBreak: 'break-word', overflowWrap: 'anywhere', visibility: 'hidden',
                backgroundPosition: 'center', backgroundRepeat: 'no-repeat', backgroundSize: 'cover',
                objectPosition: 'center', justifySelf: 'center', placeItems: 'center',
                transitionDelay: '100ms', animationDuration: '.2s',
                content: '"New" open-quote', caret: '#123456 bar'
              },
              wider: {
                backgroundSize: 'calc(100% - 1px)', transitionDelay: 'calc(1s - 2ms)',
                content: 'attr(data-label)', caret: 'red blue'
              }
            })
        "#,
        );
        let Rule::Ready { entries, residual, gaps } = &frontend.sheets["styles"]["exact"] else {
            panic!("exact Web values were not lowerable")
        };
        assert_eq!(entries.len(), 13);
        assert!(entries.iter().flat_map(|entry| &entry.properties).any(|property| {
            property == &StyleProperty::CaretColor(Color::Css("#123456".to_string()))
        }));
        assert!(entries.iter().flat_map(|entry| &entry.properties).any(|property| {
            property == &StyleProperty::WebOnly("caret-shape".to_string(), "bar".to_string())
        }));
        assert!(residual.is_empty());
        assert!(gaps.is_empty());

        let Rule::Ready { entries, residual, gaps } = &frontend.sheets["styles"]["wider"] else {
            panic!("wider values should remain residual")
        };
        assert!(entries.is_empty());
        assert_eq!(residual.len(), 4);
        assert_eq!(gaps.len(), 4);
    }

    #[test]
    fn animation_controls_lower_exact_common_values_and_preserve_wider_syntax() {
        let frontend = frontend(
            r#"
            import * as stylex from '@stylexjs/stylex'
            const styles = stylex.create({
              exact: {
                animationComposition: 'add', animationDelay: '-100ms',
                animationDirection: 'alternate-reverse', animationFillMode: 'both',
                animationIterationCount: 2.5, animationPlayState: 'paused',
                animationTimingFunction: 'cubic-bezier(0.4, 0, 0.2, 1)'
              },
              wider: {
                animationDelay: 'calc(1s - 2ms)', animationIterationCount: -1,
                animationTimingFunction: 'linear(0, 1)'
              }
            })
        "#,
        );
        let Rule::Ready { entries, residual, gaps } = &frontend.sheets["styles"]["exact"] else {
            panic!("exact animation controls were not lowerable")
        };
        assert_eq!(entries.len(), 7);
        assert!(residual.is_empty());
        assert!(gaps.is_empty());

        let Rule::Ready { entries, residual, gaps } = &frontend.sheets["styles"]["wider"] else {
            panic!("wider animation controls should remain residual")
        };
        assert!(entries.is_empty());
        assert_eq!(residual.len(), 3);
        assert_eq!(gaps.len(), 3);
    }

    #[test]
    fn compositing_effects_lower_safe_common_css_and_preserve_wider_syntax() {
        let frontend = frontend(
            r#"
            import * as stylex from '@stylexjs/stylex'
            const styles = stylex.create({
              exact: {
                clipPath: 'polygon(0 0, 100% 0, 50% 100%)',
                perspective: '800px', perspectiveOrigin: '25% 75%',
                transformBox: 'fill-box', transformStyle: 'preserve-3d',
                willChange: 'opacity, transform'
              },
              wider: {
                clipPath: 'shape(from 0 0, line to 100% 100%)',
                perspective: 'calc(100px + 2rem)', perspectiveOrigin: 'calc(50% + 1px) center',
                transformBox: 'padding-box', transformStyle: 'preserve-4d',
                willChange: 'var(--property)'
              }
            })
        "#,
        );
        let Rule::Ready { entries, residual, gaps } = &frontend.sheets["styles"]["exact"] else {
            panic!("common compositing values were not lowerable")
        };
        assert_eq!(entries.len(), 6);
        assert!(residual.is_empty());
        assert!(gaps.is_empty());

        let Rule::Ready { entries, residual, gaps } = &frontend.sheets["styles"]["wider"] else {
            panic!("wider compositing values should remain residual")
        };
        assert!(entries.is_empty());
        assert_eq!(residual.len(), 6);
        assert_eq!(gaps.len(), 6);
    }

    #[test]
    fn mask_longhands_lower_common_layers_and_preserve_wider_image_syntax() {
        assert_eq!(
            minify_css_commas("linear-gradient(\"literal, text\", black, white)"),
            "linear-gradient(\"literal, text\",black,white)"
        );
        let frontend = frontend(
            r#"
            import * as stylex from '@stylexjs/stylex'
            const styles = stylex.create({
              exact: {
                WebkitMaskImage: 'url(mask.svg)',
                maskImage: 'linear-gradient(black, transparent)',
                maskMode: 'luminance', maskRepeat: 'no-repeat',
                maskPosition: 'center top', maskSize: 'cover',
                maskOrigin: 'border-box', maskClip: 'no-clip',
                maskComposite: 'exclude', maskType: 'alpha'
              },
              wider: {
                WebkitMaskImage: 'image-set(url(a.png) 1x, url(b.png) 2x)',
                maskImage: 'cross-fade(url(a.png), url(b.png), 50%)',
                maskMode: 'match-source, var(--mask-mode)',
                maskRepeat: 'repeat var(--repeat)',
                maskPosition: 'calc(50% + 1px) top', maskSize: 'calc(100% - 1px)',
                maskOrigin: 'var(--origin)', maskClip: 'text',
                maskComposite: 'source-over', maskType: 'var(--mask-type)'
              }
            })
        "#,
        );
        let Rule::Ready { entries, residual, gaps } = &frontend.sheets["styles"]["exact"] else {
            panic!("common mask longhands were not lowerable")
        };
        assert_eq!(entries.len(), 10);
        assert!(entries.iter().all(|entry| entry.properties.iter().all(|property| {
            matches!(property, StyleProperty::WebOnly(_, _))
        })));
        assert!(residual.is_empty());
        assert!(gaps.is_empty());

        let Rule::Ready { entries, residual, gaps } = &frontend.sheets["styles"]["wider"] else {
            panic!("wider mask syntax should remain residual")
        };
        assert!(entries.is_empty());
        assert_eq!(residual.len(), 10);
        assert_eq!(gaps.len(), 10);
    }

    #[test]
    fn motion_paths_and_float_shapes_lower_common_values_and_preserve_wider_syntax() {
        let frontend = frontend(
            r#"
            import * as stylex from '@stylexjs/stylex'
            const styles = stylex.create({
              exact: {
                float: 'left', clear: 'both',
                offsetAnchor: 'left top', offsetDistance: '25%',
                offsetPath: 'path("M 0 0 L 100 100")',
                offsetPosition: 'center top', offsetRotate: 'auto 45deg',
                shapeImageThreshold: 0.5, shapeMargin: '1rem',
                shapeOutside: 'circle(50%)'
              },
              wider: {
                float: 'inline-start', clear: 'inline-end',
                offsetAnchor: 'calc(50% + 1px) top', offsetDistance: 'calc(25% + 1px)',
                offsetPath: 'shape(from 0 0, line to 100% 100%)',
                offsetPosition: 'calc(50% + 1px) top', offsetRotate: '0.25turn',
                shapeImageThreshold: 1.5, shapeMargin: '-1rem',
                shapeOutside: 'linear-gradient(black, transparent)'
              }
            })
        "#,
        );
        let Rule::Ready { entries, residual, gaps } = &frontend.sheets["styles"]["exact"] else {
            panic!("common motion-path and float-shape values were not lowerable")
        };
        assert_eq!(entries.len(), 10);
        assert!(entries.iter().all(|entry| entry.properties.iter().all(|property| {
            matches!(property, StyleProperty::WebOnly(_, _))
        })));
        assert!(residual.is_empty());
        assert!(gaps.is_empty());

        let Rule::Ready { entries, residual, gaps } = &frontend.sheets["styles"]["wider"] else {
            panic!("wider motion-path and float-shape syntax should remain residual")
        };
        assert!(entries.is_empty());
        assert_eq!(residual.len(), 10);
        assert_eq!(gaps.len(), 10);
    }

    #[test]
    fn border_image_longhands_lower_common_values_and_preserve_wider_syntax() {
        let frontend = frontend(
            r#"
            import * as stylex from '@stylexjs/stylex'
            const styles = stylex.create({
              exact: {
                borderImageSource: 'linear-gradient(red, blue)',
                borderImageSlice: '30% fill', borderImageWidth: '1 2 3 4',
                borderImageOutset: '4px 8px', borderImageRepeat: 'round stretch'
              },
              wider: {
                borderImageSource: 'image-set(url(a.png) 1x, url(b.png) 2x)',
                borderImageSlice: 'calc(30% + 5%) fill',
                borderImageWidth: 'calc(1rem + 2px)',
                borderImageOutset: 'calc(1rem + 2px)',
                borderImageRepeat: 'var(--border-repeat)'
              }
            })
        "#,
        );
        let Rule::Ready { entries, residual, gaps } = &frontend.sheets["styles"]["exact"] else {
            panic!("common border-image longhands were not lowerable")
        };
        assert_eq!(entries.len(), 5);
        assert!(entries.iter().all(|entry| entry.properties.iter().all(|property| {
            matches!(property, StyleProperty::WebOnly(_, _))
        })));
        assert!(residual.is_empty());
        assert!(gaps.is_empty());

        let Rule::Ready { entries, residual, gaps } = &frontend.sheets["styles"]["wider"] else {
            panic!("wider border-image syntax should remain residual")
        };
        assert!(entries.is_empty());
        assert_eq!(residual.len(), 5);
        assert_eq!(gaps.len(), 5);
    }

    #[test]
    fn grid_auto_tracks_flow_and_areas_lower_exactly_on_web() {
        let frontend = frontend(
            r#"
            import * as stylex from '@stylexjs/stylex'
            const styles = stylex.create({
              exact: {
                gridAutoColumns: 'minmax(100px, 1fr) max-content',
                gridAutoRows: '48px auto', gridAutoFlow: 'column dense',
                gridTemplateAreas: '"header header" "main aside"'
              },
              wider: {
                gridAutoColumns: 'calc(100% - 1rem)',
                gridAutoRows: 'repeat(2, 1fr)',
                gridAutoFlow: 'var(--flow)',
                gridTemplateAreas: '"a a" "a b"'
              }
            })
        "#,
        );
        let Rule::Ready { entries, residual, gaps } = &frontend.sheets["styles"]["exact"] else {
            panic!("common implicit-grid declarations were not lowerable")
        };
        assert_eq!(entries.len(), 4);
        assert!(entries.iter().all(|entry| entry.properties.iter().all(|property| {
            matches!(property, StyleProperty::WebOnly(_, _))
        })));
        assert!(residual.is_empty());
        assert!(gaps.is_empty());

        let Rule::Ready { entries, residual, gaps } = &frontend.sheets["styles"]["wider"] else {
            panic!("wider implicit-grid syntax should remain residual")
        };
        assert!(entries.is_empty());
        assert_eq!(residual.len(), 4);
        assert_eq!(gaps.len(), 4);
    }

    #[test]
    fn browser_typography_keywords_are_exact_and_composed_values_remain_residual() {
        let frontend = frontend(
            r#"
            import * as stylex from '@stylexjs/stylex'
            const styles = stylex.create({
              exact: {
                fontKerning: 'normal', fontOpticalSizing: 'auto', fontStretch: 'condensed',
                fontFeatureSettings: '\"kern\" 1', fontLanguageOverride: '\"TRK\"',
                fontPalette: 'dark', fontSizeAdjust: 0.5, fontSynthesis: 'weight style',
                fontSynthesisPosition: 'none', fontSynthesisSmallCaps: 'none',
                fontSynthesisStyle: 'none', fontSynthesisWeight: 'none',
                fontVariantAlternates: 'historical-forms', fontVariantCaps: 'small-caps',
                fontVariantEastAsian: 'jis78 full-width', fontVariantLigatures: 'none',
                fontVariantNumeric: 'tabular-nums', fontVariantPosition: 'super',
                fontVariationSettings: '\"wght\" 650',
                hyphens: 'auto', lineBreak: 'strict', textAlignLast: 'center',
                textDecorationSkipInk: 'all', textDecorationThickness: '2px',
                textJustify: 'inter-word',
                textOrientation: 'upright', textWrap: 'balance'
              },
              wider: {
                fontStretch: '75%',
                fontVariantLigatures: 'common-ligatures no-discretionary-ligatures',
                fontFeatureSettings: '\"bad\" 1', fontLanguageOverride: 'TRK',
                fontPalette: 'var(--palette)', fontSizeAdjust: -0.5,
                fontSynthesis: 'weight weight',
                fontVariantAlternates: 'styleset()',
                fontVariantEastAsian: 'jis78 jis90',
                fontVariationSettings: '\"wght\" bold',
                textDecorationThickness: '-2px'
              }
            })
        "#,
        );
        let Rule::Ready { entries, residual, gaps } = &frontend.sheets["styles"]["exact"] else {
            panic!("exact browser typography values were not lowerable")
        };
        assert_eq!(entries.len(), 27);
        assert!(entries.iter().all(|entry| entry.properties.iter().all(|property| {
            matches!(property, StyleProperty::WebOnly(_, _))
        })));
        assert!(residual.is_empty());
        assert!(gaps.is_empty());

        let Rule::Ready { entries, residual, gaps } = &frontend.sheets["styles"]["wider"] else {
            panic!("composed browser typography values should remain residual")
        };
        assert!(entries.is_empty());
        assert_eq!(residual.len(), 11);
        assert_eq!(gaps.len(), 11);
    }

    #[test]
    fn browser_text_controls_validate_exact_css_grammars() {
        let frontend = frontend(
            r#"
            import * as stylex from '@stylexjs/stylex'
            const styles = stylex.create({
              exact: {
                WebkitLineClamp: 3, WebkitTextStrokeWidth: 2,
                hangingPunctuation: 'first allow-end', hyphenateCharacter: '"-"',
                tabSize: 4, textCombineUpright: 'digits 2',
                textEmphasisColor: '#123456', textEmphasisPosition: 'over right',
                textEmphasisStyle: 'filled sesame', textFillColor: '#abcdef',
                textSizeAdjust: '100%', textUnderlineOffset: 2,
                textUnderlinePosition: 'under left', wordSpacing: 4,
                wordWrap: 'break-word'
              },
              wider: {
                WebkitLineClamp: 0, WebkitTextStrokeWidth: -1,
                hangingPunctuation: 'first force-end allow-end', hyphenateCharacter: '-',
                tabSize: -1, textCombineUpright: 'digits 5',
                textEmphasisColor: 'var(--accent)', textEmphasisPosition: 'over under',
                textEmphasisStyle: 'filled open', textFillColor: 'var(--ink)',
                textSizeAdjust: '-10%', textUnderlineOffset: '20%',
                textUnderlinePosition: 'under over', wordSpacing: 'calc(1px + 1em)',
                wordWrap: 'anywhere'
              }
            })
        "#,
        );
        let Rule::Ready { entries, residual, gaps } = &frontend.sheets["styles"]["exact"] else {
            panic!("exact browser text controls were not lowerable")
        };
        assert_eq!(entries.len(), 15);
        assert!(entries.iter().all(|entry| entry.properties.iter().all(|property| {
            matches!(property, StyleProperty::WebOnly(_, _))
        })));
        assert!(residual.is_empty());
        assert!(gaps.is_empty());

        let Rule::Ready { entries, residual, gaps } = &frontend.sheets["styles"]["wider"] else {
            panic!("invalid browser text controls should remain residual")
        };
        assert!(entries.is_empty());
        assert_eq!(residual.len(), 15);
        assert_eq!(gaps.len(), 15);
    }

    #[test]
    fn logical_background_and_form_web_values_keep_exact_boundaries() {
        let frontend = frontend(
            r#"
            import * as stylex from '@stylexjs/stylex'
            const styles = stylex.create({
              exact: {
                blockSize: 320, inlineSize: '50%', minBlockSize: 'auto',
                minInlineSize: '12rem', maxBlockSize: 'none', maxInlineSize: 'fit-content',
                justifyItems: 'center', placeSelf: 'center center',
                backgroundAttachment: 'fixed', backgroundBlendMode: 'multiply',
                backgroundClip: 'text', WebkitBackgroundClip: 'text',
                backgroundOrigin: 'padding-box', backgroundPositionX: 'left',
                backgroundPositionY: 'bottom', accentColor: '#123456', caretShape: 'bar',
                WebkitTextFillColor: 'currentColor', WebkitTextStrokeColor: '#abcdef',
                WebkitTapHighlightColor: 'transparent', MozOsxFontSmoothing: 'grayscale',
                WebkitFontSmoothing: 'antialiased', writingMode: 'vertical-rl'
              },
              wider: {
                blockSize: 'calc(100% - 1rem)', accentColor: 'var(--accent)',
                backgroundBlendMode: 'multiply,screen'
              }
            })
        "#,
        );
        let Rule::Ready { entries, residual, gaps } = &frontend.sheets["styles"]["exact"] else {
            panic!("exact logical and background values were not lowerable")
        };
        assert_eq!(entries.len(), 23);
        assert!(entries.iter().all(|entry| entry.properties.iter().all(|property| {
            matches!(property, StyleProperty::WebOnly(_, _))
        })));
        let css_names = entries
            .iter()
            .flat_map(|entry| entry.properties.iter())
            .filter_map(|property| match property {
                StyleProperty::WebOnly(name, _) => Some(name.as_str()),
                _ => None,
            })
            .collect::<HashSet<_>>();
        for name in ["height", "width", "min-height", "min-width", "max-height", "max-width"] {
            assert!(css_names.contains(name), "StyleX logical size should emit {name}");
        }
        assert!(residual.is_empty());
        assert!(gaps.is_empty());

        let Rule::Ready { entries, residual, gaps } = &frontend.sheets["styles"]["wider"] else {
            panic!("dynamic and composed Web values should remain residual")
        };
        assert!(entries.is_empty());
        assert_eq!(residual.len(), 3);
        assert_eq!(gaps.len(), 3);
    }

    #[test]
    fn list_table_columns_and_containment_keep_exact_boundaries() {
        let frontend = frontend(
            r#"
            import * as stylex from '@stylexjs/stylex'
            const styles = stylex.create({
              exact: {
                borderCollapse: 'collapse', borderSpacing: '8px 12px',
                captionSide: 'block-start', clip: 'rect(0 10px 10px 0)',
                columnCount: 3, columnFill: 'balance', columnRuleColor: '#123456',
                columnRuleStyle: 'dashed', columnRuleWidth: '2px', columnSpan: 'all',
                columnWidth: '16rem', contain: 'layout paint', contentVisibility: 'auto',
                containIntrinsicBlockSize: 'auto 320px', containIntrinsicHeight: '20rem',
                containIntrinsicInlineSize: 480, containIntrinsicSize: '320px 180px',
                containIntrinsicWidth: 'none',
                displayInside: 'grid', displayList: 'list-item',
                displayOutside: 'inline-level', emptyCells: 'hide',
                listStyleImage: 'url(#marker)', listStylePosition: 'inside',
                listStyleType: 'decimal-leading-zero', tableLayout: 'fixed'
              },
              wider: {
                borderSpacing: '8px 12px 16px', clip: 'circle(50%)', columnCount: 0,
                columnRuleWidth: '-1px', columnWidth: 'calc(50% - 1rem)',
                contain: 'size inline-size', containIntrinsicBlockSize: 'auto',
                containIntrinsicSize: '320px 180px 90px',
                listStyleImage: 'linear-gradient(red, blue)',
                listStyleType: 'symbols(cyclic "A")'
              }
            })
        "#,
        );
        let Rule::Ready { entries, residual, gaps } = &frontend.sheets["styles"]["exact"] else {
            panic!("exact list and table values were not lowerable")
        };
        assert_eq!(entries.len(), 26);
        assert!(entries.iter().all(|entry| entry.properties.iter().all(|property| {
            matches!(property, StyleProperty::WebOnly(_, _))
        })));
        assert!(residual.is_empty());
        assert!(gaps.is_empty());

        let Rule::Ready { entries, residual, gaps } = &frontend.sheets["styles"]["wider"] else {
            panic!("wider list and table values should remain residual")
        };
        assert!(entries.is_empty());
        assert_eq!(residual.len(), 10);
        assert_eq!(gaps.len(), 10);
    }

    #[test]
    fn list_and_column_shorthands_expand_to_atomic_web_slots() {
        let frontend = frontend(
            r#"
            import * as stylex from '@stylexjs/stylex'
            const styles = stylex.create({
              exact: {
                columns: '16rem 3',
                columnRule: '2px dashed rgb(0 0 0)',
                listStyle: 'url(#marker) outside square'
              },
              wider: {
                columns: '3 4',
                columnRule: 'solid dashed red',
                listStyle: 'inside outside disc'
              }
            })
        "#,
        );
        let Rule::Ready { entries, residual, gaps } = &frontend.sheets["styles"]["exact"] else {
            panic!("exact shorthand values were not lowerable")
        };
        assert_eq!(entries.len(), 3);
        assert_eq!(entries.iter().map(|entry| entry.properties.len()).sum::<usize>(), 8);
        assert!(entries.iter().all(|entry| entry.properties.iter().all(|property| {
            matches!(property, StyleProperty::WebOnly(_, _))
        })));
        assert!(residual.is_empty());
        assert!(gaps.is_empty());

        let Rule::Ready { entries, residual, gaps } = &frontend.sheets["styles"]["wider"] else {
            panic!("ambiguous shorthand values should remain residual")
        };
        assert!(entries.is_empty());
        assert_eq!(residual.len(), 3);
        assert_eq!(gaps.len(), 3);
    }

    #[test]
    fn a_column_longhand_suppresses_only_its_conditional_shorthand_slot() {
        let parsed = crate::parse_tsx(
            r#"
            import * as stylex from '@stylexjs/stylex'
            import { View } from '@hozo/core'
            const styles = stylex.create({
              all: { columns: '16rem 3' },
              count: { columnCount: 5 }
            })
            const card = <View {...stylex.props(styles.count, active && styles.all)} />
        "#,
        );
        assert!(parsed.diagnostics.is_empty(), "{:?}", parsed.diagnostics);
        let style = &parsed.roots[0].node.style;
        assert_eq!(style.len(), 2);
        assert!(style.iter().any(|declaration| {
            declaration.condition == Condition::Always
                && declaration.property
                    == web_longhand("column-count", "5")
        }));
        assert!(style.iter().any(|declaration| {
            matches!(declaration.condition, Condition::Expr(_))
                && declaration.property
                    == web_longhand("column-width", "16rem")
        }));
        assert!(!style.iter().any(|declaration| {
            matches!(declaration.condition, Condition::Expr(_))
                && declaration.property
                    == web_longhand("column-count", "3")
        }));
    }

    #[test]
    fn scroll_box_shorthands_expand_one_to_four_physical_values() {
        let frontend = frontend(
            r#"
            import * as stylex from '@stylexjs/stylex'
            const styles = stylex.create({
              exact: {
                scrollMargin: '8px 12px 16px 20px',
                scrollPadding: 4
              },
              wider: {
                scrollMargin: '8px 12px 16px 20px 24px',
                scrollPadding: 'calc(1rem + 2px)'
              },
              invalidPadding: { scrollPadding: '-1px 8px' }
            })
        "#,
        );
        let Rule::Ready { entries, residual, gaps } = &frontend.sheets["styles"]["exact"] else {
            panic!("exact scroll shorthands were not lowerable")
        };
        assert_eq!(entries.len(), 2);
        assert_eq!(entries.iter().map(|entry| entry.properties.len()).sum::<usize>(), 8);
        assert!(residual.is_empty());
        assert!(gaps.is_empty());

        let Rule::Ready { entries, residual, gaps } = &frontend.sheets["styles"]["wider"] else {
            panic!("wider scroll shorthands should remain residual")
        };
        assert!(entries.is_empty());
        assert_eq!(residual.len(), 2);
        assert_eq!(gaps.len(), 2);

        let Rule::Ready { entries, residual, gaps } =
            &frontend.sheets["styles"]["invalidPadding"]
        else {
            panic!("partly invalid scroll padding should remain residual")
        };
        assert!(entries.is_empty());
        assert_eq!(residual.len(), 1);
        assert_eq!(gaps.len(), 1);
    }

    #[test]
    fn logical_scroll_shorthands_expand_one_or_two_axis_values() {
        let frontend = frontend(
            r#"
            import * as stylex from '@stylexjs/stylex'
            const styles = stylex.create({
              exact: {
                scrollMarginBlock: '8px 12px',
                scrollMarginInline: -4,
                scrollPaddingBlock: 6,
                scrollPaddingInline: '10px 14px'
              },
              wider: { scrollMarginInline: '4px 8px 12px' },
              invalidPadding: { scrollPaddingBlock: '-1px 8px' }
            })
        "#,
        );
        let Rule::Ready { entries, residual, gaps } = &frontend.sheets["styles"]["exact"] else {
            panic!("exact logical scroll shorthands were not lowerable")
        };
        assert_eq!(entries.len(), 4);
        assert_eq!(entries.iter().map(|entry| entry.properties.len()).sum::<usize>(), 8);
        assert!(entries.iter().flat_map(|entry| &entry.properties).any(|property| {
            *property == StyleProperty::ScrollMargin(Edge::BlockStart, Length::Px(8.0))
        }));
        assert!(entries.iter().flat_map(|entry| &entry.properties).any(|property| {
            *property == StyleProperty::ScrollPadding(Edge::InlineEnd, Length::Px(14.0))
        }));
        assert!(residual.is_empty());
        assert!(gaps.is_empty());

        for name in ["wider", "invalidPadding"] {
            let Rule::Ready { entries, residual, gaps } = &frontend.sheets["styles"][name] else {
                panic!("invalid logical scroll shorthand should remain residual")
            };
            assert!(entries.is_empty());
            assert_eq!(residual.len(), 1);
            assert_eq!(gaps.len(), 1);
        }
    }

    #[test]
    fn a_logical_scroll_longhand_suppresses_only_its_shorthand_edge() {
        let parsed = crate::parse_tsx(
            r#"
            import * as stylex from '@stylexjs/stylex'
            import { View } from '@hozo/core'
            const styles = stylex.create({
              all: { scrollMarginInline: '8px 12px' },
              start: { scrollMarginInlineStart: 4 }
            })
            const card = <View {...stylex.props(styles.start, active && styles.all)} />
        "#,
        );
        assert!(parsed.diagnostics.is_empty(), "{:?}", parsed.diagnostics);
        let style = &parsed.roots[0].node.style;
        assert_eq!(style.len(), 2);
        assert!(style.iter().any(|declaration| {
            declaration.condition == Condition::Always
                && declaration.property
                    == StyleProperty::ScrollMargin(Edge::InlineStart, Length::Px(4.0))
        }));
        assert!(style.iter().any(|declaration| {
            matches!(declaration.condition, Condition::Expr(_))
                && declaration.property
                    == StyleProperty::ScrollMargin(Edge::InlineEnd, Length::Px(12.0))
        }));
    }

    #[test]
    fn a_scroll_longhand_suppresses_only_its_conditional_shorthand_edge() {
        let parsed = crate::parse_tsx(
            r#"
            import * as stylex from '@stylexjs/stylex'
            import { View } from '@hozo/core'
            const styles = stylex.create({
              all: { scrollMargin: '8px 12px' },
              top: { scrollMarginTop: 4 }
            })
            const card = <View {...stylex.props(styles.top, active && styles.all)} />
        "#,
        );
        assert!(parsed.diagnostics.is_empty(), "{:?}", parsed.diagnostics);
        let style = &parsed.roots[0].node.style;
        assert_eq!(style.len(), 4);
        assert!(style.iter().any(|declaration| {
            declaration.condition == Condition::Always
                && declaration.property == StyleProperty::ScrollMargin(Edge::Top, Length::Px(4.0))
        }));
        assert_eq!(
            style
                .iter()
                .filter(|declaration| matches!(declaration.condition, Condition::Expr(_)))
                .count(),
            3
        );
    }

    #[test]
    fn scroll_physical_and_logical_conflicts_remain_direction_aware() {
        let parsed = crate::parse_tsx(
            r#"
            import * as stylex from '@stylexjs/stylex'
            import { View } from '@hozo/core'
            const styles = stylex.create({
              all: { scrollPadding: 8 },
              start: { scrollPaddingInlineStart: 4 }
            })
            const card = <View {...stylex.props(styles.start, styles.all)} />
        "#,
        );
        assert!(parsed.roots[0].node.style.is_empty());
        assert_eq!(
            parsed.diagnostics[0].code,
            hozo_ir::DiagnosticCode::StylexNotLowered
        );
        assert!(parsed.diagnostics[0].message.contains("runtime context"));
    }

    #[test]
    fn logical_scroll_shorthand_and_physical_longhand_conflicts_remain_explicit() {
        let parsed = crate::parse_tsx(
            r#"
            import * as stylex from '@stylexjs/stylex'
            import { View } from '@hozo/core'
            const styles = stylex.create({
              axis: { scrollMarginBlock: '8px 12px' },
              top: { scrollMarginTop: 4 }
            })
            const card = <View {...stylex.props(styles.axis, styles.top)} />
        "#,
        );
        assert!(parsed.roots[0].node.style.is_empty());
        assert_eq!(
            parsed.diagnostics[0].code,
            hozo_ir::DiagnosticCode::StylexNotLowered
        );
        assert!(parsed.diagnostics[0].message.contains("runtime context"));
    }

    #[test]
    fn svg_paint_web_values_keep_exact_boundaries() {
        let frontend = frontend(
            r#"
            import * as stylex from '@stylexjs/stylex'
            const styles = stylex.create({
              exact: {
                alignmentBaseline: 'middle', baselineShift: '2px', clipRule: 'evenodd',
                dominantBaseline: 'central', fill: '#123456', fillOpacity: 0.5,
                fillRule: 'nonzero', marker: 'url(#dot)', markerEnd: 'none',
                markerMid: 'url(#dot)', markerStart: 'url(#dot)',
                paintOrder: 'stroke fill markers', shapeRendering: 'crispEdges',
                stroke: 'currentColor', strokeDasharray: '5 3', strokeDashoffset: 2,
                strokeLinecap: 'round', strokeLinejoin: 'bevel', strokeMiterlimit: 4,
                strokeOpacity: '50%', strokeWidth: '2px', textAnchor: 'middle'
              },
              wider: {
                baselineShift: 'calc(1em + 2px)', fillOpacity: 1.5,
                marker: 'paint-server', strokeDasharray: '-1 2', strokeMiterlimit: 0
              }
            })
        "#,
        );
        let Rule::Ready { entries, residual, gaps } = &frontend.sheets["styles"]["exact"] else {
            panic!("exact SVG paint values were not lowerable")
        };
        assert_eq!(entries.len(), 22);
        assert!(entries.iter().all(|entry| entry.properties.iter().all(|property| {
            matches!(property, StyleProperty::WebOnly(_, _))
        })));
        assert!(residual.is_empty());
        assert!(gaps.is_empty());

        let Rule::Ready { entries, residual, gaps } = &frontend.sheets["styles"]["wider"] else {
            panic!("wider SVG paint values should remain residual")
        };
        assert!(entries.is_empty());
        assert_eq!(residual.len(), 5);
        assert_eq!(gaps.len(), 5);
    }

    #[test]
    fn transition_values_the_native_runtime_cannot_preserve_remain_residual() {
        let frontend = frontend(
            r#"
            import * as stylex from '@stylexjs/stylex'
            const styles = stylex.create({
              motion: {
                transitionProperty: 'filter',
                transitionDuration: '0.5ms',
                transitionTimingFunction: 'steps(2, jump-none)'
              }
            })
        "#,
        );
        let Rule::Ready {
            entries,
            residual,
            gaps,
        } = &frontend.sheets["styles"]["motion"]
        else {
            panic!("static unsupported values should remain residual")
        };
        assert!(entries.is_empty());
        assert_eq!(residual.len(), 3);
        assert_eq!(gaps.len(), 3);
    }

    #[test]
    fn transition_shorthand_expands_and_longhand_duration_keeps_priority() {
        let parsed = crate::parse_tsx(
            r#"
            import * as stylex from '@stylexjs/stylex'
            import { Pressable } from '@hozo/core'
            const styles = stylex.create({
              motion: { transition: 'opacity 100ms linear 50ms', transitionDuration: '200ms' }
            })
            const card = <Pressable {...stylex.props(styles.motion)} />
        "#,
        );
        let node = &parsed.roots[0].node;
        assert!(node.style.iter().any(|declaration| matches!(
            declaration.property,
            StyleProperty::TransitionProperty(ref property) if property == "opacity"
        )));
        assert!(node.style.iter().any(|declaration| matches!(
            declaration.property,
            StyleProperty::TransitionDuration(200, Origin::Written)
        )));
        assert!(node.style.iter().any(|declaration| matches!(
            declaration.property,
            StyleProperty::TransitionTimingFunction(ref timing, Origin::Written) if timing == "linear"
        )));
        assert!(node.style.iter().any(|declaration| matches!(
            declaration.property,
            StyleProperty::TransitionDelay(50, Origin::Written)
        )));
        assert!(node.props.passthrough.is_empty());
        assert!(node.props.stylex_residuals.is_empty());
        assert!(parsed.diagnostics.is_empty());
    }

    #[test]
    fn timeline_shorthands_expand_into_independent_longhand_slots() {
        let parsed = crate::parse_tsx(
            r#"
            import * as stylex from '@stylexjs/stylex'
            import { View } from '@hozo/core'
            const styles = stylex.create({
              motion: {
                animationRange: 'entry 20% exit 80%',
                scrollTimeline: '--page y',
                viewTimeline: '--card inline 10% 20%',
                viewTimelineInset: 'auto',
              }
            })
            const card = <View {...stylex.props(styles.motion)} />
        "#,
        );
        let node = &parsed.roots[0].node;
        for (property, value) in [
            ("animation-range-start", "entry 20%"),
            ("animation-range-end", "exit 80%"),
            ("scroll-timeline-name", "--page"),
            ("scroll-timeline-axis", "y"),
            ("view-timeline-name", "--card"),
            ("view-timeline-axis", "inline"),
            ("view-timeline-inset", "auto"),
        ] {
            assert!(node.style.iter().any(|declaration| matches!(
                &declaration.property,
                StyleProperty::WebOnly(name, actual) if name == property && actual == value
            )), "missing {property}: {value} in {:?}", node.style);
        }
        assert!(node.props.passthrough.is_empty());
        assert!(node.props.stylex_residuals.is_empty());
        assert!(parsed.diagnostics.is_empty());
    }

    #[test]
    fn layout_shorthands_expand_into_existing_typed_slots() {
        let frontend = frontend(
            r#"
            import * as stylex from '@stylexjs/stylex'
            const styles = stylex.create({
              exact: {
                flexFlow: 'wrap column-reverse',
                container: 'card-shell / inline-size',
                gridGap: '8px 12px',
                gridRowGap: 4,
                gridColumnGap: 6
              },
              defaults: { flexFlow: 'wrap', container: 'card-shell', gridGap: 8 },
              invalid: { flexFlow: 'row column', container: 'card / size / extra', gridGap: '-1px 8px' }
            })
        "#,
        );
        let Rule::Ready {
            entries,
            residual,
            gaps,
        } = &frontend.sheets["styles"]["exact"]
        else {
            panic!("exact layout shorthands were not lowerable")
        };
        assert_eq!(entries.len(), 5);
        assert_eq!(
            entries
                .iter()
                .flat_map(|entry| &entry.properties)
                .count(),
            8
        );
        assert!(entries.iter().flat_map(|entry| &entry.properties).any(|property| {
            *property == StyleProperty::FlexDirection(FlexDirection::ColumnReverse)
        }));
        assert!(entries.iter().flat_map(|entry| &entry.properties).any(|property| {
            *property == StyleProperty::ColumnGap(Length::Px(12.0))
        }));
        assert!(residual.is_empty());
        assert!(gaps.is_empty());

        let Rule::Ready { entries, .. } = &frontend.sheets["styles"]["defaults"] else {
            panic!("one-token shorthands were not lowerable")
        };
        assert!(entries.iter().flat_map(|entry| &entry.properties).any(|property| {
            *property == StyleProperty::FlexDirection(FlexDirection::Row)
        }));
        assert!(entries.iter().flat_map(|entry| &entry.properties).any(|property| {
            *property == StyleProperty::Keyword("container-type", "normal")
        }));

        let Rule::Ready {
            entries,
            residual,
            gaps,
        } = &frontend.sheets["styles"]["invalid"]
        else {
            panic!("invalid shorthands should remain residual")
        };
        assert!(entries.is_empty());
        assert_eq!(residual.len(), 3);
        assert_eq!(gaps.len(), 3);
    }

    #[test]
    fn border_axis_longhands_expand_into_independent_final_slots() {
        let frontend = frontend(
            r#"
            import * as stylex from '@stylexjs/stylex'
            const styles = stylex.create({
              exact: {
                borderBlockWidth: 8,
                borderInlineWidth: 12,
                borderInlineColor: '#123456',
                borderBlockStyle: 'dashed',
                borderInlineStartStyle: 'dotted',
                borderBlockStartStyle: 'solid'
              },
              invalid: {
                borderBlockWidth: -1,
                borderInlineColor: 'var(--border)',
                borderInlineStyle: 'groove',
                borderTopStyle: 2
              }
            })
        "#,
        );
        let Rule::Ready {
            entries,
            residual,
            gaps,
        } = &frontend.sheets["styles"]["exact"]
        else {
            panic!("exact border longhands were not lowerable")
        };
        assert_eq!(entries.len(), 6);
        assert_eq!(entries.iter().flat_map(|entry| &entry.properties).count(), 10);
        assert!(entries.iter().flat_map(|entry| &entry.properties).any(|property| {
            *property
                == StyleProperty::BorderLogicalWidth(Edge::InlineEnd, Length::Px(12.0))
        }));
        assert!(entries.iter().flat_map(|entry| &entry.properties).any(|property| {
            *property == StyleProperty::BorderInlineStartColor(Color::Css("#123456".to_string()))
        }));
        assert!(entries.iter().flat_map(|entry| &entry.properties).any(|property| {
            *property
                == StyleProperty::WebOnly(
                    "border-top-style".to_string(),
                    "solid".to_string(),
                )
        }));
        assert!(residual.is_empty());
        assert!(gaps.is_empty());

        let Rule::Ready {
            entries,
            residual,
            gaps,
        } = &frontend.sheets["styles"]["invalid"]
        else {
            panic!("invalid border longhands should remain residual")
        };
        assert!(entries.is_empty());
        assert_eq!(residual.len(), 4);
        assert_eq!(gaps.len(), 4);
    }

    #[test]
    fn border_axis_longhand_suppresses_only_its_shorthand_slot() {
        let parsed = crate::parse_tsx(
            r#"
            import * as stylex from '@stylexjs/stylex'
            import { View } from '@hozo/core'
            const styles = stylex.create({
              axis: { borderInlineWidth: 12 },
              start: { borderInlineStartWidth: 4 }
            })
            const card = <View {...stylex.props(styles.start, active && styles.axis)} />
        "#,
        );
        assert!(parsed.diagnostics.is_empty(), "{:?}", parsed.diagnostics);
        let style = &parsed.roots[0].node.style;
        assert!(style.iter().any(|declaration| {
            declaration.condition == Condition::Always
                && declaration.property
                    == StyleProperty::BorderLogicalWidth(Edge::InlineStart, Length::Px(4.0))
        }));
        assert!(!style.iter().any(|declaration| {
            matches!(declaration.condition, Condition::Expr(_))
                && declaration.property
                    == StyleProperty::BorderLogicalWidth(Edge::InlineStart, Length::Px(12.0))
        }));
        assert!(style.iter().any(|declaration| {
            matches!(declaration.condition, Condition::Expr(_))
                && declaration.property
                    == StyleProperty::BorderLogicalWidth(Edge::InlineEnd, Length::Px(12.0))
        }));
    }

    #[test]
    fn layout_longhands_suppress_only_their_conditional_shorthand_slots() {
        let parsed = crate::parse_tsx(
            r#"
            import * as stylex from '@stylexjs/stylex'
            import { View } from '@hozo/core'
            const styles = stylex.create({
              flow: { flexFlow: 'column wrap' },
              direction: { flexDirection: 'row' },
              gaps: { gridGap: '8px 12px' },
              row: { rowGap: 4 }
            })
            const card = <View {...stylex.props(styles.direction, active && styles.flow, styles.row, enabled && styles.gaps)} />
        "#,
        );
        assert!(parsed.diagnostics.is_empty(), "{:?}", parsed.diagnostics);
        let style = &parsed.roots[0].node.style;
        assert!(style.iter().any(|declaration| {
            declaration.condition == Condition::Always
                && declaration.property == StyleProperty::FlexDirection(FlexDirection::Row)
        }));
        assert!(!style.iter().any(|declaration| {
            matches!(declaration.condition, Condition::Expr(_))
                && matches!(declaration.property, StyleProperty::FlexDirection(_))
        }));
        assert!(style.iter().any(|declaration| {
            matches!(declaration.condition, Condition::Expr(_))
                && declaration.property == StyleProperty::Keyword("flex-wrap", "wrap")
        }));
        assert!(!style.iter().any(|declaration| {
            matches!(declaration.condition, Condition::Expr(_))
                && matches!(declaration.property, StyleProperty::RowGap(_))
        }));
        assert!(style.iter().any(|declaration| {
            matches!(declaration.condition, Condition::Expr(_))
                && declaration.property == StyleProperty::ColumnGap(Length::Px(12.0))
        }));
    }

    #[test]
    fn static_container_metadata_becomes_the_existing_contextual_ir() {
        let frontend = frontend(
            r#"
            import * as stylex from '@stylexjs/stylex'
            const styles = stylex.create({
              container: { containerName: 'card-shell', containerType: 'inline-size' },
              normal: { containerType: 'normal' }
            })
        "#,
        );
        let Rule::Ready {
            entries,
            residual,
            gaps,
        } = &frontend.sheets["styles"]["container"]
        else {
            panic!("container metadata was not lowerable")
        };
        assert!(residual.is_empty());
        assert!(gaps.is_empty());
        assert_eq!(
            entries
                .iter()
                .flat_map(|entry| entry.properties.clone())
                .collect::<Vec<_>>(),
            vec![
                StyleProperty::ContainerName("card-shell".to_string()),
                StyleProperty::Keyword("container-type", "inline-size"),
            ]
        );
        let Rule::Ready { entries, .. } = &frontend.sheets["styles"]["normal"] else {
            panic!("normal container type was not lowerable")
        };
        assert_eq!(
            entries[0].properties,
            vec![StyleProperty::Keyword("container-type", "normal")]
        );
    }

    #[test]
    fn wider_container_values_remain_official_stylex_and_shorthand_overlap_lowers() {
        let frontend = frontend(
            r#"
            import * as stylex from '@stylexjs/stylex'
            const styles = stylex.create({
              names: { containerName: 'main secondary' },
              digit: { containerName: '-9invalid' },
              overlap: { container: 'card / inline-size', containerType: 'size' }
            })
        "#,
        );
        for name in ["names", "digit"] {
            let Rule::Ready {
                entries,
                residual,
                gaps,
            } = &frontend.sheets["styles"][name]
            else {
                panic!("unsupported static value should remain residual")
            };
            assert!(entries.is_empty());
            assert_eq!(residual.len(), 1);
            assert_eq!(gaps.len(), 1);
        }
        let Rule::Ready {
            entries,
            residual,
            gaps,
        } = &frontend.sheets["styles"]["overlap"]
        else {
            panic!("overlap should remain representable as residual")
        };
        assert_eq!(entries.len(), 2);
        assert!(residual.is_empty());
        assert!(gaps.is_empty());
    }

    #[test]
    fn grid_values_outside_the_native_solver_subset_remain_stylex_gaps() {
        let frontend = frontend(
            r#"
            import * as stylex from '@stylexjs/stylex'
            const styles = stylex.create({
              autoTrack: { gridTemplateColumns: 'auto 1fr' },
              namedLine: { gridColumnStart: 'content' },
              unequalSpan: { gridColumn: 'span 2 / span 3' }
            })
        "#,
        );
        for name in ["autoTrack", "namedLine", "unequalSpan"] {
            let Rule::Ready {
                entries,
                residual,
                gaps,
            } = &frontend.sheets["styles"][name]
            else {
                panic!("static unsupported Grid value should remain as a residual")
            };
            assert!(entries.is_empty());
            assert_eq!(residual.len(), 1);
            assert_eq!(gaps.len(), 1);
        }
    }

    #[test]
    fn props_spreads_become_ir_and_keep_dynamic_guards() {
        let parsed = crate::parse_tsx(
            r#"
            import * as stylex from '@stylexjs/stylex'
            import { View } from '@hozo/core'
            const styles = stylex.create({
              root: { padding: 16, backgroundColor: '#f00' },
              active: { opacity: 0.5 }
            })
            const card = <View {...stylex.props(styles.root, active && styles.active)} />
        "#,
        );
        let node = &parsed.roots[0].node;
        assert_eq!(node.style.len(), 6);
        assert!(node.props.passthrough.is_empty());
        assert_eq!(
            node.style
                .iter()
                .filter(|declaration| { matches!(declaration.condition, Condition::Expr(_)) })
                .count(),
            1
        );
    }

    #[test]
    fn nested_media_becomes_viewport_and_environment_conditions() {
        let parsed = crate::parse_tsx(
            r#"
            import * as stylex from '@stylexjs/stylex'
            import { View } from '@hozo/core'
            const styles = stylex.create({
              root: {
                padding: 4,
                '@media (min-width: 600px)': { padding: 24 },
                '@media (prefers-color-scheme: dark)': { opacity: 0.5 }
              }
            })
            const card = <View {...stylex.props(styles.root)} />
        "#,
        );
        assert!(parsed.diagnostics.is_empty(), "{:?}", parsed.diagnostics);
        let style = &parsed.roots[0].node.style;
        assert_eq!(style.len(), 9);
        assert_eq!(style.iter().filter(|declaration| {
            declaration.condition == Condition::Width { at_least: true, value: "600px".to_string() }
        }).count(), 4);
        assert_eq!(style.iter().filter(|declaration| declaration.condition == Condition::Dark).count(), 1);
        assert!(matches!(style.first().map(|declaration| &declaration.condition), Some(Condition::Always)));
        assert!(matches!(style.last().map(|declaration| &declaration.condition), Some(Condition::Dark)));
    }

    #[test]
    fn nested_interaction_pseudos_become_existing_cross_platform_conditions() {
        let parsed = crate::parse_tsx(
            r#"
            import * as stylex from '@stylexjs/stylex'
            import { Pressable } from '@hozo/core'
            const styles = stylex.create({
              root: {
                opacity: 1,
                ':hover': { opacity: 0.75 },
                ':focus-visible': { opacity: 0.5 },
                ':active': { transform: 'scale(0.95)' }
              }
            })
            const card = <Pressable accessibilityRole="button" {...stylex.props(styles.root)} />
        "#,
        );
        assert!(parsed.diagnostics.is_empty(), "{:?}", parsed.diagnostics);
        let style = &parsed.roots[0].node.style;
        assert_eq!(style.len(), 4);
        assert_eq!(style[0].condition, Condition::Always);
        assert_eq!(style[1].condition, Condition::FocusVisible);
        assert_eq!(style[2].condition, Condition::Hover);
        assert_eq!(style[3].condition, Condition::Pressed);
    }

    #[test]
    fn nested_pseudos_compose_in_the_selector_order_stylex_emits() {
        let parsed = crate::parse_tsx(
            r#"
            import * as stylex from '@stylexjs/stylex'
            import { Pressable } from '@hozo/core'
            const styles = stylex.create({
              root: { ':hover': { ':focus': { opacity: 0.5 } } }
            })
            const card = <Pressable accessibilityRole="button" {...stylex.props(styles.root)} />
        "#,
        );
        assert!(parsed.diagnostics.is_empty(), "{:?}", parsed.diagnostics);
        let [declaration] = parsed.roots[0].node.style.as_slice() else {
            panic!("expected one nested declaration")
        };
        assert_eq!(
            declaration.condition,
            Condition::All(vec![Condition::Focus, Condition::Hover])
        );
    }

    #[test]
    fn unsupported_pseudo_blocks_stay_whole_for_official_stylex() {
        let source = r#"
            import * as stylex from '@stylexjs/stylex'
            import { View } from '@hozo/core'
            const styles = stylex.create({
              root: {
                opacity: 1,
                ':checked': { opacity: 0.5, padding: 8 }
              }
            })
            const card = <View {...stylex.props(styles.root)} />
        "#;
        let parsed = crate::parse_tsx(source);
        let node = &parsed.roots[0].node;
        assert_eq!(node.style.len(), 1);
        assert_eq!(node.props.stylex_residuals.len(), 1);
        let residual = node.props.stylex_residuals[0].render_expression(source);
        assert_eq!(residual.matches(":checked").count(), 1, "{residual}");
        assert!(residual.contains("opacity: 0.5"), "{residual}");
        assert!(residual.contains("padding: 8"), "{residual}");
        assert!(!residual.contains("opacity: 1"), "{residual}");
    }

    #[test]
    fn nested_media_compose_in_official_wrapper_order_and_with_props_guards() {
        let parsed = crate::parse_tsx(
            r#"
            import * as stylex from '@stylexjs/stylex'
            import { View } from '@hozo/core'
            const styles = stylex.create({
              root: {
                '@media (min-width: 600px)': {
                  '@media (orientation: landscape)': { opacity: 0.5 }
                }
              }
            })
            const card = <View {...stylex.props(active && styles.root)} />
        "#,
        );
        assert!(parsed.diagnostics.is_empty(), "{:?}", parsed.diagnostics);
        let [declaration] = parsed.roots[0].node.style.as_slice() else {
            panic!("expected one nested declaration")
        };
        let Condition::All(conditions) = &declaration.condition else {
            panic!("nested conditions were not composed")
        };
        assert_eq!(conditions.len(), 3);
        assert_eq!(conditions[0], Condition::Environment(Environment::Landscape));
        assert_eq!(conditions[1], Condition::Width { at_least: true, value: "600px".to_string() });
        assert!(matches!(conditions[2], Condition::Expr(_)));
    }

    #[test]
    fn mixed_nested_media_stays_whole_in_the_stylex_residual() {
        let source = r#"
            import * as stylex from '@stylexjs/stylex'
            import { View } from '@hozo/core'
            const styles = stylex.create({
              root: {
                opacity: 1,
                '@media (min-width: 600px)': {
                  padding: 24,
                  speak: 'normal'
                }
              }
            })
            const card = <View {...stylex.props(styles.root)} />
        "#;
        let parsed = crate::parse_tsx(source);
        let node = &parsed.roots[0].node;
        assert_eq!(node.style.len(), 1);
        assert_eq!(node.props.stylex_residuals.len(), 1);
        let residual = node.props.stylex_residuals[0].render_expression(source);
        assert_eq!(residual.matches("@media (min-width: 600px)").count(), 1, "{residual}");
        assert!(residual.contains("padding: 24"), "{residual}");
        assert!(residual.contains("speak: 'normal'"), "{residual}");
        assert!(!residual.contains("opacity: 1"), "{residual}");
    }

    #[test]
    fn recursive_arrays_and_ternaries_keep_their_guards() {
        let parsed = crate::parse_tsx(
            r#"
            import * as stylex from '@stylexjs/stylex'
            import { View } from '@hozo/core'
            const styles = stylex.create({
              root: { padding: 16 },
              active: { opacity: 0.5 },
              inactive: { opacity: 1 }
            })
            const first = <View {...stylex.props([styles.root, [active && styles.active]])} />
            const second = <View {...stylex.props(active ? styles.active : styles.inactive)} />
        "#,
        );
        assert!(parsed.diagnostics.is_empty(), "{:?}", parsed.diagnostics);
        let array_style = &parsed.roots[0].node.style;
        assert_eq!(array_style.len(), 5);
        assert_eq!(
            array_style
                .iter()
                .filter(|declaration| matches!(declaration.condition, Condition::Expr(_)))
                .count(),
            1
        );
        let ternary_style = &parsed.roots[1].node.style;
        assert_eq!(ternary_style.len(), 2);
        assert!(ternary_style.iter().any(|declaration| {
            matches!(declaration.condition, Condition::Expr(ConditionExpr::Ref(_)))
        }));
        assert!(ternary_style.iter().any(|declaration| {
            matches!(declaration.condition, Condition::Expr(ConditionExpr::Not(_)))
        }));
    }

    #[test]
    fn ternary_partial_residuals_rebuild_both_conditions() {
        let source = r#"
            import * as stylex from '@stylexjs/stylex'
            import { View } from '@hozo/core'
            const styles = stylex.create({
              active: { opacity: 0.5, speak: 'normal' },
              inactive: { padding: 8, cueAfter: 'none' }
            })
            const card = <View {...stylex.props(active ? styles.active : styles.inactive)} />
        "#;
        let parsed = crate::parse_tsx(source);
        let node = &parsed.roots[0].node;
        assert_eq!(node.style.len(), 5);
        assert!(node.props.passthrough.is_empty());
        assert_eq!(node.props.stylex_residuals.len(), 1);
        let residual = node.props.stylex_residuals[0].render_expression(source);
        assert!(residual.contains("(active)"), "{residual}");
        assert!(residual.contains("!(active)"), "{residual}");
        assert!(residual.contains("speak: 'normal'"), "{residual}");
        assert!(residual.contains("cueAfter: 'none'"), "{residual}");
        assert!(!residual.contains("opacity: 0.5"), "{residual}");
        assert!(!residual.contains("padding: 8"), "{residual}");
    }

    #[test]
    fn module_const_object_spreads_flatten_in_source_order() {
        let source = r#"
            import * as stylex from '@stylexjs/stylex'
            import { View } from '@hozo/core'
            const inset = { padding: 8 }
            const shared = { ...inset, opacity: 0.5, speak: 'normal' }
            const styles = stylex.create({
              root: { ...shared, ...{ marginTop: 4 }, opacity: 0.75 }
            })
            const card = <View {...stylex.props(styles.root)} />
        "#;
        let parsed = crate::parse_tsx(source);
        let node = &parsed.roots[0].node;
        assert_eq!(node.style.len(), 6);
        assert!(node.style.iter().any(|declaration| {
            matches!(declaration.property, StyleProperty::Opacity(0.75))
        }));
        assert!(!node.style.iter().any(|declaration| {
            matches!(declaration.property, StyleProperty::Opacity(0.5))
        }));
        assert_eq!(node.props.stylex_residuals.len(), 1);
        let residual = node.props.stylex_residuals[0].render_expression(source);
        assert!(residual.contains("speak: 'normal'"), "{residual}");
        assert!(!residual.contains("opacity"), "{residual}");
        assert!(!residual.contains("padding"), "{residual}");
    }

    #[test]
    fn mutable_escaped_late_and_dynamic_object_spreads_remain_official_stylex() {
        let parsed = crate::parse_tsx(
            r#"
            import * as stylex from '@stylexjs/stylex'
            import { View } from '@hozo/core'
            let mutable = { opacity: 0.5 }
            const escaped = { opacity: 0.5 }
            escaped.opacity = 0.75
            const mutableStyles = stylex.create({ root: { ...mutable, padding: 8 } })
            const escapedStyles = stylex.create({ root: { ...escaped, padding: 8 } })
            const lateStyles = stylex.create({ root: { ...late, padding: 8 } })
            const late = { opacity: 0.5 }
            const dynamicStyles = stylex.create({ root: { ...makeStyles(), padding: 8 } })
            const one = <View {...stylex.props(mutableStyles.root)} />
            const two = <View {...stylex.props(escapedStyles.root)} />
            const three = <View {...stylex.props(lateStyles.root)} />
            const four = <View {...stylex.props(dynamicStyles.root)} />
        "#,
        );
        assert_eq!(parsed.roots.len(), 4);
        for root in &parsed.roots {
            assert!(root.node.style.is_empty());
            assert_eq!(root.node.props.passthrough.len(), 1);
        }
        assert_eq!(parsed.diagnostics.len(), 4);
        assert!(parsed.diagnostics.iter().all(|diagnostic| {
            diagnostic.code == hozo_ir::DiagnosticCode::StylexNotLowered
        }));
    }

    #[test]
    fn a_later_unconditional_style_removes_an_earlier_conditional_property() {
        let parsed = crate::parse_tsx(
            r#"
            import * as stylex from '@stylexjs/stylex'
            import { View } from '@hozo/core'
            const styles = stylex.create({
              active: { opacity: 0.5 },
              base: { opacity: 1 }
            })
            const card = <View {...stylex.props(active && styles.active, styles.base)} />
        "#,
        );
        let style = &parsed.roots[0].node.style;
        assert_eq!(style.len(), 1);
        assert_eq!(style[0].condition, Condition::Always);
    }

    #[test]
    fn unsupported_stylex_is_carried_and_diagnosed_at_the_jsx_use() {
        let parsed = crate::parse_tsx(
            r#"
            import * as stylex from '@stylexjs/stylex'
            import { View } from '@hozo/core'
            const styles = stylex.create({ root: { transform: 'translateX(calc(100% - 2px))' } })
            const card = <View {...stylex.props(styles.root)} />
        "#,
        );
        let node = &parsed.roots[0].node;
        assert_eq!(node.style.len(), 0);
        assert_eq!(node.props.passthrough.len(), 1);
        assert_eq!(parsed.diagnostics.len(), 1);
        assert_eq!(
            parsed.diagnostics[0].code,
            hozo_ir::DiagnosticCode::StylexNotLowered
        );
        assert!(parsed.diagnostics[0].span.start >= node.span.start);
    }

    #[test]
    fn supported_declarations_survive_beside_a_static_stylex_residual() {
        let source = r#"
            import * as stylex from '@stylexjs/stylex'
            import { View } from '@hozo/core'
            const styles = stylex.create({
              root: { padding: 16, speak: 'normal' }
            })
            const card = <View {...stylex.props(styles.root)} />
        "#;
        let parsed = crate::parse_tsx(source);
        let node = &parsed.roots[0].node;
        assert_eq!(node.style.len(), 4);
        assert!(node.props.passthrough.is_empty());
        assert_eq!(node.props.stylex_residuals.len(), 1);
        let residual = node.props.stylex_residuals[0].render_expression(source);
        assert!(residual.contains("speak: 'normal'"));
        assert!(!residual.contains("padding: 16"));
        assert_eq!(parsed.diagnostics.len(), 1);
        assert!(parsed.diagnostics[0].span.start >= node.span.start);
    }

    #[test]
    fn an_overlapping_residual_keeps_the_original_stylex_call_intact() {
        let parsed = crate::parse_tsx(
            r#"
            import * as stylex from '@stylexjs/stylex'
            import { View } from '@hozo/core'
            const styles = stylex.create({
              root: {
                transform: 'rotate(10deg)',
                transform: 'translateX(calc(100% - 2px))'
              }
            })
            const card = <View {...stylex.props(styles.root)} />
        "#,
        );
        let node = &parsed.roots[0].node;
        assert!(node.style.is_empty());
        assert_eq!(node.props.passthrough.len(), 1);
        assert!(node.props.stylex_residuals.is_empty());
        assert!(parsed.diagnostics[0].message.contains("cascade is not approximated"));
    }

    #[test]
    fn physical_longhand_beats_a_later_shorthand_by_stylex_priority() {
        let parsed = crate::parse_tsx(
            r#"
            import * as stylex from '@stylexjs/stylex'
            import { View } from '@hozo/core'
            const styles = stylex.create({
              all: { padding: 16 },
              top: { paddingTop: 8 }
            })
            const card = <View {...stylex.props(styles.top, styles.all)} />
        "#,
        );
        assert!(parsed.diagnostics.is_empty(), "{:?}", parsed.diagnostics);
        let style = &parsed.roots[0].node.style;
        assert!(matches!(
            style.last().map(|declaration| &declaration.property),
            Some(StyleProperty::PaddingTop(Length::Px(8.0)))
        ));
        let flattened = hozo_ir::dedupe_last_wins(
            style
                .iter()
                .map(|declaration| declaration.property.clone())
                .collect(),
        );
        assert_eq!(flattened.len(), 4);
        assert!(flattened.contains(&StyleProperty::PaddingTop(Length::Px(8.0))));
    }

    #[test]
    fn unconditional_longhand_removes_an_unreachable_conditional_shorthand_slot() {
        let parsed = crate::parse_tsx(
            r#"
            import * as stylex from '@stylexjs/stylex'
            import { View } from '@hozo/core'
            const styles = stylex.create({
              all: { padding: 16 },
              top: { paddingTop: 8 }
            })
            const card = <View {...stylex.props(styles.top, active && styles.all)} />
        "#,
        );
        assert!(parsed.diagnostics.is_empty(), "{:?}", parsed.diagnostics);
        let style = &parsed.roots[0].node.style;
        assert_eq!(style.len(), 4);
        assert_eq!(
            style
                .iter()
                .filter(|declaration| matches!(declaration.condition, Condition::Expr(_)))
                .count(),
            3
        );
        assert!(!style.iter().any(|declaration| {
            matches!(declaration.condition, Condition::Expr(_))
                && matches!(declaration.property, StyleProperty::PaddingTop(_))
        }));
    }

    #[test]
    fn caret_color_longhand_suppresses_only_its_conditional_shorthand_slot() {
        let parsed = crate::parse_tsx(
            r#"
            import * as stylex from '@stylexjs/stylex'
            import { TextInput } from '@hozo/core'
            const styles = stylex.create({
              all: { caret: '#123456 bar' },
              color: { caretColor: '#654321' }
            })
            const input = <TextInput {...stylex.props(styles.color, active && styles.all)} />
        "#,
        );
        assert!(parsed.diagnostics.is_empty(), "{:?}", parsed.diagnostics);
        let style = &parsed.roots[0].node.style;
        assert!(!style.iter().any(|declaration| {
            matches!(declaration.condition, Condition::Expr(_))
                && matches!(declaration.property, StyleProperty::CaretColor(_))
        }));
        assert!(style.iter().any(|declaration| {
            matches!(declaration.condition, Condition::Expr(_))
                && declaration.property
                    == StyleProperty::WebOnly("caret-shape".to_string(), "bar".to_string())
        }));
    }

    #[test]
    fn the_official_four_property_priority_tiers_are_explicit() {
        assert_eq!(property_priority("padding"), 1000);
        assert_eq!(property_priority("paddingInline"), 2000);
        assert_eq!(property_priority("paddingInlineStart"), 3000);
        assert_eq!(property_priority("paddingTop"), 4000);
        assert_eq!(property_priority("paddingBlockStart"), 4000);
        assert_eq!(canonical_property("paddingBlockStart"), "paddingTop");
        assert_eq!(property_priority("scrollMargin"), 1000);
        assert_eq!(property_priority("grid"), 1000);
        assert_eq!(property_priority("scrollMarginInline"), 2000);
        assert_eq!(property_priority("scrollMarginInlineStart"), 3000);
        assert_eq!(property_priority("scrollMarginLeft"), 4000);
        assert_eq!(property_priority("gridTemplateAreas"), 2000);
        assert_eq!(property_priority("textDecoration"), 2000);
        assert_eq!(property_priority("textDecorationLine"), 3000);
        assert!(property_names_overlap("textDecoration", "textDecorationLine"));
        assert!(property_names_overlap("textEmphasis", "textEmphasisColor"));
        assert_eq!(property_priority("caret"), 2000);
        assert_eq!(property_priority("caretColor"), 3000);
        assert!(property_names_overlap("caret", "caretColor"));
        assert_eq!(property_priority("outline"), 2000);
        assert_eq!(property_priority("outlineWidth"), 3000);
        assert!(property_names_overlap("outline", "outlineWidth"));
    }

    #[test]
    fn direction_dependent_physical_and_logical_priority_remains_explicit() {
        let parsed = crate::parse_tsx(
            r#"
            import * as stylex from '@stylexjs/stylex'
            import { View } from '@hozo/core'
            const styles = stylex.create({
              logical: { paddingInlineStart: 16 },
              physical: { paddingLeft: 8 }
            })
            const card = <View {...stylex.props(styles.logical, styles.physical)} />
        "#,
        );
        assert!(parsed.roots[0].node.style.is_empty());
        assert_eq!(
            parsed.diagnostics[0].code,
            hozo_ir::DiagnosticCode::StylexNotLowered
        );
        assert!(parsed.diagnostics[0].message.contains("runtime context"));
    }

    #[test]
    fn direction_dependent_border_edges_remain_explicit() {
        for (logical, physical) in [
            ("borderInlineStartWidth: 16", "borderLeftWidth: 8"),
            ("borderInlineStartColor: 'red'", "borderRightColor: 'blue'"),
            ("borderInlineStartStyle: 'dashed'", "borderLeftStyle: 'solid'"),
            ("borderBlockWidth: 16", "borderTopWidth: 8"),
        ] {
            let source = format!(
                r#"
                import * as stylex from '@stylexjs/stylex'
                import {{ View }} from '@hozo/core'
                const styles = stylex.create({{
                  logical: {{ {logical} }},
                  physical: {{ {physical} }}
                }})
                const card = <View {{...stylex.props(styles.logical, styles.physical)}} />
            "#,
            );
            let parsed = crate::parse_tsx(&source);
            assert!(parsed.roots[0].node.style.is_empty(), "{logical} / {physical}");
            assert_eq!(
                parsed.diagnostics[0].code,
                hozo_ir::DiagnosticCode::StylexNotLowered
            );
            assert!(parsed.diagnostics[0].message.contains("runtime context"));
        }
    }

    #[test]
    fn function_local_sheets_are_declined_until_bindings_are_scope_resolved() {
        let parsed = crate::parse_tsx(
            r#"
            import * as stylex from '@stylexjs/stylex'
            import { View } from '@hozo/core'
            function Card() {
              const styles = stylex.create({ root: { padding: 16 } })
              return <View {...stylex.props(styles.root)} />
            }
        "#,
        );
        assert!(parsed.roots[0].node.style.is_empty());
        assert_eq!(
            parsed.diagnostics[0].code,
            hozo_ir::DiagnosticCode::StylexNotLowered
        );
        assert!(parsed.diagnostics[0].message.contains("module-scope"));
    }

    #[test]
    fn place_content_uses_two_final_slots_and_declines_wider_alignment() {
        assert_eq!(
            stylex_place_content(&StaticValue::String("space-between center".to_string())),
            Some(vec![
                StyleProperty::AlignContent(Justify::Between),
                StyleProperty::JustifyContent(Justify::Center),
            ])
        );
        assert!(stylex_place_content(&StaticValue::String("stretch".to_string())).is_none());
        assert!(stylex_place_content(&StaticValue::String("safe center".to_string())).is_none());
        assert_eq!(property_priority("placeContent"), 2000);
        assert!(property_names_overlap("placeContent", "alignContent"));
        assert!(property_names_overlap("placeContent", "justifyContent"));
    }

    #[test]
    fn single_layer_text_shadow_is_typed_and_wider_values_stay_residual() {
        let parsed = crate::parse_tsx(
            r#"
            import * as stylex from '@stylexjs/stylex'
            import { Text } from '@hozo/core'
            const styles = stylex.create({
              portable: { textShadow: 'rgba(0, 0, 0, 0.5) 1px -2px 4px' },
              multiple: { textShadow: '1px 2px #000, 3px 4px red' },
              relative: { textShadow: '1rem 2px 3px red' }
            })
            const label = <Text {...stylex.props(styles.portable)} />
        "#,
        );
        assert!(parsed.diagnostics.is_empty(), "{:?}", parsed.diagnostics);
        let property = &parsed.roots[0].node.style[0].property;
        let StyleProperty::TextShadow(value) = property else {
            panic!("expected typed text shadow, got {property:?}");
        };
        assert_eq!(value.css(), "rgba(0,0,0,.5) 1px -2px 4px");
        assert!(value.portable_parts().is_some());

        for rule in ["multiple", "relative"] {
            let source = format!(
                r#"
                import * as stylex from '@stylexjs/stylex'
                import {{ Text }} from '@hozo/core'
                const styles = stylex.create({{
                  multiple: {{ textShadow: '1px 2px #000, 3px 4px red' }},
                  relative: {{ textShadow: '1rem 2px 3px red' }}
                }})
                const label = <Text {{...stylex.props(styles.{rule})}} />
            "#,
            );
            let parsed = crate::parse_tsx(&source);
            assert!(parsed.roots[0].node.style.is_empty());
            assert_eq!(parsed.diagnostics[0].code, hozo_ir::DiagnosticCode::StylexNotLowered);
        }
    }
}
