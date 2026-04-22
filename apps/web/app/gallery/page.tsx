"use client";
/**
 * /gallery — Click-to-Make Gallery
 *
 * A curated grid of featured project cards. Each card is a real,
 * generatable design. Clicking "Make This" sends the user to /invent
 * with a locked complete spec payload — no NLU re-interpretation needed.
 *
 * Locked spec items (family + dimensions pre-resolved):
 *   - Pass ?spec=<base64(JSON)> to /invent
 *   - UniversalCreatorFlow reads this and skips the interpret step entirely
 *   - Goes straight to previewing state with the complete spec
 *
 * ALL items have locked specs. No concept-only items.
 * Every description accurately describes what the generator produces.
 *
 * Organized into 4 categories (4 items each = 16 total):
 *   - Precision Parts (Shop Lane)
 *   - Fun Prints (Fun Lane)
 *   - Showcase / Demos
 *   - Gift & Decor
 *
 * Locked spec parameter names are validated against capability-registry.ts:
 *   spacer:         outer_diameter, inner_diameter, length
 *   l_bracket:      leg_a, leg_b, thickness, width
 *   u_bracket:      pipe_od, wall_thickness, flange_width, flange_length
 *   hole_plate:     length, width, thickness, hole_count, hole_diameter
 *   cable_clip:     cable_od, wall_thickness, base_width
 *   enclosure:      inner_length, inner_width, inner_height, wall_thickness
 *   flat_bracket:   length, width, thickness
 *   standoff_block: base_width, height, hole_diameter
 *   adapter_bushing: outer_diameter, inner_diameter, length
 *   solid_block:    length, width, height
 *   simple_jig:     length, width, thickness
 */
import Link from "next/link";
import BrandSignatureBlock from "@/components/BrandSignatureBlock";
import AppFooter from "@/components/AppFooter";

// ── Locked spec type ──────────────────────────────────────────────────────────
interface LockedSpec {
  family: string;
  parameters: Record<string, number>;
  reasoning: string;
  confidence: number;
}

interface GalleryCard {
  id: string;
  emoji: string;
  name: string;
  description: string;
  /** Locked complete spec — bypasses LLM interpret entirely */
  lockedSpec: LockedSpec;
  category: "precision" | "fun" | "showcase" | "gift";
  tags: string[];
  difficulty: "easy" | "medium" | "advanced";
  printTime: string;
  trustTier?: "verified" | "trusted_commercial";
}

// ── Locked spec payloads (validated against capability registry) ──────────────
// All required dimensions supplied. Every description matches generator output.
// No concept-only items. No deceptive geometry claims.

