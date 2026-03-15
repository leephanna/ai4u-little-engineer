/**
 * AI4U Little Engineer — Supported Part Families (V1)
 * These are the ONLY families supported in V1. Do not extend without updating
 * the CAD worker generators and the eval suite.
 */

export const PART_FAMILIES = [
  "spacer",
  "flat_bracket",
  "l_bracket",
  "u_bracket",
  "hole_plate",
  "standoff_block",
  "cable_clip",
  "enclosure",
  "adapter_bushing",
  "simple_jig",
] as const;

export type PartFamily = (typeof PART_FAMILIES)[number];

export const PART_FAMILY_LABELS: Record<PartFamily, string> = {
  spacer: "Spacer",
  flat_bracket: "Flat Bracket",
  l_bracket: "L-Bracket",
  u_bracket: "U-Bracket / Saddle Clamp",
  hole_plate: "Hole Plate / Mounting Plate",
  standoff_block: "Standoff Block",
  cable_clip: "Cable Clip",
  enclosure: "Enclosure / Box",
  adapter_bushing: "Adapter Bushing",
  simple_jig: "Simple Jig / Alignment Fixture",
};

export const PART_FAMILY_DESCRIPTIONS: Record<PartFamily, string> = {
  spacer:
    "Cylindrical or tubular spacer for maintaining distance between components.",
  flat_bracket:
    "Flat plate with mounting holes for attaching components to surfaces.",
  l_bracket:
    "L-shaped bracket for corner mounting or 90-degree angle connections.",
  u_bracket:
    "U-shaped saddle clamp for securing pipes, tubes, or round profiles.",
  hole_plate:
    "Flat plate with a pattern of holes for mounting, alignment, or distribution.",
  standoff_block:
    "Rectangular block that creates a standoff distance between two surfaces.",
  cable_clip:
    "Clip for routing and securing cables, wires, or tubing.",
  enclosure:
    "Box or enclosure for housing electronics, components, or assemblies.",
  adapter_bushing:
    "Bushing or sleeve for adapting between different bore sizes or standards.",
  simple_jig:
    "Alignment fixture or jig for repeatable positioning during assembly or machining.",
};

/** Required dimension fields per family */
export const REQUIRED_DIMENSIONS: Record<PartFamily, string[]> = {
  spacer: ["outer_diameter", "inner_diameter", "length"],
  flat_bracket: ["length", "width", "thickness", "hole_count", "hole_diameter"],
  l_bracket: ["leg_a", "leg_b", "thickness", "width"],
  u_bracket: ["pipe_od", "wall_thickness", "flange_width", "flange_length"],
  hole_plate: ["length", "width", "thickness", "hole_count", "hole_diameter"],
  standoff_block: ["length", "width", "height", "hole_diameter"],
  cable_clip: ["cable_od", "wall_thickness", "base_width"],
  enclosure: ["inner_length", "inner_width", "inner_height", "wall_thickness"],
  adapter_bushing: ["outer_diameter", "inner_diameter", "length"],
  simple_jig: ["length", "width", "height"],
};

export const VARIANT_TYPES = [
  "requested",
  "stronger",
  "print_optimized",
  "alternate",
] as const;

export type VariantType = (typeof VARIANT_TYPES)[number];

export const VARIANT_LABELS: Record<VariantType, string> = {
  requested: "Requested Design",
  stronger: "Stronger Version",
  print_optimized: "Print-Optimized",
  alternate: "Alternate Concept",
};

export const SUPPORTED_UNITS = ["mm", "in"] as const;
export type Units = (typeof SUPPORTED_UNITS)[number];

export const SUPPORTED_MATERIALS = [
  "PLA",
  "PETG",
  "ABS",
  "ASA",
  "TPU",
  "Nylon",
  "PEEK",
  "Aluminum",
  "Steel",
  "Unknown",
] as const;
export type Material = (typeof SUPPORTED_MATERIALS)[number];

/** Confidence thresholds per spec section 12 */
export const CONFIDENCE_THRESHOLDS = {
  MUST_CLARIFY: 0.65,
  CONCEPT_PREVIEW_ONLY: 0.85,
} as const;

export const JOB_STATUSES = [
  "draft",
  "clarifying",
  "generating",
  "awaiting_approval",
  "approved",
  "rejected",
  "printed",
  "failed",
] as const;

export type JobStatus = (typeof JOB_STATUSES)[number];

export const CAD_ENGINES = ["build123d", "freecad"] as const;
export type CadEngine = (typeof CAD_ENGINES)[number];
