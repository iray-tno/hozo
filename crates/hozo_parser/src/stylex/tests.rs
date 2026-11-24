use hozo_ir::{
    Angle, Color, ConditionExpr, Dimension, Edge, Environment, FilterFunction, FlexDirection,
    FontWeight, GridLine, GridSpan, GridTracks, Justify, Length, Origin, Scale, TextOverflow,
    TransformFunction, WhiteSpace,
};
use oxc_allocator::Allocator;
use oxc_parser::Parser;
use oxc_span::SourceType;

use super::css_tokens::web_longhand;
use super::overlap::property_names_overlap;
use super::priority::{canonical_property, property_priority};
use super::shorthands::stylex_place_content;
use super::static_value::StaticValue;
use super::web_functions::minify_css_commas;
use super::*;

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

mod conditions_and_residuals;
mod shorthands;
mod static_values;
mod web_properties;