const GALLERY_CARDS: GalleryCard[] = [
  // ── Precision Parts (4 items) ────────────────────────────────────────────────
  {
    id: "spacer-20mm",
    emoji: "⭕",
    name: "M5 Bolt Spacer",
    description: "Cylindrical spacer with 20mm OD and 5mm bore for M5 bolts. 15mm tall. Prints in one piece with no supports.",
    lockedSpec: {
      family: "spacer",
      parameters: { outer_diameter: 20, inner_diameter: 5, length: 15 },
      reasoning: "20mm OD spacer with 5mm bore, 15mm tall — locked gallery preset",
      confidence: 0.97,
    },
    category: "precision",
    tags: ["spacer", "M5", "mechanical"],
    difficulty: "easy",
    printTime: "12 min",
    trustTier: "trusted_commercial",
  },
  {
    id: "l-bracket-50mm",
    emoji: "📐",
    name: "Corner L-Bracket",
    description: "Right-angle bracket with 50mm and 40mm legs, 4mm thick, 30mm wide. Flat mounting surfaces on both legs.",
    lockedSpec: {
      family: "l_bracket",
      parameters: { leg_a: 50, leg_b: 40, thickness: 4, width: 30 },
      reasoning: "L-bracket 50×40mm legs, 4mm thick, 30mm wide — locked gallery preset",
      confidence: 0.97,
    },
    category: "precision",
    tags: ["bracket", "mount", "corner"],
    difficulty: "easy",
    printTime: "25 min",
    trustTier: "trusted_commercial",
  },
  {
    id: "shaft-bushing",
    emoji: "🔧",
    name: "Shaft Adapter Bushing",
    description: "Hollow cylindrical bushing with 16mm OD and 10mm bore. 20mm long. Reduces a 16mm hole to accept a 10mm shaft.",
    lockedSpec: {
      family: "adapter_bushing",
      parameters: { outer_diameter: 16, inner_diameter: 10, length: 20 },
      reasoning: "Adapter bushing 16mm OD, 10mm bore, 20mm long — locked gallery preset",
      confidence: 0.97,
    },
    category: "precision",
    tags: ["bushing", "shaft", "adapter"],
    difficulty: "easy",
    printTime: "10 min",
    trustTier: "trusted_commercial",
  },
  {
    id: "standoff-m3",
    emoji: "🗜️",
    name: "M3 PCB Standoff",
    description: "Square-base standoff block, 15mm wide, 20mm tall, 3.2mm through-hole for M3 screws. Lifts PCBs off surfaces.",
    lockedSpec: {
      family: "standoff_block",
      parameters: { base_width: 15, height: 20, hole_diameter: 3.2 },
      reasoning: "M3 standoff block 15mm base, 20mm tall, 3.2mm hole — locked gallery preset",
      confidence: 0.97,
    },
    category: "precision",
    tags: ["standoff", "PCB", "M3"],
    difficulty: "easy",
    printTime: "8 min",
    trustTier: "trusted_commercial",
  },

  // ── Fun Prints (4 items) ─────────────────────────────────────────────────────
  {
    id: "cable-clip-8mm",
    emoji: "📎",
    name: "Cable Management Clip",
    description: "Snap-fit clip that holds an 8mm cable against a surface. 2mm wall, 20mm screw-mount base. Prints without supports.",
    lockedSpec: {
      family: "cable_clip",
      parameters: { cable_od: 8, wall_thickness: 2, base_width: 20 },
      reasoning: "Cable clip for 8mm cable OD, 2mm wall, 20mm base — locked gallery preset",
      confidence: 0.97,
    },
    category: "fun",
    tags: ["cable", "clip", "wire management"],
    difficulty: "easy",
    printTime: "8 min",
    trustTier: "trusted_commercial",
  },
  {
    id: "pipe-saddle-22mm",
    emoji: "🔩",
    name: "Pipe Saddle Bracket",
    description: "U-shaped bracket that cradles a 22mm pipe. 3mm wall thickness, 40mm flanges for wall mounting. Ideal for plumbing runs.",
    lockedSpec: {
      family: "u_bracket",
      parameters: { pipe_od: 22, wall_thickness: 3, flange_width: 40, flange_length: 50 },
      reasoning: "U-bracket saddle for 22mm pipe, 3mm wall, 40mm flange — locked gallery preset",
      confidence: 0.97,
    },
    category: "fun",
    tags: ["pipe", "clamp", "plumbing"],
    difficulty: "easy",
    printTime: "20 min",
    trustTier: "verified",
  },
  {
    id: "planter-drainage",
    emoji: "🌱",
    name: "Planter Drainage Insert",
    description: "Flat plate with 9 drainage holes for 100mm round planters. 95×95mm, 8mm thick, 8mm holes. Keeps roots out of standing water.",
    lockedSpec: {
      family: "hole_plate",
      parameters: { length: 95, width: 95, thickness: 8, hole_count: 9, hole_diameter: 8 },
      reasoning: "Planter drainage insert — 95×95mm plate, 8mm thick, 9 drainage holes — locked gallery preset",
      confidence: 0.93,
    },
    category: "fun",
    tags: ["planter", "garden", "drainage"],
    difficulty: "easy",
    printTime: "20 min",
    trustTier: "verified",
  },
  {
    id: "display-block",
    emoji: "🧱",
    name: "Display Stand Block",
    description: "Solid rectangular block, 80×50×30mm. Use as a display riser, prop, or base for small objects. No holes, no hardware.",
    lockedSpec: {
      family: "solid_block",
      parameters: { length: 80, width: 50, height: 30 },
      reasoning: "Solid display block 80×50×30mm — locked gallery preset",
      confidence: 0.97,
    },
    category: "fun",
    tags: ["display", "block", "riser"],
    difficulty: "easy",
    printTime: "35 min",
    trustTier: "verified",
  },

  // ── Showcase & Demos (4 items) ───────────────────────────────────────────────
  {
    id: "electronics-enclosure",
    emoji: "📦",
    name: "Arduino Nano Enclosure",
    description: "Rectangular box with 60×40×30mm interior and 2mm walls. Fits an Arduino Nano with room for wiring.",
    lockedSpec: {
      family: "enclosure",
      parameters: { inner_length: 60, inner_width: 40, inner_height: 30, wall_thickness: 2 },
      reasoning: "Electronics enclosure 60×40×30mm interior, 2mm wall — locked gallery preset",
      confidence: 0.97,
    },
    category: "showcase",
    tags: ["enclosure", "electronics", "Arduino"],
    difficulty: "medium",
    printTime: "1h 20min",
    trustTier: "verified",
  },
  {
    id: "drill-jig",
    emoji: "🎯",
    name: "Drill Alignment Jig",
    description: "Flat alignment fixture, 80×60mm, 15mm thick. Use as a repeatable positioning guide for drilling or assembly operations.",
    lockedSpec: {
      family: "simple_jig",
      parameters: { length: 80, width: 60, thickness: 15 },
      reasoning: "Drill alignment jig 80×60mm, 15mm thick — locked gallery preset",
      confidence: 0.95,
    },
    category: "showcase",
    tags: ["jig", "drill", "alignment"],
    difficulty: "medium",
    printTime: "35 min",
    trustTier: "verified",
  },
  {
    id: "flat-bracket-mount",
    emoji: "🪛",
    name: "Flat Mounting Bracket",
    description: "Flat rectangular bracket, 120×30mm, 4mm thick. Attach to walls or panels with screws.",
    lockedSpec: {
      family: "flat_bracket",
      parameters: { length: 120, width: 30, thickness: 4 },
      reasoning: "Flat mounting bracket 120×30×4mm — locked gallery preset",
      confidence: 0.97,
    },
    category: "showcase",
    tags: ["bracket", "mount", "flat"],
    difficulty: "easy",
    printTime: "18 min",
    trustTier: "trusted_commercial",
  },
  {
    id: "raspberry-pi-enclosure",
    emoji: "🖥️",
    name: "Raspberry Pi Enclosure",
    description: "Rectangular box with 100×65×30mm interior and 2mm walls. Sized to fit a Raspberry Pi 4 board.",
    lockedSpec: {
      family: "enclosure",
      parameters: { inner_length: 100, inner_width: 65, inner_height: 30, wall_thickness: 2 },
      reasoning: "Raspberry Pi enclosure 100×65×30mm interior, 2mm wall — locked gallery preset",
      confidence: 0.97,
    },
    category: "showcase",
    tags: ["enclosure", "Raspberry Pi", "electronics"],
    difficulty: "medium",
    printTime: "2h 10min",
    trustTier: "verified",
  },

  // ── Gift & Decor (4 items) ───────────────────────────────────────────────────
  {
    id: "keychain-tag",
    emoji: "🔑",
    name: "Keychain Tag",
    description: "Flat 40×40mm plate, 3mm thick, with a 4mm keyring hole. Attach to keys or bags. No engraving — plain flat surface.",
    lockedSpec: {
      family: "hole_plate",
      parameters: { length: 40, width: 40, thickness: 3, hole_count: 1, hole_diameter: 4 },
      reasoning: "Keychain tag — 40×40mm plate, 3mm thick, 1 keyring hole — locked gallery preset",
      confidence: 0.95,
    },
    category: "gift",
    tags: ["keychain", "gift", "tag"],
    difficulty: "easy",
    printTime: "15 min",
    trustTier: "verified",
  },
  {
    id: "desk-nameplate",
    emoji: "🪧",
    name: "Desk Nameplate Base",
    description: "Flat plate, 150×40mm, 5mm thick. Use as a desk nameplate holder or label base. Plain flat surface — no raised letters.",
    lockedSpec: {
      family: "flat_bracket",
      parameters: { length: 150, width: 40, thickness: 5 },
      reasoning: "Desk nameplate base — 150×40mm flat plate, 5mm thick — locked gallery preset",
      confidence: 0.95,
    },
    category: "gift",
    tags: ["nameplate", "desk", "sign"],
    difficulty: "easy",
    printTime: "30 min",
    trustTier: "verified",
  },
  {
    id: "gift-box-small",
    emoji: "🎁",
    name: "Small Gift Box",
    description: "Rectangular box with 80×60×40mm interior and 2mm walls. A simple printable container for small gifts or trinkets.",
    lockedSpec: {
      family: "enclosure",
      parameters: { inner_length: 80, inner_width: 60, inner_height: 40, wall_thickness: 2 },
      reasoning: "Small gift box 80×60×40mm interior, 2mm wall — locked gallery preset",
      confidence: 0.97,
    },
    category: "gift",
    tags: ["box", "gift", "container"],
    difficulty: "easy",
    printTime: "1h 45min",
    trustTier: "verified",
  },
  {
    id: "mounting-plate",
    emoji: "🔲",
    name: "Wall Mounting Plate",
    description: "Flat plate, 100×80mm, 4mm thick, with 4 corner mounting holes (5mm each). Attach sensors, switches, or panels to walls.",
    lockedSpec: {
      family: "hole_plate",
      parameters: { length: 100, width: 80, thickness: 4, hole_count: 4, hole_diameter: 5 },
      reasoning: "Wall mounting plate 100×80mm, 4mm thick, 4 corner holes — locked gallery preset",
      confidence: 0.97,
    },
    category: "gift",
    tags: ["mount", "plate", "wall"],
    difficulty: "easy",
    printTime: "22 min",
    trustTier: "trusted_commercial",
  },
];

