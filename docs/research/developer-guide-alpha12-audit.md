# Developer book refresh — alpha.12

Source baseline: `ced29a6` on Ontahi main, with package manifests at `1.0.0-alpha.12`.
Scope: programming-facing documentation only. Canonical source is `docs/developers`, not the
relocation notice in `ontahi-library`. This is a teaching update, not an API change or another release.

## Audit and decisions

| Area                   | Finding                                                                                                                                                                 | Book change / evidence                                                                                                                                                         |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Identity and factories | Identity chapter still led with locators; factories were a short experimental note                                                                                      | Distinguish Ref/identity from criteria; include full `withSelectionFactories` declarations and composition, based on Todo's Tag and Core factory tests                         |
| Contextual selections  | Supported, but the source/destination distinction was easy to miss                                                                                                      | Explain current population, flat set results, source/target filters and classification; Core contextual tests and BookOps Chapter rehearsal                                    |
| Entity variants        | Read support existed as a compact note                                                                                                                                  | Explain declaration, narrowed types, complement, `from`, canonical base identity, contextual `.as`, registered policy roots and `existingRef`; Core variant/read/binding tests |
| Runtime Transport      | WebSocket already documented, but only from the client and contradicted elsewhere                                                                                       | Add host socket binding, request-vs-observation capabilities and update stale future wording; Todo host plus Express/React transport tests                                     |
| Console and Devtools   | Current features dispersed between reflection and future directions                                                                                                     | New current-surface chapter with both dialects, terminals, capability discovery, reflective table edits, Observe and cache/history boundaries                                  |
| Remote writes          | Transport/future chapters still said there were no Entity writes                                                                                                        | Align with existing Commands/browser chapters: exact create and Ref-targeted update/delete exist; arbitrary Selection mutation and upsert do not                               |
| Other alpha.12 work    | Ordered relations, exact-one-before-shaping, schema-native participants, wire-only transform projection, contextual MySQL/Supabase support already have owning sections | Retain and cross-link those sections instead of duplicating their provider/security contracts                                                                                  |

## Limits deliberately retained

- `by` coexists with locators and produces unbound, deferred membership. It does not remove Refs,
  imply a server-side factory registry, assert uniqueness, or make arbitrary callbacks portable.
- Contextual membership changes the target population; it is not a scalar Derived Field or nested
  result projection. Graph Read v2 and per-hop authority remain required remotely.
- Variants are fixed, required stored-enum classifications with base identity. No variant writes,
  classification transitions, standalone generated variant exports or deferred variant Operation
  targets are promised. `existingRef(Variant)` deliberately materializes an authorized participant.
- Console remains read-only. Observation is limited to supported Graph Read v1 many queries.
  Cache history is local debugging evidence, not persisted versioning or an audit log.
- Socket delivery is not replay, reconnect/resubscription, exactly-once execution or a first-class
  domain Event model. The host owns authentication, per-family policy and appropriate change feeds.

## Plan and knowledge audit

Plans 120a/120b and 146h remain completed history. Plans 150/152 retain their broader unfinished
Console/variant scope; this refresh does not close them. Plan 122's original book remains completed.
The Developer Docs Atlas item records the new chapter and teaching surface; no runtime-model change
or new implementation plan is required.

## Verification

Verification completed on 2026-09-20:

- Public-export typecheck and runtime proof extracted the new Tag factory, variant read/policy and
  Devtools wiring examples into a temporary consumer. Factory composition and relative variant
  complement produced the expected records; the temporary file was removed afterward.
- All eight fenced Console queries parse/lower successfully. Each TS-like/declarative pair yields
  the same canonical request. This caught and corrected the ordering spellings during authoring:
  `orderBy(title, desc)` versus `order by title descending`.
- 101 Core tests passed for factories, variants, contextual composition, Chapter participants,
  Runtime sessions and transport routing; 182 Console language tests passed.
- 16 WebSocket client tests and four real Express WebSocket tests passed. The latter were rerun
  with local socket permission after the sandbox denied their ephemeral listener.
- 65 local links/anchors across the 14 changed Markdown files resolve; code fences are balanced.
  The numbered source and table of contents contain 29 chapters. Formatting and `git diff --check`
  pass for the changed files.

No runtime implementation, host database, package publication or BookOps import was changed.
