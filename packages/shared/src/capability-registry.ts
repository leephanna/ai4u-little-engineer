/**
 * AI4U Little Engineer — Capability Registry (V2)
 *
 * This is the authoritative, code-first source of truth for every operation
 * the system can perform. It mirrors the `capability_registry` DB table
 * (migration 003_intelligence_layer.sql) and is used:
 *
 *   1. Server-side: by the Truth Gate to validate requests without a DB round-trip
 *   2. Client-side: to drive honest UI (greyed-out families, clarify prompts)
 *   3. DB seed: the SQL migration seeds from this same data
 *
 * Maturity levels:
 *   "proven"       — generator has passed eval suite, used in production
 *   "candidate"    — generator exists but eval coverage < 90%
 *   "experimental" — generator is a stub or work-in-progress
 *
 * Truth labels (what the system tells the user):
 *   "supported"          — fully supported, will generate
 *   "clarify_required"   — supported but needs more info before generating
 *   "concept_preview"    — low confidence, shows preview only, no STL
 *   "unsupported"        — not in registry, rejected with explanation
 *
 * NEVER add a family to maturity "proven" until its generator passes the
 * eval suite (apps/cad-worker/eval/generators/).
 */

import type { PartFamily } from "./part-families";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type MaturityLevel = "proven" | "candidate" | "experimental";

export type TruthLabel =
  | "supported"
  | "clarify_required"
  | "concept_preview"
  | "unsupported";

export interface DimensionSpec {
  name: string;
  unit: "mm" | "in" | "count" | "ratio";
  min: number;
  max: number;
  description: string;
}

export interface ValidationRule {
  rule: string;
  description: string;
}

export interface QuestionStrategy {
  /** First question to ask if the user hasn't specified dimensions */
  primary_question: string;
  /** Dimension names to ask about in order */
  dimension_order: string[];
  /** Example values to show in the UI */
  example_values: Record<string, number>;
}

