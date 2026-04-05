# AI4U Little Engineer V2: Architecture Specification

## Section 1 — Product Doctrine

### Core Promise
AI4U Little Engineer is a universal print orchestrator. A user should be able to speak, type, upload a photo, document, or prior print file, and the system will do everything necessary to turn that intent into the best available printable result. It is not a primitive CAD toy, nor a fake "prompt to anything" shell. It is a truth-first, capability-aware platform that accumulates reusable infrastructure with every successful job.

### Truth Rules
The system operates under strict truth rules to ensure reliability and user trust. The system must never silently degrade unsupported concepts into primitive geometry while preserving aspirational labels. If a user asks for a "detailed dragon," the system must not return a rectangular block labeled "dragon." The system must tell the truth about its capabilities at every stage. If a request is unsupported, it must explicitly state so and offer a valid alternative or clarification path. Every generated artifact must pass a rigorous validation gate before being presented to the user. Artifact persistence is mandatory. Every successful job must produce real, storage-backed outputs.

### User Experience Principles
Users can interact via voice, text, or file uploads seamlessly. The system should only ask for clarification when absolutely necessary, leveraging prior context and derived logic to fill gaps. Users must always see a visible preview of the generated artifact before committing to a print.

### The "Must-Have App" Definition
To be the "must-have app for 3D printer owners," the platform must transcend novelty. It must solve real problems reliably, learn from past successes, and provide a frictionless path from intent to physical object. It must be the default tool users reach for, whether they need a simple bracket or a complex, adapted part.

### Demos and Custom Jobs Share One Core
Demos are not separate, hardcoded illusions. They are simply pre-configured requests routed through the exact same orchestration core as custom jobs. This ensures that improvements to the core engine immediately benefit all entry points, and prevents the divergence of "demo logic" from "real logic."

### Reuse Before Reinvention
Reinvention is expensive and error-prone. The system must prioritize adapting proven, existing library items over generating new geometry from scratch. Every successful job becomes a precedent, enriching the library and improving future routing.

---

## Section 2 — System Architecture

The V2 architecture is a pipeline of specialized layers, ensuring a clear request lifecycle from intake to saved library item.

| Subsystem | Purpose | Inputs | Outputs | Failure Modes | Why it exists |
|---|---|---|---|---|---|
| **Universal Intake Layer** | Ingest and normalize multimodal inputs (text, voice, images, documents, SVGs). | Raw user input across any supported modality. | A normalized, unified request payload. | Unrecognized file types, garbled audio. | To provide a single, clean interface for the rest of the system, regardless of how the user communicated their intent. |
| **Intent Interpreter** | Analyze the unified request to determine the user's core goal and extract relevant parameters. | Unified request payload. | Structured interpretation (mode, extracted dimensions, inferred object type). | Ambiguous intent, contradictory constraints. | To translate human language and unstructured data into machine-actionable specifications. |
| **Capability Router** | Match the interpreted intent against the Capability Registry to determine the best execution path. | Structured interpretation. | Selected capability route (e.g., specific CAD generator, image-to-relief pipeline) or a "needs clarification" signal. | No matching capability, insufficient parameters for the best match. | To enforce the "Truth Rules" by ensuring the system only attempts what it can actually do. |
| **Clarification Planner** | Handle cases where the Capability Router needs more information. | Missing parameters, ambiguous intent signals. | Targeted follow-up questions or structured fallback forms. | Infinite clarification loops (mitigated by fail counters and fallback forms). | To guide the user toward a valid specification without frustrating them. |
| **Execution Planner** | Formulate a concrete plan for generating the artifact based on the selected capability and parameters. | Fully resolved specification and selected capability. | A step-by-step execution plan (e.g., CAD engine commands, API calls). | Invalid parameter combinations that pass initial checks but fail geometric constraints. | To bridge the gap between abstract specification and concrete generation commands. |
| **Generation / Adaptation Layer** | Execute the plan to create the physical artifact (STL, STEP, etc.). | Execution plan. | Raw generated artifacts. | CAD engine crashes, timeout errors, non-manifold geometry generation. | This is the core engine that produces the actual 3D models. |
| **Validation Layer** | Rigorously test the generated artifacts against printability and safety rules. | Raw generated artifacts. | Validation report (pass/fail, warnings, printability score). | False positives (approving unprintable models), false negatives (rejecting valid models). | To guarantee that only physically realizable and safe models reach the user. |
| **Artifact + Library Layer** | Persist successful artifacts and metadata for future reuse. | Validated artifacts, job metadata. | Stored library items, accessible via search/retrieval. | Storage failures, metadata corruption. | To build the reusable infrastructure that makes the platform increasingly powerful over time. |
| **Learning Loop** | Analyze job outcomes (successes, failures, user feedback) to improve future routing and generation. | Print results, user ratings, validation reports. | Updates to capability confidence scores, new adaptation precedents. | Overfitting to specific user quirks, slow learning rates. | To ensure the system continually improves and adapts to real-world usage. |

