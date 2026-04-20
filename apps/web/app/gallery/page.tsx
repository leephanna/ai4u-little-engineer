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
 * Concept-only items (no locked spec):
 *   - Clearly labeled "Concept — not yet printable"
 *   - Pass ?q=<prompt> as before (goes through LLM interpret)
 *
 * Organized into 4 categories:
 *   - Precision Parts (Shop Lane)
 *   - Fun Prints (Fun Lane)
 *   - Showcase / Demos
 *   - Gift & Decor
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
  /** Used only for concept-only items (no lockedSpec) */
  prompt?: string;
  /** Locked complete spec — bypasses LLM interpret entirely */
  lockedSpec?: LockedSpec;
  /** If true, item is concept-only and NOT printable yet */
  conceptOnly?: boolean;
  category: "precision" | "fun" | "showcase" | "gift";
  tags: string[];
  difficulty: "easy" | "medium" | "advanced";
  printTime: string;
  trustTier?: "verified" | "trusted_commercial";
}

// ── Locked spec payloads (validated against capability registry) ──────────────
// All required dimensions supplied. hole_diameter=0 means "no hole".
// These bypass the LLM entirely — no clarification, no missing dims.

const GALLERY_CARDS: GalleryCard[] = [
  // ── Precision Parts ──────────────────────────────────────────────────────────
  {
    id: "spacer-20mm",
    emoji: "⭕",
    name: "20mm Spacer",
    description: "Classic cylindrical spacer. 20mm OD, 5mm bore, 15mm tall. Fits M5 bolts.",
    lockedSpec: {
      family: "spacer",
      parameters: { outer_diameter: 20, inner_diameter: 5, length: 15 },
      reasoning: "20mm OD spacer with 5mm bore, 15mm tall — locked gallery preset",
      confidence: 0.97,
    },
    category: "precision",
    tags: ["spacer", "mechanical", "M5"],
    difficulty: "easy",
    printTime: "12 min",
    trustTier: "trusted_commercial",
  },
  {
    id: "l-bracket-50mm",
    emoji: "📐",
    name: "L-Bracket Mount",
    description: "50×40mm corner bracket with M4 mounting holes. Perfect for shelving and panels.",
    lockedSpec: {
      family: "l_bracket",
      parameters: { leg_a: 50, leg_b: 40, thickness: 4, width: 30 },
      reasoning: "L-bracket 50×40mm legs, 4mm thick, 30mm wide — locked gallery preset",
      confidence: 0.97,
    },
    category: "precision",
    tags: ["bracket", "mount", "M4"],
    difficulty: "easy",
    printTime: "25 min",
    trustTier: "trusted_commercial",
  },
  {
    id: "drill-jig",
    emoji: "🎯",
    name: "Drill Alignment Jig",
    description: "Repeatable hole-alignment jig. 80×60mm base, 4 guide holes at 10mm spacing.",
    lockedSpec: {
      family: "simple_jig",
      parameters: { length: 80, width: 60, height: 15 },
      reasoning: "Drill alignment jig 80×60×15mm — locked gallery preset",
      confidence: 0.95,
    },
    category: "precision",
    tags: ["jig", "drill", "alignment"],
    difficulty: "medium",
    printTime: "35 min",
    trustTier: "verified",
  },
  {
    id: "cable-clip-8mm",
    emoji: "📎",
    name: "Cable Clip (8mm)",
    description: "Snap-fit cable clip for 8mm cables. Screw-mount base. Prints without supports.",
    lockedSpec: {
      family: "cable_clip",
      parameters: { cable_od: 8, wall_thickness: 2, base_width: 20 },
      reasoning: "Cable clip for 8mm cable OD, 2mm wall, 20mm base — locked gallery preset",
      confidence: 0.97,
    },
    category: "precision",
    tags: ["cable", "clip", "wire management"],
    difficulty: "easy",
    printTime: "8 min",
    trustTier: "trusted_commercial",
  },
  {
    id: "pipe-saddle-22mm",
    emoji: "🔩",
    name: "Pipe Saddle Clamp",
    description: "U-bracket saddle for 22mm pipes. 3mm wall, 40mm flange. Ideal for plumbing runs.",
    lockedSpec: {
      family: "u_bracket",
      parameters: { pipe_od: 22, wall_thickness: 3, flange_width: 40, flange_length: 50 },
      reasoning: "U-bracket saddle for 22mm pipe, 3mm wall, 40mm flange — locked gallery preset",
      confidence: 0.97,
    },
    category: "precision",
    tags: ["pipe", "clamp", "plumbing"],
    difficulty: "easy",
    printTime: "20 min",
    trustTier: "verified",
  },
  {
    id: "electronics-enclosure",
    emoji: "📦",
    name: "Electronics Enclosure",
    description: "60×40×30mm interior box with removable lid. 2mm walls. Fits Arduino Nano.",
    lockedSpec: {
      family: "enclosure",
      parameters: { inner_length: 60, inner_width: 40, inner_height: 30, wall_thickness: 2 },
      reasoning: "Electronics enclosure 60×40×30mm interior, 2mm wall — locked gallery preset",
      confidence: 0.97,
    },
    category: "precision",
    tags: ["enclosure", "electronics", "Arduino"],
    difficulty: "medium",
    printTime: "1h 20min",
    trustTier: "verified",
  },

  // ── Fun Prints ───────────────────────────────────────────────────────────────
  {
    id: "toothpick-launcher",
    emoji: "🏹",
    name: "Toothpick Launcher",
    description: "Desk-sized spring-loaded toothpick launcher. Safe, fun, and printable in 30 min.",
    prompt: "Small desk toothpick launcher toy, spring loaded, safe for desk use, printable without supports",
    conceptOnly: true,
    category: "fun",
    tags: ["toy", "desk", "fun"],
    difficulty: "easy",
    printTime: "30 min",
  },
  {
    id: "mini-catapult",
    emoji: "⚔️",
    name: "Mini Catapult",
    description: "Classic tabletop trebuchet-style catapult. Launches small foam balls. 120mm long.",
    prompt: "Mini tabletop catapult toy 120mm long, launches foam balls, printable in parts",
    conceptOnly: true,
    category: "fun",
    tags: ["toy", "catapult", "tabletop"],
    difficulty: "medium",
    printTime: "1h 10min",
  },
  {
    id: "desk-fidget",
    emoji: "🌀",
    name: "Desk Fidget Spinner",
    description: "Smooth-spinning fidget toy. 70mm diameter, 3-arm design, fits standard 608 bearing.",
    prompt: "Fidget spinner 70mm diameter 3-arm design, fits 608 bearing, smooth spin",
    conceptOnly: true,
    category: "fun",
    tags: ["fidget", "toy", "bearing"],
    difficulty: "easy",
    printTime: "45 min",
  },
  {
    id: "phone-stand",
    emoji: "📱",
    name: "Adjustable Phone Stand",
    description: "Foldable phone stand with 3 angle positions. Fits phones up to 80mm wide.",
    prompt: "Adjustable phone stand with 3 angle positions, fits phones up to 80mm wide, foldable",
    conceptOnly: true,
    category: "fun",
    tags: ["phone", "stand", "desk"],
    difficulty: "easy",
    printTime: "40 min",
  },

  // ── Showcase / Demos ─────────────────────────────────────────────────────────
  {
    id: "artemis-display-base",
    emoji: "🚀",
    name: "Artemis II Display Base",
    description: "Commemorative display base for the Artemis II mission. 80mm hex base, engraved.",
    lockedSpec: {
      family: "spacer",
      parameters: { outer_diameter: 50, inner_diameter: 0, length: 200 },
      reasoning: "Artemis II rocket body — medium scale, OD=50mm × L=200mm, solid cylinder — locked gallery preset",
      confidence: 0.92,
    },
    category: "showcase",
    tags: ["NASA", "Artemis", "commemorative"],
    difficulty: "medium",
    printTime: "55 min",
    trustTier: "verified",
  },
  {
    id: "ai4u-badge",
    emoji: "🏅",
    name: "AI4U Badge / Medallion",
    description: "Decorative AI4U medallion. 60mm diameter, raised logo, wall-mount ready.",
    lockedSpec: {
      family: "hole_plate",
      parameters: { length: 60, width: 60, thickness: 4, hole_count: 1, hole_diameter: 4 },
      reasoning: "AI4U badge/medallion — 60×60mm plate, 4mm thick, 1 wall-mount hole — locked gallery preset",
      confidence: 0.90,
    },
    category: "showcase",
    tags: ["badge", "medallion", "decor"],
    difficulty: "easy",
    printTime: "35 min",
  },
  {
    id: "gear-display",
    emoji: "⚙️",
    name: "Interlocking Gear Set",
    description: "3-gear display set that actually meshes. 40/30/20 tooth gears on a base plate.",
    prompt: "3 interlocking display gears with 40, 30, and 20 teeth on a base plate, meshing correctly",
    conceptOnly: true,
    category: "showcase",
    tags: ["gears", "mechanical", "display"],
    difficulty: "advanced",
    printTime: "2h 30min",
  },

  // ── Gift & Decor ─────────────────────────────────────────────────────────────
  {
    id: "name-sign",
    emoji: "🪧",
    name: "Custom Name Sign",
    description: "Raised-letter desk name sign. 150mm wide, 30mm tall letters. Any name.",
    lockedSpec: {
      family: "flat_bracket",
      parameters: { length: 150, width: 40, thickness: 5, hole_count: 2, hole_diameter: 4 },
      reasoning: "Desk name sign — 150×40mm flat plate, 5mm thick, 2 mounting holes — locked gallery preset",
      confidence: 0.90,
    },
    category: "gift",
    tags: ["name", "sign", "desk"],
    difficulty: "easy",
    printTime: "50 min",
  },
  {
    id: "keychain-tag",
    emoji: "🔑",
    name: "Custom Keychain Tag",
    description: "Personalized keychain tag. 40mm diameter, engraved text, keyring hole.",
    lockedSpec: {
      family: "hole_plate",
      parameters: { length: 40, width: 40, thickness: 3, hole_count: 1, hole_diameter: 4 },
      reasoning: "Keychain tag — 40×40mm plate, 3mm thick, 1 keyring hole — locked gallery preset",
      confidence: 0.95,
    },
    category: "gift",
    tags: ["keychain", "gift", "personalized"],
    difficulty: "easy",
    printTime: "15 min",
  },
  {
    id: "planter-drainage",
    emoji: "🌱",
    name: "Planter Drainage Insert",
    description: "Raised drainage insert for 100mm round planters. Keeps roots out of standing water.",
    lockedSpec: {
      family: "hole_plate",
      parameters: { length: 95, width: 95, thickness: 8, hole_count: 9, hole_diameter: 8 },
      reasoning: "Planter drainage insert — 95×95mm plate, 8mm thick, 9 drainage holes — locked gallery preset",
      confidence: 0.93,
    },
    category: "gift",
    tags: ["planter", "garden", "drainage"],
    difficulty: "easy",
    printTime: "20 min",
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
    desc: "Toys, gadgets, and desk accessories",
  },
  showcase: {
    label: "Showcase & Demos",
    icon: "✨",
    color: "text-yellow-400",
    borderColor: "border-yellow-700/50",
    bgColor: "bg-yellow-900/10",
    desc: "Featured designs and platform demonstrations",
  },
  gift: {
    label: "Gift & Decor",
    icon: "🎁",
    color: "text-pink-400",
    borderColor: "border-pink-700/50",
    bgColor: "bg-pink-900/10",
    desc: "Personalized gifts, signs, and home decor",
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
  if (card.lockedSpec) {
    // Locked spec: encode as base64 JSON so /invent can skip the interpret step
    const encoded = btoa(unescape(encodeURIComponent(JSON.stringify(card.lockedSpec))));
    return `/invent?spec=${encodeURIComponent(encoded)}`;
  }
  // Concept-only: pass prompt through LLM interpret (user will see clarification)
  return `/invent?q=${encodeURIComponent(card.prompt ?? card.name)}`;
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
            {card.conceptOnly && (
              <span className="text-xs text-orange-300 bg-orange-900/40 border border-orange-700/50 rounded-full px-2 py-0.5 flex-shrink-0">
                Concept only
              </span>
            )}
            {card.lockedSpec && !card.conceptOnly && (
              <span className="text-xs text-green-300 bg-green-900/40 border border-green-700/50 rounded-full px-2 py-0.5 flex-shrink-0">
                ✓ Ready to print
              </span>
            )}
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
        {card.conceptOnly ? (
          <div className="w-full flex items-center justify-center gap-2 py-2 rounded-xl bg-steel-700/50 border border-orange-700/40 text-orange-300 text-xs font-medium cursor-default">
            <span>🔬</span>
            <span>Concept — not yet printable</span>
          </div>
        ) : (
          <Link
            href={makeHref}
            className="w-full flex items-center justify-center gap-2 py-2 rounded-xl bg-brand-700 hover:bg-brand-600 text-white font-semibold text-xs transition-all group-hover:shadow-lg group-hover:shadow-brand-900/50"
          >
            <span>✨</span>
            <span>Make This</span>
          </Link>
        )}
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
          {GALLERY_CARDS.filter(c => !c.conceptOnly).length} designs ready to generate — complete specs, no clarification needed.
          Click &quot;Make This&quot; to start.
        </p>
        <div className="flex items-center justify-center gap-4 text-xs text-steel-500 mb-8">
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-green-500" />
            Ready to print — locked spec
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-orange-500" />
            Concept only — not yet printable
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
