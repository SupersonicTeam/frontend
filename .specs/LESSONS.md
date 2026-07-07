# LESSONS — auto-maintained by scripts/lessons.py

> Machine-owned. Do NOT hand-edit. Changes are overwritten on the next `lessons.py` write.
> Canonical state lives in `.specs/lessons.json`. Edit lessons only via the script.
> promote_threshold=2 distinct features · window_days=45 · quarantine_threshold=2

## Confirmed (load these at Specify/Design)

Corroborated across multiple features. Safe to apply as guidance.

_none_

## Candidates (under observation — do NOT load as guidance yet)

Seen once or not yet corroborated. Tracked, not trusted.

### L-001 — When an AC requires triggering a side-effect service (e.g. a notification service) on success, verify the service is actually injected and called, not just that the data-presence part of the AC is satisfied.
- signal: `ac_gap` · recurrence: 1 feature(s) · scope: `contador` · harmful: 0
- features: contador-fluxo-documentos
- evidence: spec.md CTD-17; contador.ts salvarSolicitacao() (contador)
- last seen: 2026-07-07T18:44:55Z

### L-002 — When an edge case specifies an empty-state message for a filtered/selected view, confirm the underlying data source can actually produce zero items for that view before considering the AC satisfied by a different empty state (e.g. no-selection vs. empty-selection are different states).
- signal: `ac_gap` · recurrence: 1 feature(s) · scope: `contador` · harmful: 0
- features: contador-fluxo-documentos
- evidence: spec.md CTD-22; contador.ts checklistCategorias (contador)
- last seen: 2026-07-07T18:44:59Z

### L-003 — When testing that two independently-erroring async sources are decoupled, write at least one test where the erroring source resolves AFTER the successful source, not only before — an accidental re-coupling in the error handler can be masked by whichever source completes last.
- signal: `surviving_mutant` · recurrence: 1 feature(s) · scope: `calendario` · harmful: 0
- features: contador-fluxo-documentos
- evidence: calendario.ts:136-140; calendario.spec.ts:39-71 (calendario)
- last seen: 2026-07-07T18:45:04Z

### L-004 — When a UI success-toast/side-effect is gated behind a service call returning non-null, extend the same error-to-mock-fallback convention already used elsewhere in the same service to that call too, instead of leaving it as the one method that returns null on error.
- signal: `spec_deviation` · recurrence: 1 feature(s) · scope: `contador` · harmful: 0
- features: contador-fluxo-documentos
- evidence: contador.service.spec.ts:195 SPEC_DEVIATION marker (contador)
- last seen: 2026-07-07T18:45:10Z

## Quarantined (failed when applied — ignore)

A confirmed lesson that recurred alongside failure. Kept for the maintainer to review.

_none_