---

## Section 3 — Daedalus Gate Protocol

The Daedalus Gate Protocol is a strict, sequential verification system. It is not a cosmetic receipt; it is the enforcement mechanism for the Product Doctrine. The system must never silently degrade unsupported requests into primitive geometry while preserving aspirational labels.

| Gate | Verifies | Blocks | Result States | Prevention |
|---|---|---|---|---|
| **1. Capability Gate** | Does the requested object map to a known, supported capability in the registry? | Requests for unsupported objects (e.g., "generate a working bicycle"). | GO (capability found), REJECT (unsupported). | Prevents silent degradation by explicitly rejecting unsupported requests early. |
| **2. Contract Gate** | Are all required parameters for the selected capability present and within valid ranges? | Incomplete or physically impossible specifications (e.g., negative dimensions). | GO (contract satisfied), CLARIFY (missing info). | Ensures the generation layer only receives valid inputs. |
| **3. Schema Gate** | Does the execution plan conform to the expected schema for the target generator? | Malformed JSON or incorrect API payloads. | GO (schema valid), REJECT (schema invalid). | Catches LLM hallucination errors before they hit the CAD engine. |
| **4. Planning Gate** | Is the proposed geometric approach sound? (e.g., avoiding impossible overhangs if possible). | Inherently flawed design strategies. | GO (plan approved), WARN (suboptimal plan, proceed with caution). | Reduces the likelihood of generating unprintable models. |
| **5. Execution Gate** | Did the generation layer complete successfully without crashing? | Failed CAD runs, timeouts. | GO (artifacts produced), REJECT (generation failed). | Ensures only complete runs proceed to validation. |
| **6. Validation Gate** | Is the generated artifact manifold, properly scaled, and printable? | Non-manifold geometry, models exceeding printer volume. | GO (validated), REJECT (failed validation). | The final technical backstop before user presentation. |
| **7. Truth Gate** | Does the generated artifact actually match the user's original intent? | "Bait and switch" results (e.g., generating a block when a complex shape was requested). | GO (intent matched), REJECT (intent mismatch). | Enforces the core doctrine of capability honesty. |
| **8. Receipt Gate** | Has the entire process been securely logged and persisted? | Unrecorded jobs. | GO (receipt stored), REJECT (storage failed). | Ensures auditability and enables the Learning Loop. |

---

## Section 4 — Harmonia Role

Harmonia is the advanced orchestration layer, invoked when standard, deterministic routing is insufficient. It operates invisibly to the end user, managing complex, ambiguous, or multi-step requests through a specialized agent swarm.

### Invocation
Harmonia is invoked when the Intent Interpreter flags a request as highly ambiguous or complex, when a job fails the Planning or Validation gates and requires intelligent recovery, or when the user requests a novel combination of existing capabilities.

### Separation of Concerns
Harmonia strictly separates planning, execution, and proof. Planners propose strategies, executors attempt them, and proof agents validate the results independently.

### Agent Swarm

| Agent | Role |
|---|---|
| **Intent Agent** | Deeply analyzes ambiguous requests, asking "What is the user actually trying to achieve?" rather than just parsing keywords. |
| **Capability Agent** | Searches the Capability Registry and the Library to find the best existing tools or precedents to fulfill the intent. |
| **CAD Strategy Agent** | Formulates complex geometric plans, breaking down novel requests into sequences of supported operations. |
| **Adaptation Agent** | Specializes in modifying existing library items to meet new constraints, prioritizing reuse over reinvention. |
| **Validation Agent** | An independent critic that rigorously tests proposed plans and generated artifacts against physical and logical constraints. |
| **Proof Agent** | Compiles the final Daedalus Receipt, ensuring all gates were passed and the truth doctrine was upheld. |
## Section 5 — Capability Registry

The Capability Registry is the authoritative source of truth for what the system can actually generate. It replaces hardcoded lists and prompt-based assumptions with a formal, queryable database of supported operations.

