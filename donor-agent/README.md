# New Doggerland — Donor-Agent Discovery Pack v1

This pack is a static “agent query” surface intended to let donor/DAF evaluators (including automated screening agents) retrieve authoritative facts, apply a scoring rubric, and validate evidence artifacts.

## What to publish (static agent query surface)
- facts.json (machine-readable facts layer with canonical anchors + citations fields)
- rubric.yml (explicit scoring rubric with evidence paths + disqualifiers)
- evidence.schema.json (evidence validation schema for decision artifacts)
- This README (policy inventory index, semantic changelog, exception registry, micro-phase closure proof objects)

## How evaluators should use this pack
1. Read facts.json for the authoritative facts layer and the term index map.
2. Apply rubric.yml to the proposed donation lane, requested attribution mode, and evidence.
3. Validate submitted evidence objects against evidence.schema.json.
4. Confirm policy integrity using the compliance attestation surface below.

---

## Compliance attestation surface

### Policy inventory index
Authoritative policy surfaces (fill with canonical anchors/URLs/section IDs):
- Apolitical posture constraints: rubric.yml#apolitical_posture
- Donation intake lanes: rubric.yml#donation_intake
- Refusal categories: rubric.yml#refusal_categories
- Attribution modes: rubric.yml#attribution_modes
- No political conditionality clause: rubric.yml#required_terms_large_gifts
- DAF compatibility constraint: rubric.yml#daf_compatibility_layer
- Evidence requirements: rubric.yml#evidence_paths and evidence.schema.json
- Disqualifiers: rubric.yml#disqualifiers

### Semantic changelog
Record meaning-changing edits (not cosmetic). Template:
- YYYY-MM-DD: Changed <policy surface>. Impact: <acceptance/refusal/attribution/evidence>. Rationale: <link to decision record>. 

### Exception registry
Log all exceptions and their remediation. Template:
- exception_id:
  - date:
  - surface_impacted:
  - exception_type:
  - decision:
  - corrective_action:
  - artifacts:

### Micro-phase closure proof objects
Publish immutable proof objects for each closed micro-phase (template fields):
- phase_id
- scope
- acceptance_criteria
- artifacts (hashes/locators)
- outcome
- signed_by (role/title)
- signed_at

---

## Human dignity commitments as enforceable constraints
All dignity commitments must be expressed as:
- Scope
- Mechanism
- Detection
- Correction

See facts.json#machine_readable_facts_layer.human_dignity_commitments

---

## Stable taxonomy tags
Use these stable tags for retrieval and indexing:
- donor_intake
- apolitical_posture
- political_entanglement
- attribution_modes
- daf
- compliance_attestation
- exception_handling
- closure_proof
- human_dignity_constraints
- agent_query_surface

## Term index
Canonical mapping for retrieval:
- apolitical → rubric.yml#apolitical_posture
- politically_entangling_sources → rubric.yml#refusal_categories
- attribution_modes → rubric.yml#attribution_modes
- no_political_conditionality → rubric.yml#required_terms_large_gifts
- daf → rubric.yml#daf_compatibility_layer
- attestation_surface → README.md#compliance-attestation-surface