const CATEGORY_META = {
  precision: {
    label: "Precision Parts",
    icon: "🏭",
    color: "text-brand-400",
    borderColor: "border-brand-700/50",
    bgColor: "bg-brand-900/20",
    desc: "Exact-fit mechanical parts, mounts, and fixtures",
  },
  fun: {
    label: "Fun Prints",
    icon: "🎨",
    color: "text-purple-400",
    borderColor: "border-purple-700/50",
    bgColor: "bg-purple-900/20",
    desc: "Clips, clamps, planters, and everyday useful prints",
  },
  showcase: {
    label: "Showcase & Demos",
    icon: "✨",
    color: "text-yellow-400",
    borderColor: "border-yellow-700/50",
    bgColor: "bg-yellow-900/10",
    desc: "Featured designs demonstrating platform accuracy",
  },
  gift: {
    label: "Gift & Decor",
    icon: "🎁",
    color: "text-pink-400",
    borderColor: "border-pink-700/50",
    bgColor: "bg-pink-900/10",
    desc: "Tags, boxes, plates, and home accessories",
  },
};

const DIFFICULTY_COLORS = {
  easy: "text-green-400 bg-green-900/30",
  medium: "text-yellow-400 bg-yellow-900/30",
  advanced: "text-red-400 bg-red-900/30",
};

