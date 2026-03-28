// ─── Design Tokens ────────────────────────────────────────────────────────────
export const COLORS = {
  // Background layers
  bg0: "#0A0A0F",   // deepest background
  bg1: "#12121A",   // card background
  bg2: "#1A1A26",   // elevated card
  bg3: "#22223A",   // subtle border

  // Accent
  accent: "#4F8EF7",      // primary blue
  accentDim: "#2A4A8A",   // muted blue
  accentGlow: "#6BA3FF",  // bright blue

  // Status
  success: "#22C55E",
  warning: "#F59E0B",
  error: "#EF4444",
  info: "#3B82F6",

  // Text
  textPrimary: "#F0F0F8",
  textSecondary: "#8888AA",
  textMuted: "#555570",
  textInverse: "#0A0A0F",

  // Borders
  border: "#2A2A40",
  borderActive: "#4F8EF7",

  // Mic button
  micIdle: "#1E1E30",
  micActive: "#EF4444",
  micListening: "#F59E0B",
} as const;

export const FONTS = {
  mono: "Courier New",
  sans: "System",
} as const;

export const SPACING = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;

// ─── API ──────────────────────────────────────────────────────────────────────
export const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_BASE_URL ||
  "https://ai4u-little-engineer-web.vercel.app";

// ─── Supported Part Families (mirrors packages/shared/src/part-families.ts) ──
export const MVP_PART_FAMILIES = [
  "spacer",
  "l_bracket",
  "u_bracket",
  "hole_plate",
  "cable_clip",
  "enclosure",
  "flat_bracket",
  "standoff_block",
  "adapter_bushing",
  "simple_jig",
] as const;

export type MvpPartFamily = (typeof MVP_PART_FAMILIES)[number];

export const PART_FAMILY_LABELS: Record<MvpPartFamily, string> = {
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

export const REQUIRED_DIMENSIONS: Record<MvpPartFamily, string[]> = {
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

// ─── Conversation ─────────────────────────────────────────────────────────────
export const ASSISTANT_NAME = "Engineer";

export const WELCOME_MESSAGE =
  "Hello! I'm your AI engineering assistant. Tell me what part you need — just speak naturally. For example: \"I need a spacer with a 20mm outer diameter, 10mm inner diameter, and 5mm height.\"";

export const SUPPORTED_UNITS = ["mm", "in"] as const;
export type Units = (typeof SUPPORTED_UNITS)[number];

// ─── App Version ─────────────────────────────────────────────────────────────
export const APP_VERSION = "1.0.0";

// ─── Plan Limits ─────────────────────────────────────────────────────────────
export const PLAN_LIMITS: Record<string, number | null> = {
  free: 3,
  maker: 25,
  pro: null, // unlimited
};