### Why It Exists
To prevent the system from hallucinating capabilities or silently degrading complex requests into primitive shapes. If a capability is not in the registry, the system cannot do it, and must tell the user the truth.

### Schema: `capability_registry`

| Field | Type | Description |
|---|---|---|
| `id` | UUID | Primary key |
| `name` | String | Unique identifier (e.g., `primitive_spacer_v1`) |
| `type` | Enum | `parametric_generator`, `image_to_relief`, `svg_extrusion`, `library_adaptation` |
| `object_classes` | String[] | Semantic tags for routing (e.g., `["spacer", "bushing", "standoff"]`) |
| `required_inputs` | JSONB | Schema of mandatory parameters (e.g., `{"outer_diameter": "number"}`) |
| `optional_inputs` | JSONB | Schema of optional parameters |
| `validator_bindings` | String[] | IDs of specific validation rules to apply |
| `preview_strategy` | Enum | `inline_stl`, `rendered_image`, `schematic` |
| `reuse_eligible` | Boolean | Can outputs of this capability be saved to the library? |
| `truth_label` | String | User-facing description of what this actually does |

### Example Entries

| Name | Type | Object Classes | Required Inputs | Truth Label |
|---|---|---|---|---|
| `primitive_spacer_v1` | `parametric_generator` | `["spacer", "bushing", "washer"]` | `outer_diameter`, `inner_diameter`, `length` | "A simple cylindrical spacer with a center hole." |
| `rocket_body_v1` | `parametric_generator` | `["rocket_body", "fuselage"]` | `height`, `diameter`, `wall_thickness` | "A hollow cylindrical rocket body tube." |
| `rocket_display_model_v1` | `parametric_generator` | `["rocket", "missile", "spacecraft"]` | `height`, `body_diameter` | "A stylized, multi-stage display rocket model." |
| `image_relief_v1` | `image_to_relief` | `["plaque", "lithophane", "coin"]` | `source_image_url`, `base_thickness`, `relief_depth` | "A 3D relief generated from a 2D image." |
| `library_adaptation_v1` | `library_adaptation` | `["*"]` (Universal) | `source_library_item_id`, `parameter_overrides` | "An adaptation of a previously successful print." |
| `profile_revolve_v1` | `svg_extrusion` | `["vase", "bowl", "knob"]` | `svg_profile_url`, `revolve_angle` | "A 3D object created by revolving a 2D profile." |

---

## Section 6 — Library / Self-Improvement Schema

The persistent learning layer ensures that every successful job becomes reusable infrastructure. This is how the platform scales from a collection of primitive generators to a vast repository of proven solutions.

### Entity Proposals

| Entity | Purpose | Key Fields |
|---|---|---|
| `library_items` | The core reusable asset. | `id`, `source_job_id`, `capability_id`, `parameters`, `artifact_paths`, `success_score` |
| `job_recipes` | The abstract "how-to" for a specific type of request. | `id`, `intent_signature`, `recommended_capability_id`, `parameter_mapping_rules` |
| `adaptation_metadata` | Tracks how library items are modified. | `id`, `parent_item_id`, `child_item_id`, `delta_parameters` |
| `proof_receipts` | The immutable record of a generation attempt (Daedalus Gate output). | `id`, `job_id`, `gate_results`, `final_status` |
| `job_outcomes` | Real-world feedback. | `id`, `job_id`, `print_success`, `user_rating`, `failure_reason` |

### The Learning Loop
When a new request arrives, the Capability Router first queries `library_items` for high `success_score` matches based on the `intent_signature`. If a close match is found, the system proposes an adaptation (changing parameters) rather than a from-scratch generation. When a user successfully prints an item and provides positive feedback, a `job_outcome` is recorded, increasing the `success_score` of the `library_item` and reinforcing the `job_recipe`.

---

## Section 7 — Phased Roadmap

The transition from the V1 substrate to the V2 architecture must be methodical, ensuring stability while introducing core architectural shifts.

