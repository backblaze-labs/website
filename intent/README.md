# Intent, spec, plan

Larger changes live here as `intent/<slug>/intent.md`, then `spec.md`, then
`plan.md`. See [`../docs/SDLC.md`](../docs/SDLC.md) for when the full chain
applies. A human accepts each file before the next is written.

| File | Written by | Accepted by | Holds |
| --- | --- | --- | --- |
| `intent.md` | Originator | Maintainer | Problem, outcome, constraints, open questions. No design. |
| `spec.md` | Agent | Maintainer | Numbered requirements, design, constraint-coverage table, concerns. |
| `plan.md` | Agent (plan mode) | Maintainer | Files that change, ordered steps citing requirements, risks, proof. |

Small fixes with a clear issue skip straight to code.

## intent.md

```markdown
# Intent: <title>

Author: <name> · Issue: #<n> · Status: draft | accepted

## Problem

## Proposed outcome

## Constraints

## Open questions
```

## spec.md

```markdown
# Spec: <title>

## Requirements

- R1. <testable statement>

## Design

## How each constraint is met

| Constraint | How |
| --- | --- |

## Areas of concern
```

## plan.md

```markdown
# Plan: <title>

## Files that change

## Order of work

1. <step> (R1)

## Risks

## Proof

- R1: <check or manual step; does it fail when reverted?>
```
