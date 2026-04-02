# Artemis II Demo Fix

The Artemis II showcase demo on the AI4U Little Engineer homepage was failing to generate a 3D model. This document explains the root cause and the architectural fix implemented.

## The Root Cause

The `ArtemisIIDemoCard` component was sending a request to the main `/api/invent` route with the `intake_family_candidate` set to `"custom_shape"`.

However, the core CAD engine is a **parametric part generator**. It is designed to build specific mechanical families (e.g., `spacer`, `bracket`, `enclosure`). It does not have a `"custom_shape"` family.

When the `/api/invent` route's LLM evaluated the request ("Commemorative display base for Artemis II mission..."), it correctly determined that this concept could not be solved by any of the 10 valid parametric families. Following its system prompt, it returned a `confidence` score of `0.0`.

The `/api/invent` route rejects any result with a confidence below `0.5`, returning an error to the client. The demo card caught this error and displayed "Generation failed."

## The Architectural Truth

The system cannot generate a photorealistic, freeform rocket model. It generates precise, functional, parametric geometry.

The Artemis II demo was wired to the wrong endpoint for a concept/showcase model.

## The Fix

The Artemis II demo now has its own dedicated API route: `/api/demo/artemis`.

This route honestly maps the concept of a "display base" to the closest feasible parametric family: `standoff_block`.

Instead of attempting to generate a rocket, it generates a functional, commemorative display stand (a hexagonal base with a central column) that is a valid, printable parametric part.

This approach maintains the integrity of the CAD engine while providing a successful, tangible result for the showcase demo.

© AI4U, LLC. AI4Utech.com, Lee Hanna-Owner.