| Phase | Goal | Deliverables | Why it comes in that order | Dependencies | Proof Criteria |
|---|---|---|---|---|---|
| **0: Freeze V1 Substrate** | Stabilize the current codebase and prevent further technical debt. | Comprehensive test coverage, bug fixes for critical V1 flows. | To ensure a solid foundation before major architectural surgery. | None. | All existing tests pass; zero known P0/P1 bugs in production. |
| **1: Truth Architecture** | Implement the Capability Registry and Daedalus Gate Protocol. | `capability_registry` DB schema, Daedalus Gate middleware, updated Intent Interpreter. | This is the core of the "Truth Rules." The system must stop lying before it can get smarter. | Phase 0. | The system correctly rejects unsupported requests and logs Daedalus Receipts for all jobs. |
| **2: Real Structured Object Families** | Expand the Capability Registry with genuinely useful, non-primitive generators. | New CAD worker scripts (e.g., enclosures, complex brackets, stylized models), updated registry entries. | To provide actual value beyond basic shapes, fulfilling the "must-have app" promise. | Phase 1. | Users can successfully generate and print at least 5 new, complex object classes. |
| **3: Reuse Engine** | Implement the Library and Self-Improvement Schema. | `library_items` and related tables, retrieval logic in the Capability Router, adaptation UI. | To stop reinventing the wheel and start accumulating value. | Phase 2. | The system successfully routes at least 30% of new requests to adapted library items rather than from-scratch generation. |
| **4: Harmonia Integration** | Deploy the Harmonia agent swarm for complex orchestration. | Harmonia orchestration layer, specialized agents (Intent, Capability, CAD Strategy). | To handle ambiguous, multi-step, or novel requests that defeat deterministic routing. | Phase 3. | Harmonia successfully resolves at least 50% of requests that previously resulted in a "needs clarification" loop. |
| **5: Mobile-First Universal Product** | Optimize the intake and preview experience for mobile devices. | Voice-first intake UI, optimized mobile STL viewer, push notifications for job status. | To meet users where they are (often at the printer, not a desktop). | Phase 4. | Mobile usage accounts for >50% of successful jobs. |
| **6: Self-Improvement Engine** | Close the learning loop with automated recipe generation and capability scoring. | Automated `job_recipe` creation based on successful `job_outcomes`, dynamic capability routing based on success scores. | To create a compounding advantage where the platform gets smarter with every print. | Phase 5. | The system automatically creates new routing rules based on user success data without manual intervention. |
## Section 8 — Current Repo Reuse / Rework Plan

The current V1 repository provides a valuable substrate, but many components must be reworked or deprecated to align with the V2 truth-first doctrine.

| Component | Status | Reasoning |
|---|---|---|
| **Auth/Access Foundations** | Reuse as-is | The Supabase Auth integration, Google OAuth, and the centralized `shouldBypassLimits` access policy module are robust and correctly implemented. They provide a solid foundation for user identity and quota management. |
| **Job/Artifact Model** | Reuse with modification | The core `jobs` and `artifacts` tables are sound, but they must be extended to support the new `library_items` schema and the Daedalus Gate receipts. The concept of a "job" must expand beyond a single CAD run to encompass the entire lifecycle, including adaptation and validation. |
| **Preview/STL Viewer** | Reuse as-is | The `StlViewer` component (Three.js) is functional and provides the necessary "guaranteed preview" capability. It should be the default visualizer for all parametric and adapted parts. |
| **VPL Infrastructure** | Reuse with modification | The Virtual Print Lab (VPL) is a critical component of the Validation Layer. However, it must be integrated more deeply into the Daedalus Gate Protocol, acting as a hard gate rather than just a UI decoration. |
| **Intake UI Shell** | Reuse with modification | The `UniversalCreatorFlow` provides a good starting point for multimodal intake. It must be expanded to handle voice and document uploads more gracefully, and integrated with the new Intent Interpreter. |
| **Primitive-Only Invention Route (`/api/invent`)** | Deprecate and Replace | This route violates the truth doctrine by silently mapping complex requests to primitive shapes. It must be replaced by the Capability Router, which will either find a valid capability or explicitly reject the request. |
| **Current Demo Route (`/api/demo/artemis`)** | Rework | Demos must share the same orchestration core as custom jobs. The Artemis demo should be refactored as a pre-configured request routed through the standard Capability Router, using a dedicated `rocket_display_model_v1` capability. |
| **Clarify Flow** | Reuse with modification | The recent fixes to the clarify route (fail counters, fallback forms, enum normalization) are excellent. This flow should be integrated into the Clarification Planner, ensuring it only triggers when the Capability Router explicitly requests missing parameters. |
| **Library/Project Persistence** | Replace entirely | The current `projects` table is disconnected from the job lifecycle and relies on a flawed ownership model. It must be replaced by the new `library_items` and `job_recipes` schema, ensuring every successful job becomes reusable infrastructure. |
| **Receipts** | Reuse with modification | The `daedalus_receipts` table is a great start. It must be expanded to cover all 8 gates of the Daedalus Gate Protocol, becoming the immutable record of truth for every generation attempt. |