export interface CapabilityEntry {
  /** Unique identifier — matches the generator name in the CAD worker */
  family: PartFamily;
  /** Human-readable label */
  label: string;
  /** One-sentence description shown in UI */
  description: string;
  /** Route type: parametric = direct CAD, image_relief = image processing */
  route_type: "parametric" | "image_relief" | "svg_extrusion" | "library_adaptation";
  /** Object class for grouping in UI */
  object_class: "mechanical" | "structural" | "enclosure" | "fixture" | "showcase";
  /** Required dimension fields — must all be present for generation */
  required_dimensions: DimensionSpec[];
  /** Optional dimension fields — have defaults if not provided */
  optional_dimensions: DimensionSpec[];
  /** Validation rules applied by the Truth Gate */
  validation_rules: ValidationRule[];
  /** Strategy for asking clarifying questions */
  question_strategy: QuestionStrategy;
  /** Generator version in the CAD worker */
  generator_version: string;
  /** Maturity level — controls whether the capability is offered */
  maturity_level: MaturityLevel;
  /** Whether this capability can be used for demo presets */
  demo_eligible: boolean;
  /** Whether a completed job using this capability can be saved to Library */
  reuse_eligible: boolean;
  /**
   * Degradation policy — what to do when generation fails:
   *   "reject"         — return error, never show fake success
   *   "clarify"        — ask for more info before retrying
   *   "concept_only"   — show spec summary only, no STL
   */
  degradation_policy: "reject" | "clarify" | "concept_only";
  /** Empirical success rate (0–1) — updated by the learning loop */
  success_rate: number;
  /** Number of times this capability has been used */
  usage_count: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Registry — all 10 MVP families
// ─────────────────────────────────────────────────────────────────────────────

export const CAPABILITY_REGISTRY: CapabilityEntry[] = [
  // ── 1. spacer ─────────────────────────────────────────────────────────────
  {
    family: "spacer",
    label: "Spacer / Cylindrical Body",
    description:
      "Cylindrical or tubular spacer for maintaining distance between components. Also used as rocket body showcase prints.",
    route_type: "parametric",
    object_class: "mechanical",
    required_dimensions: [
      { name: "outer_diameter", unit: "mm", min: 2, max: 500, description: "Outer diameter of the cylinder" },
      { name: "inner_diameter", unit: "mm", min: 0, max: 499, description: "Inner bore diameter (0 = solid)" },
      { name: "length",         unit: "mm", min: 1, max: 500, description: "Total length / height of the spacer" },
    ],
    optional_dimensions: [],
    validation_rules: [
      { rule: "inner_diameter < outer_diameter", description: "Inner bore must be smaller than outer diameter" },
      { rule: "outer_diameter - inner_diameter >= 1.2", description: "Wall thickness must be at least 1.2mm" },
    ],
    question_strategy: {
      primary_question: "What outer diameter and length do you need?",
      dimension_order: ["outer_diameter", "length", "inner_diameter"],
      example_values: { outer_diameter: 20, inner_diameter: 10, length: 30 },
    },
    generator_version: "1.0.0",
    maturity_level: "proven",
    demo_eligible: true,
    reuse_eligible: true,
    degradation_policy: "reject",
    success_rate: 0.97,
    usage_count: 0,
  },

  // ── 2. flat_bracket ───────────────────────────────────────────────────────
  {
    family: "flat_bracket",
    label: "Flat Bracket / Mounting Plate",
    description:
      "Flat plate with mounting holes for attaching components to surfaces or walls.",
    route_type: "parametric",
    object_class: "structural",
    required_dimensions: [
      { name: "length",    unit: "mm",   min: 5,   max: 500, description: "Overall length" },
      { name: "width",    unit: "mm",   min: 5,   max: 500, description: "Overall width" },
      { name: "thickness", unit: "mm",  min: 1.2, max: 50,  description: "Plate thickness" },
    ],
    optional_dimensions: [
      { name: "hole_count",    unit: "count", min: 0, max: 20, description: "Number of mounting holes (default: 2)" },
      { name: "hole_diameter", unit: "mm",   min: 1, max: 30, description: "Diameter of each hole (default: 4mm)" },
    ],
    validation_rules: [
      { rule: "thickness >= 1.2", description: "Wall thickness must be at least 1.2mm" },
      { rule: "hole_diameter < width && hole_diameter < length", description: "Holes must fit within the plate" },
    ],
    question_strategy: {
      primary_question: "What are the overall dimensions (length × width) and how many holes do you need?",
      dimension_order: ["length", "width", "thickness", "hole_count", "hole_diameter"],
      example_values: { length: 80, width: 40, thickness: 3, hole_count: 4, hole_diameter: 4 },
    },
    generator_version: "1.0.0",
    maturity_level: "proven",
    demo_eligible: false,
    reuse_eligible: true,
    degradation_policy: "reject",
    success_rate: 0.96,
    usage_count: 0,
  },

  // ── 3. l_bracket ──────────────────────────────────────────────────────────
  {
    family: "l_bracket",
    label: "L-Bracket / Corner Bracket",
    description:
      "L-shaped bracket for corner mounting or 90-degree angle connections between two surfaces.",
    route_type: "parametric",
    object_class: "structural",
    required_dimensions: [
      { name: "leg_a",     unit: "mm", min: 5,   max: 500, description: "Length of the first leg" },
      { name: "leg_b",     unit: "mm", min: 5,   max: 500, description: "Length of the second leg" },
      { name: "thickness", unit: "mm", min: 1.2, max: 50,  description: "Material thickness" },
      { name: "width",     unit: "mm", min: 5,   max: 500, description: "Width of both legs" },
    ],
    optional_dimensions: [],
    validation_rules: [
      { rule: "thickness >= 1.2", description: "Wall thickness must be at least 1.2mm" },
    ],
    question_strategy: {
      primary_question: "What are the two leg lengths and the bracket width?",
      dimension_order: ["leg_a", "leg_b", "width", "thickness"],
      example_values: { leg_a: 50, leg_b: 50, thickness: 3, width: 20 },
    },
    generator_version: "1.0.0",
    maturity_level: "proven",
    demo_eligible: false,
    reuse_eligible: true,
    degradation_policy: "reject",
    success_rate: 0.95,
    usage_count: 0,
  },

  // ── 4. u_bracket ──────────────────────────────────────────────────────────
  {
    family: "u_bracket",
    label: "U-Bracket / Saddle Clamp",
    description:
      "U-shaped saddle clamp for securing pipes, tubes, or round profiles to a surface.",
    route_type: "parametric",
    object_class: "structural",
    required_dimensions: [
      { name: "pipe_od",       unit: "mm", min: 3,   max: 200, description: "Outer diameter of the pipe or tube to clamp" },
      { name: "wall_thickness", unit: "mm", min: 1.2, max: 20,  description: "Clamp wall thickness" },
      { name: "flange_width",  unit: "mm", min: 5,   max: 100, description: "Width of the mounting flanges" },
      { name: "flange_length", unit: "mm", min: 5,   max: 100, description: "Length of the mounting flanges" },
    ],
    optional_dimensions: [],
    validation_rules: [
      { rule: "wall_thickness >= 1.2", description: "Wall thickness must be at least 1.2mm" },
    ],
    question_strategy: {
      primary_question: "What is the outer diameter of the pipe or tube you need to clamp?",
      dimension_order: ["pipe_od", "wall_thickness", "flange_width", "flange_length"],
      example_values: { pipe_od: 25, wall_thickness: 2.5, flange_width: 15, flange_length: 20 },
    },
    generator_version: "1.0.0",
    maturity_level: "proven",
    demo_eligible: false,
    reuse_eligible: true,
    degradation_policy: "reject",
    success_rate: 0.94,
    usage_count: 0,
  },

  // ── 5. hole_plate ─────────────────────────────────────────────────────────
  {
    family: "hole_plate",
    label: "Hole Plate / Pegboard Panel",
    description:
      "Flat plate with a regular pattern of holes for mounting, alignment, or tool organization.",
    route_type: "parametric",
    object_class: "structural",
    required_dimensions: [
      { name: "length",        unit: "mm",    min: 10, max: 500, description: "Overall length" },
      { name: "width",         unit: "mm",    min: 10, max: 500, description: "Overall width" },
      { name: "thickness",     unit: "mm",    min: 1.2, max: 50, description: "Plate thickness" },
      { name: "hole_count",    unit: "count", min: 1,  max: 100, description: "Total number of holes" },
      { name: "hole_diameter", unit: "mm",    min: 1,  max: 30,  description: "Diameter of each hole" },
    ],
    optional_dimensions: [],
    validation_rules: [
      { rule: "thickness >= 1.2", description: "Wall thickness must be at least 1.2mm" },
    ],
    question_strategy: {
      primary_question: "What size plate do you need and how many holes?",
      dimension_order: ["length", "width", "thickness", "hole_count", "hole_diameter"],
      example_values: { length: 100, width: 80, thickness: 3, hole_count: 9, hole_diameter: 5 },
    },
    generator_version: "1.0.0",
    maturity_level: "proven",
    demo_eligible: false,
    reuse_eligible: true,
    degradation_policy: "reject",
    success_rate: 0.96,
    usage_count: 0,
  },

  // ── 6. standoff_block ────────────────────────────────────────────────────────────────────────────────────────
  {
    family: "standoff_block",
    label: "Standoff Block / Riser",
    description:
      "Square-base block that creates a standoff distance between two surfaces, with a center through-hole.",
    route_type: "parametric",
    object_class: "structural",
    required_dimensions: [
      // IMPORTANT: CAD worker generator (standoff_block.py) uses base_width + height.
      // hole_diameter minimum is 1.5mm — no zero-hole solid block is supported.
      { name: "base_width",    unit: "mm", min: 5,   max: 500, description: "Square base side length" },
      { name: "height",        unit: "mm", min: 3,   max: 500, description: "Block height (standoff distance)" },
      { name: "hole_diameter", unit: "mm", min: 1.5, max: 50,  description: "Center through-hole diameter (min 1.5mm)" },
    ],
    optional_dimensions: [],
    validation_rules: [
      { rule: "hole_diameter < base_width - 2.0", description: "Hole must leave at least 1mm wall on each side" },
    ],
    question_strategy: {
      primary_question: "What standoff height, base width, and hole diameter do you need?",
      dimension_order: ["base_width", "height", "hole_diameter"],
      example_values: { base_width: 20, height: 15, hole_diameter: 3.2 },
    },
    generator_version: "1.0.0",
    maturity_level: "proven",
    demo_eligible: false,
    reuse_eligible: true,
    degradation_policy: "reject",
    success_rate: 0.97,
    usage_count: 0,
  },

  // ── 7. cable_clip ─────────────────────────────────────────────────────────
  {
    family: "cable_clip",
    label: "Cable Clip / Wire Organizer",
    description:
      "Snap-fit clip for routing and securing cables, wires, or tubing along a surface.",
    route_type: "parametric",
    object_class: "mechanical",
    required_dimensions: [
      { name: "cable_od",       unit: "mm", min: 1,   max: 50,  description: "Outer diameter of the cable or wire bundle" },
      { name: "wall_thickness", unit: "mm", min: 1.2, max: 10,  description: "Clip wall thickness" },
      { name: "base_width",     unit: "mm", min: 5,   max: 100, description: "Width of the mounting base" },
    ],
    optional_dimensions: [],
    validation_rules: [
      { rule: "wall_thickness >= 1.2", description: "Wall thickness must be at least 1.2mm" },
    ],
    question_strategy: {
      primary_question: "What is the outer diameter of the cable or wire bundle?",
      dimension_order: ["cable_od", "wall_thickness", "base_width"],
      example_values: { cable_od: 8, wall_thickness: 2, base_width: 15 },
    },
    generator_version: "1.0.0",
    maturity_level: "proven",
    demo_eligible: false,
    reuse_eligible: true,
    degradation_policy: "reject",
    success_rate: 0.95,
    usage_count: 0,
  },

  // ── 8. enclosure ──────────────────────────────────────────────────────────
  {
    family: "enclosure",
    label: "Enclosure / Electronics Box",
    description:
      "Rectangular box for housing electronics, components, or assemblies. Generates a lid-and-body assembly.",
    route_type: "parametric",
    object_class: "enclosure",
    required_dimensions: [
      { name: "inner_length",   unit: "mm", min: 10, max: 500, description: "Internal length of the enclosure" },
      { name: "inner_width",    unit: "mm", min: 10, max: 500, description: "Internal width of the enclosure" },
      { name: "inner_height",   unit: "mm", min: 10, max: 500, description: "Internal height of the enclosure" },
      { name: "wall_thickness", unit: "mm", min: 1.2, max: 20, description: "Wall thickness" },
    ],
    optional_dimensions: [],
    validation_rules: [
      { rule: "wall_thickness >= 1.2", description: "Wall thickness must be at least 1.2mm" },
    ],
    question_strategy: {
      primary_question: "What are the internal dimensions (L × W × H) of the enclosure?",
      dimension_order: ["inner_length", "inner_width", "inner_height", "wall_thickness"],
      example_values: { inner_length: 100, inner_width: 60, inner_height: 40, wall_thickness: 2 },
    },
    generator_version: "1.0.0",
    maturity_level: "proven",
    demo_eligible: false,
    reuse_eligible: true,
    degradation_policy: "reject",
    success_rate: 0.93,
    usage_count: 0,
  },

  // ── 9. adapter_bushing ────────────────────────────────────────────────────
  {
    family: "adapter_bushing",
    label: "Adapter Bushing / Bore Sleeve",
    description:
      "Bushing or sleeve for adapting between different bore sizes or shaft standards.",
    route_type: "parametric",
    object_class: "mechanical",
    required_dimensions: [
      { name: "outer_diameter", unit: "mm", min: 2,   max: 500, description: "Outer diameter of the bushing" },
      { name: "inner_diameter", unit: "mm", min: 1,   max: 499, description: "Inner bore diameter" },
      { name: "length",         unit: "mm", min: 2,   max: 500, description: "Length of the bushing" },
    ],
    optional_dimensions: [],
    validation_rules: [
      { rule: "inner_diameter < outer_diameter", description: "Inner bore must be smaller than outer diameter" },
      { rule: "outer_diameter - inner_diameter >= 1.2", description: "Wall thickness must be at least 1.2mm" },
    ],
    question_strategy: {
      primary_question: "What are the outer diameter, inner bore diameter, and length?",
      dimension_order: ["outer_diameter", "inner_diameter", "length"],
      example_values: { outer_diameter: 20, inner_diameter: 15, length: 25 },
    },
    generator_version: "1.0.0",
    maturity_level: "proven",
    demo_eligible: false,
    reuse_eligible: true,
    degradation_policy: "reject",
    success_rate: 0.96,
    usage_count: 0,
  },

  // ── 10. simple_jig ────────────────────────────────────────────────────────
  {
    family: "simple_jig",
    label: "Simple Jig / Alignment Fixture",
    description:
      "Alignment fixture or jig for repeatable positioning during assembly, drilling, or machining.",
    route_type: "parametric",
    object_class: "fixture",
    required_dimensions: [
      { name: "length", unit: "mm", min: 5, max: 500, description: "Overall length of the jig" },
      { name: "width",  unit: "mm", min: 5, max: 500, description: "Overall width of the jig" },
      { name: "thickness", unit: "mm", min: 3, max: 500, description: "Plate thickness of the jig" },
    ],
    optional_dimensions: [],
    validation_rules: [],
    question_strategy: {
      primary_question: "What are the overall dimensions (L × W) and thickness of the jig?",
      dimension_order: ["length", "width", "thickness"],
      example_values: { length: 60, width: 40, thickness: 15 },
    },
    generator_version: "1.0.0",
    maturity_level: "proven",
    demo_eligible: false,
    reuse_eligible: true,
    degradation_policy: "reject",
    success_rate: 0.94,
    usage_count: 0,
  },
  // ── 11. gear (experimental) ───────────────────────────────────────────────
  {
    family: "gear",
    label: "Spur Gear",
    description: "Spur gear for power transmission and motion control.",
    route_type: "parametric",
    object_class: "mechanical",
    required_dimensions: [
      { name: "module", unit: "mm", min: 0.5, max: 10, description: "Gear module (pitch diameter / teeth)" },
      { name: "teeth", unit: "count", min: 8, max: 200, description: "Number of teeth" },
      { name: "thickness", unit: "mm", min: 1, max: 100, description: "Gear thickness" },
    ],
    optional_dimensions: [
      { name: "bore_diameter", unit: "mm", min: 0, max: 100, description: "Center bore diameter (0 for solid)" },
    ],
    validation_rules: [
      { rule: "bore_diameter < (module * teeth) - 4", description: "Bore must be smaller than root diameter" },
    ],
    question_strategy: {
      primary_question: "What are the specifications for the gear?",
      dimension_order: ["module", "teeth", "thickness", "bore_diameter"],
      example_values: { module: 1, teeth: 20, thickness: 5, bore_diameter: 5 },
    },
    generator_version: "v1",
    maturity_level: "experimental",
    demo_eligible: false,
    reuse_eligible: false,
    degradation_policy: "concept_only",
    success_rate: 0.0,
    usage_count: 0,
  },
  // ── 12. propeller (experimental) ──────────────────────────────────────────
  {
    family: "propeller",
    label: "Propeller",
    description: "Propeller or impeller for fluid movement and propulsion.",
    route_type: "parametric",
    object_class: "mechanical",
    required_dimensions: [
      { name: "diameter", unit: "mm", min: 10, max: 500, description: "Overall diameter" },
      { name: "pitch", unit: "mm", min: 10, max: 500, description: "Pitch (distance per revolution)" },
      { name: "blades", unit: "count", min: 2, max: 12, description: "Number of blades" },
    ],
    optional_dimensions: [
      { name: "bore_diameter", unit: "mm", min: 0, max: 100, description: "Center bore diameter" },
    ],
    validation_rules: [
      { rule: "bore_diameter < diameter * 0.5", description: "Bore must be smaller than half the diameter" },
    ],
    question_strategy: {
      primary_question: "What are the specifications for the propeller?",
      dimension_order: ["diameter", "pitch", "blades", "bore_diameter"],
      example_values: { diameter: 100, pitch: 80, blades: 3, bore_diameter: 5 },
    },
    generator_version: "v1",
    maturity_level: "experimental",
    demo_eligible: false,
    reuse_eligible: false,
    degradation_policy: "concept_only",
    success_rate: 0.0,
    usage_count: 0,
  },

  // ── 13. solid_block (true solid cube/rectangular prism) ──────────────────────────────
  {
    family: "solid_block",
    label: "Solid Block / Cube",
    description:
      "True solid rectangular block or cube with no holes. Use for cubes, rectangular prisms, and solid blocks.",
    route_type: "parametric",
    object_class: "structural",
    required_dimensions: [
      { name: "length", unit: "mm", min: 1, max: 500, description: "Block length (X dimension)" },
      { name: "width",  unit: "mm", min: 1, max: 500, description: "Block width (Y dimension)" },
      { name: "height", unit: "mm", min: 1, max: 500, description: "Block height (Z dimension)" },
    ],
    optional_dimensions: [
      { name: "chamfer", unit: "mm", min: 0, max: 50, description: "Edge chamfer size (0 = no chamfer)" },
    ],
    validation_rules: [],
    question_strategy: {
      primary_question: "What are the length, width, and height of the block?",
      dimension_order: ["length", "width", "height"],
      example_values: { length: 20, width: 20, height: 20 },
    },
    generator_version: "1.0.0",
    maturity_level: "proven",
    demo_eligible: false,
    reuse_eligible: true,
    degradation_policy: "reject",
    success_rate: 0.99,
    usage_count: 0,
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Lookup helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Map from family name to capability entry — O(1) lookup */
export const CAPABILITY_MAP: Readonly<Record<string, CapabilityEntry>> =
  Object.fromEntries(CAPABILITY_REGISTRY.map((c) => [c.family, c]));

/**
 * Returns the capability entry for a given family name.
 * Returns undefined if the family is not in the registry.
 */
export function getCapability(family: string): CapabilityEntry | undefined {
  return CAPABILITY_MAP[family];
}

/**
 * Returns all capabilities at a given maturity level.
 */
export function getCapabilitiesByMaturity(
  level: MaturityLevel
): CapabilityEntry[] {
  return CAPABILITY_REGISTRY.filter((c) => c.maturity_level === level);
}

/**
 * Returns all capabilities eligible for demo presets.
 */
export function getDemoEligibleCapabilities(): CapabilityEntry[] {
  return CAPABILITY_REGISTRY.filter((c) => c.demo_eligible);
}

/**
 * Returns all capabilities eligible for Library reuse.
 */
export function getReuseEligibleCapabilities(): CapabilityEntry[] {
  return CAPABILITY_REGISTRY.filter((c) => c.reuse_eligible);
}

/**
 * Validates that all required dimensions are present and within bounds.
 * Returns null if valid, or an error message string if invalid.
 */
export function validateCapabilityDimensions(
  family: string,
  dimensions: Record<string, number>
): string | null {
  const capability = getCapability(family);
  if (!capability) {
    return `Unknown capability: "${family}". This part type is not supported.`;
  }
  for (const dim of capability.required_dimensions) {
    const val = dimensions[dim.name];
    if (val === undefined || val === null) {
      return `Missing required dimension: ${dim.name} (${dim.description})`;
    }
    if (typeof val !== "number" || isNaN(val)) {
      return `Invalid value for ${dim.name}: must be a number`;
    }
    if (val < dim.min) {
      return `${dim.name}=${val}${dim.unit} is below minimum (${dim.min}${dim.unit})`;
    }
    if (val > dim.max) {
      return `${dim.name}=${val}${dim.unit} exceeds maximum (${dim.max}${dim.unit})`;
    }
  }
  // Apply validation rules
  for (const rule of capability.validation_rules) {
    // Evaluate simple comparison rules
    try {
      // Replace dimension names with their values
      let expr = rule.rule;
      for (const [key, val] of Object.entries(dimensions)) {
        expr = expr.split(key).join(String(val));
      }
      // Only evaluate if all tokens are numbers/operators
      if (/^[\d\s\.\+\-\*\/\<\>\=\!]+$/.test(expr)) {
        // eslint-disable-next-line no-new-func
        const result = new Function(`return ${expr}`)();
        if (!result) {
          return rule.description;
        }
      }
    } catch {
      // Skip rules that can't be evaluated (e.g. complex expressions)
    }
  }
  return null;
}

/**
 * Determines the truth label for a given family and confidence score.
 * This is the core of the Truth Gate decision logic.
 */
export function determineTruthLabel(
  family: string | null | undefined,
  confidence: number,
  hasMissingDimensions: boolean
): TruthLabel {
  if (!family || !getCapability(family)) {
    return "unsupported";
  }
  const capability = getCapability(family)!;
  if (capability.maturity_level === "experimental") {
    return "concept_preview";
  }
  if (confidence < 0.5) {
    return "unsupported";
  }
  if (confidence < 0.65 || hasMissingDimensions) {
    return "clarify_required";
  }
  if (confidence < 0.85) {
    return "concept_preview";
  }
  return "supported";
}
