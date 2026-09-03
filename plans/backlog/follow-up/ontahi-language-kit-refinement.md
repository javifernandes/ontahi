# Ontahi Language Kit Refinement

Status: backlog

Canonical ID: `ontahi://plans/ontahi-language-kit-refinement`

Migrated from: `bookops://plans/ontahi-language-kit-refinement`
Original path: `plans/backlog/follow-up/ontahi-language-kit-refinement.md`
Source commit: `cef2b1b2`

## Summary

Refine the Ontahi Language Kit as a compact visual/editorial source language for future Ontahi docs, UI, slides, and examples.

The language kit is now importable, styled, asset-backed, and visible in BookOps. That makes it useful as a working book, not only as a design sketch. The remaining work is editorial and visual refinement.

This is not the public Ontahi user documentation. It is the source language that future Ontahi materials can grow from.

## Context

Source material:

1. [`docs/ontahi/book-of-style/README.md`](bookops://docs/ontahi/book-of-style/README)
2. [`docs/ontahi/book-of-style/AGENTS.md`](bookops://docs/ontahi/book-of-style/AGENTS)
3. [`book-scoped-style-system.md`](bookops://plans/book-scoped-style-system)

The book already contains:

1. philosophy and visual grammar,
2. color, typography, layout, and dark mode,
3. botanical language,
4. identity system,
5. interface/editorial guidance,
6. asset inventory,
7. prompts for coding agents.

It also contains usable assets:

1. SVG specimens,
2. dark/light variants,
3. icons,
4. palette exports,
5. ceibo patterns,
6. logo/app icon variants.

## Scope

In scope:

1. make the book feel more like a compact botanical manual,
2. split large specimen boards into smaller section-specific visual primitives,
3. improve SVG craft and asset taxonomy,
4. keep it lightweight enough for humans and agents to use as context.

Out of scope:

1. public Ontahi user documentation,
2. generated raster diagrams when a hand-tuned SVG is the right artifact,
3. large prose expansion that makes the book worse as agent context,
4. BookOps style-system implementation work beyond import compatibility checks.

## Proposed Form

Large images should become smaller, more purposeful visual primitives.

Instead of a single specimen repeating chapter title and copy, prefer:

1. one color palette figure,
2. one usage-ratio figure,
3. one dark-mode surface figure,
4. one typography role figure,
5. one ceibo line specimen,
6. one icon grammar grid,
7. one editorial primitive figure.

The book text already carries the explanation; images should carry visual evidence.

Future botanical figures should be richer and more deliberate:

1. more complete ceibo flower outlines,
2. larger background botanical plates,
3. side figures that sit between background and content,
4. line-art variants inspired by botanical manuals,
5. dark-mode botanical variants that preserve depth without generic black.

Use inline semantics more intentionally:

1. `\concept{Ontahi}`,
2. repeated core ideas such as `language`, `structure`, `rhythm`, and `executable ontology`,
3. quotes styled like the original flyer,
4. margin/sidebar notes where they help,
5. restrained code and table examples.

Keep the asset inventory honest and downloadable:

1. logo assets,
2. symbol variants,
3. app icon and favicon variants,
4. icon family,
5. palette JSON/CSS/TS,
6. Tailwind preset,
7. patterns,
8. specimen SVGs,
9. dark/light asset pairs.

## Execution Slices

1. Edit the standalone `javifernandes/ontahi-book-of-style` repository first.
2. Sync the BookOps submodule only when a coherent checkpoint exists.
3. Prefer SVG for diagrams, patterns, icons, and specimens.
4. Use generated bitmap images only when a raster texture or editorial illustration is the intended artifact.
5. Keep BookOps import compatibility visible by running a local extraction after structural changes.

## Verification

This follow-up is done when:

1. images no longer duplicate chapter titles and explanatory prose,
2. each major section has at least one useful visual primitive,
3. botanical assets feel deliberate, aligned, and reusable,
4. dark and light mode variants both work in BookOps,
5. the book stays compact enough to serve as agent context.

## Open Questions

1. Should chapter-level botanical figures be modeled explicitly in the manifest?
2. Should BookOps support a first-class side figure slot for style books?
3. How much of the language kit should be visible to public users versus kept mainly for team/agent context?
4. Should Ontahi eventually publish the language kit separately from its user documentation?

## Closure / Evolution

Not closed. This remains part of the Ontahi learning-materials line and feeds the book-scoped style-system follow-up.