const TRUST_TIER_LABELS: Record<string, string> = {
  trusted_commercial: "✓ Trusted",
  verified: "✓ Verified",
};

/** Build the href for a gallery card's "Make This" button */
function buildMakeHref(card: GalleryCard): string {
  const encoded = btoa(unescape(encodeURIComponent(JSON.stringify(card.lockedSpec))));
  return `/invent?spec=${encodeURIComponent(encoded)}`;
}

function GalleryCard({ card }: { card: GalleryCard }) {
  const cat = CATEGORY_META[card.category];
  const makeHref = buildMakeHref(card);
  return (
    <div
      className={`rounded-2xl border ${cat.borderColor} bg-steel-800/60 hover:bg-steel-800/90 transition-all group overflow-hidden flex flex-col`}
    >
      {/* Card header */}
      <div className={`px-4 pt-4 pb-3 ${cat.bgColor}`}>
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="text-2xl">{card.emoji}</span>
            <div>
              <h3 className="font-bold text-steel-100 text-sm leading-tight">{card.name}</h3>
              <div className={`text-xs font-semibold ${cat.color} mt-0.5`}>
                {cat.icon} {cat.label}
              </div>
            </div>
          </div>
          <div className="flex flex-col items-end gap-1">
            {card.trustTier && (
              <span className="text-xs text-brand-300 bg-brand-900/60 border border-brand-700/50 rounded-full px-2 py-0.5 flex-shrink-0">
                {TRUST_TIER_LABELS[card.trustTier]}
              </span>
            )}
            <span className="text-xs text-green-300 bg-green-900/40 border border-green-700/50 rounded-full px-2 py-0.5 flex-shrink-0">
              ✓ Ready to print
            </span>
          </div>
        </div>
      </div>

      {/* Card body */}
      <div className="px-4 py-3 flex-1">
        <p className="text-steel-400 text-xs leading-relaxed mb-3">{card.description}</p>
        <div className="flex flex-wrap gap-1 mb-3">
          {card.tags.map((tag) => (
            <span
              key={tag}
              className="text-xs text-steel-500 bg-steel-700/50 rounded-full px-2 py-0.5"
            >
              {tag}
            </span>
          ))}
        </div>
        <div className="flex items-center gap-3 text-xs">
          <span className={`rounded-full px-2 py-0.5 font-medium ${DIFFICULTY_COLORS[card.difficulty]}`}>
            {card.difficulty}
          </span>
          <span className="text-steel-500">⏱ {card.printTime}</span>
        </div>
      </div>

      {/* CTA */}
      <div className="px-4 pb-4">
        <Link
          href={makeHref}
          className="w-full flex items-center justify-center gap-2 py-2 rounded-xl bg-brand-700 hover:bg-brand-600 text-white font-semibold text-xs transition-all group-hover:shadow-lg group-hover:shadow-brand-900/50"
        >
          <span>✨</span>
          <span>Make This</span>
        </Link>
      </div>
    </div>
  );
}