---

## Section 9 — V2 Success Metrics

To ensure the V2 architecture delivers on its promise, we must track the following key performance indicators (KPIs):

| Metric | Definition | Target |
|---|---|---|
| **Request-to-First-Valid-Preview Rate** | The percentage of user requests that successfully navigate the intake, routing, and generation layers to produce a viewable 3D model. | >80% |
| **Request-to-Approved-Job Rate** | The percentage of requests that result in a user explicitly approving the generated artifact for printing. | >60% |
| **Reuse/Adaptation Rate** | The percentage of successful jobs that were generated by adapting an existing library item rather than from scratch. | >40% |
| **Successful Print Rate** | The percentage of approved jobs that result in a physically successful print, as reported by the user. | >90% |
| **Unsupported Honesty Rate** | The percentage of unsupported requests that are correctly identified and rejected by the Capability Gate, rather than silently degraded. | 100% |
| **False-Success Rate** | The percentage of jobs that pass the Validation Gate but fail to print successfully. | <5% |
| **Average Clarification Turns** | The average number of back-and-forth exchanges required to resolve an ambiguous request. | <1.5 |
| **Repeat-User Retention** | The percentage of users who return to generate a second part within 30 days of their first successful print. | >50% |

---

## Section 10 — Build-Ready Outputs

### Executive Summary
AI4U Little Engineer V2 transitions the platform from a primitive CAD toy to a universal print orchestrator. By enforcing strict "Truth Rules" via the Daedalus Gate Protocol and the Capability Registry, the system guarantees that it never silently degrades user intent. Every successful job is persisted in a new Library schema, creating a compounding self-improvement loop where the platform learns to adapt proven solutions rather than reinventing the wheel. Harmonia orchestration handles complex edge cases, ensuring a frictionless, multimodal user experience that scales to become the default app for 3D printer owners.

### Non-Negotiable Truths
1. **No Silent Degradation:** If we can't build it, we say so.
2. **Capability Honesty:** The Capability Registry is the sole source of truth.
3. **Validation-Backed:** Every artifact must pass the VPL before presentation.
4. **Artifact Persistence:** Real, storage-backed outputs for every successful job.
5. **Reuse Before Reinvention:** The library is our most valuable asset.

### What V1 Got Right vs. Wrong
**Right:**
- Auth and access control (Supabase + Google OAuth).
- The core `jobs` and `artifacts` data model.
- The `StlViewer` for guaranteed previews.
- The recent clarify flow improvements (fail counters, fallback forms).

**Wrong:**
- The `/api/invent` route silently degrading complex requests to primitive shapes.
- Demos bypassing the core orchestration logic.
- The disconnected `projects` table failing to capture reusable infrastructure.
- The lack of a formal Capability Registry.

### First 10 V2 Implementation Tickets

1. **DB Schema: Capability Registry:** Create the `capability_registry` table and populate it with the initial 10 primitive generators.
2. **DB Schema: Library & Receipts:** Create the `library_items`, `job_recipes`, and `proof_receipts` tables, and update the `jobs` table to link to them.
3. **Core: Daedalus Gate Middleware:** Implement the 8-stage Daedalus Gate Protocol as a reusable middleware pipeline for all generation requests.
4. **Core: Intent Interpreter V2:** Refactor the intake route to output the new structured interpretation payload, integrating with the Capability Registry.
5. **Core: Capability Router:** Implement the routing logic that matches interpreted intent against the Capability Registry and triggers the Clarification Planner if needed.
6. **Deprecation: Retire `/api/invent`:** Remove the legacy invention route and wire the `UniversalCreatorFlow` to the new Capability Router.
7. **Refactor: Artemis Demo:** Re-implement the Artemis demo as a standard request routed through the Capability Router using a new `rocket_display_model_v1` capability.
8. **Feature: Library Adaptation Engine:** Implement the logic to retrieve and modify existing `library_items` based on new parameter overrides.
9. **Integration: VPL as a Hard Gate:** Update the Validation Layer to strictly enforce VPL results, blocking unprintable models from reaching the user.
10. **UI: Truth-First Feedback:** Update the frontend to clearly display Daedalus Gate rejections (e.g., "Unsupported Capability") and offer valid alternatives or library adaptations.