export default function GalleryPage() {
  const categories = ["precision", "fun", "showcase", "gift"] as const;

  return (
    <main className="min-h-screen bg-steel-900 text-steel-100">
      {/* Nav */}
      <nav className="sticky top-0 z-50 bg-steel-900/90 backdrop-blur border-b border-steel-800 px-4 sm:px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Link href="/" className="flex items-center gap-2">
            <div className="w-7 h-7 bg-brand-600 rounded flex items-center justify-center">
              <span className="text-white font-bold text-xs">AI</span>
            </div>
            <span className="font-semibold text-steel-100 text-sm">AI4U Little Engineer</span>
          </Link>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/sign-in" className="text-steel-400 hover:text-steel-200 text-sm transition-colors">
            Sign In
          </Link>
          <Link href="/sign-up" className="btn-primary text-sm py-1.5 px-4">
            Get Started Free
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <section className="max-w-5xl mx-auto px-6 pt-12 pb-6 text-center">
        <div className="inline-flex items-center gap-2 bg-brand-900/50 border border-brand-800 rounded-full px-4 py-1.5 mb-6">
          <span className="text-brand-400 text-xs font-bold uppercase tracking-wider">
            Click-to-Make Gallery
          </span>
        </div>
        <h1 className="text-4xl sm:text-5xl font-bold text-steel-100 mb-4">
          See it. Click it.{" "}
          <span className="text-brand-400">Print it.</span>
        </h1>
        <p className="text-steel-400 text-lg max-w-2xl mx-auto mb-4">
          {GALLERY_CARDS.length} designs ready to generate — complete specs, no clarification needed.
          Every item generates exactly what the description says.
        </p>
        <div className="flex items-center justify-center gap-4 text-xs text-steel-500 mb-8">
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-green-500" />
            All items — locked spec, ready to print
          </span>
        </div>

        {/* Category quick-nav */}
        <div className="flex flex-wrap justify-center gap-2 mb-4">
          {categories.map((cat) => {
            const meta = CATEGORY_META[cat];
            const count = GALLERY_CARDS.filter((c) => c.category === cat).length;
            return (
              <a
                key={cat}
                href={`#${cat}`}
                className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full border ${meta.borderColor} ${meta.bgColor} ${meta.color} hover:opacity-80 transition-opacity`}
              >
                <span>{meta.icon}</span>
                <span>{meta.label}</span>
                <span className="text-steel-500 font-normal">({count})</span>
              </a>
            );
          })}
        </div>
      </section>

      {/* Gallery by category */}
      {categories.map((cat) => {
        const meta = CATEGORY_META[cat];
        const cards = GALLERY_CARDS.filter((c) => c.category === cat);
        return (
          <section
            key={cat}
            id={cat}
            className="max-w-5xl mx-auto px-6 py-10"
          >
            {/* Section header */}
            <div className="flex items-center gap-3 mb-6">
              <div className={`w-10 h-10 rounded-xl border ${meta.borderColor} ${meta.bgColor} flex items-center justify-center text-xl`}>
                {meta.icon}
              </div>
              <div>
                <h2 className={`text-xl font-bold ${meta.color}`}>{meta.label}</h2>
                <p className="text-steel-500 text-sm">{meta.desc}</p>
              </div>
              <div className="ml-auto">
                <span className="text-xs text-steel-600">{cards.length} designs</span>
              </div>
            </div>

            {/* Cards grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {cards.map((card) => (
                <GalleryCard key={card.id} card={card} />
              ))}
            </div>
          </section>
        );
      })}

      {/* Footer */}
      <div className="max-w-5xl mx-auto px-6 py-10">
        <BrandSignatureBlock showTagline />
      </div>
      <AppFooter />
    </main>
  );
}
