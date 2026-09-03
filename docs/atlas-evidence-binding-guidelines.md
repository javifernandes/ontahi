# Atlas Evidence Binding Guidelines

Canonical source:
[`javifernandes/atlas`](https://github.com/javifernandes/atlas/blob/main/docs/atlas-evidence-binding-guidelines.md).
Repository copies should preserve this contract. Change the canonical document first when the
syntax or semantics evolve.

## Purpose

Atlas can attach a merged GitHub Pull Request to the Plans and Atlas Items it implemented or
shaped. These bindings make implementation evidence navigable without copying PR records into
Markdown or automatically changing curated Plan or Item status.

Use an evidence binding only when the relationship is meaningful. Ordinary maintenance PRs do not
need `Atlas-Implements` or `Atlas-Shapes`, even when explicit Session routing applies.

## Current ingestion contract

Atlas currently reads directives from the body of a merged PR. A binding appears when all of the
following are true:

1. the repository is a registered Atlas source and the Atlas GitHub App can read it;
2. the PR is merged, not merely closed;
3. the PR body contains a supported directive;
4. the target resolves to a Plan or Atlas Item visible to Atlas.

Commit messages are not currently ingested. A commit footer may preserve the same intent for
humans and future tooling, but the PR body remains required.

## Binding semantics

Use `Atlas-Implements` when the PR materially executes an intended Plan or delivers the behavior
named by an Atlas Item.

Use `Atlas-Shapes` when the PR changes the durable form, responsibility, contract, or meaning of an
Atlas Item.

A PR may use both. For example, it can implement a Plan while reshaping an Evidence Binding model
item. A merge records evidence only; it never marks the target `done` or changes its horizon.

## Target references

Prefer stable, exact references:

1. Atlas Items: use the item's frontmatter `id`, such as
   `spec-workstream-atlas.atlas-model.evidence-binding`.
2. Cross-repository Plans: use a canonical source URI without a workflow folder or `.md`, such as
   `atlas://plans/102-workstream-atlas-implementation-evidence`.
3. Plans owned by the PR repository: a repository-relative path such as
   `plans/current/123-reader-navigation.md` is also accepted.
4. Source-relative plan keys and numbers may resolve, but prefer a full path or canonical URI to
   avoid ambiguity.

Confirm that the target already appears in Atlas before merging. A typo or unresolved target does
not create a partial binding.

## PR body syntax

One target may be inline:

```text
Atlas-Implements: atlas://plans/102-workstream-atlas-implementation-evidence
Atlas-Shapes: spec-workstream-atlas.atlas-model.evidence-binding
```

Multiple targets should use a compact list:

```text
Atlas-Implements:
- atlas://plans/102-workstream-atlas-implementation-evidence

Atlas-Shapes:
- spec-workstream-atlas.atlas-model.evidence-binding
- spec-workstream-atlas.operating-practice.evidence-binding-conventions
```

The parser also accepts comma- or semicolon-separated inline targets, Markdown links, and targets
wrapped in backticks. Prefer raw references and lists because they are easier to audit. Keep list
items adjacent to their directive; a blank line ends the list.

`COMPLETES`, `Closes`, issue references, PR titles, labels, and ordinary prose do not bind Atlas.

## Session routing

`Atlas-Session` is a separate operational directive. It does not create evidence and does not
replace `Atlas-Implements` or `Atlas-Shapes`:

```text
Atlas-Implements: atlas://plans/125-explicit-session-forking-and-routing
Atlas-Shapes: spec-workstream-atlas.atlas-model.execution-stream
Atlas-Session: 43bd10df-f2cf-4f05-8f1d-3666f5614771
```

The value is the stable UUID shown by the Atlas Sessions workspace. A merged PR carrying one valid
directive is appended only to that open Session when the PR author's linked GitHub account owns it.
Atlas does not route a malformed, duplicate, unknown, closed, or differently owned target to an
implicit Session instead. A PR without `Atlas-Session` keeps the compatible implicit-Session
behavior.

Use **Copy for LLM** in the Sessions workspace when handing work to a chat. The copied block includes
the Session title, stable ID, addressable Atlas URL, and the exact line the chat must preserve in
every PR body. The Session identifies the line of work; the LLM or chat is not modeled as its owner.

### LLM and agent handoff

Treat the copied Session block as input, not as something a chat or agent reconstructs:

1. copy the exact `Atlas-Session: <uuid>` line into every PR body created for that Session;
2. preserve exactly one copy when editing or replacing a PR body later;
3. keep `Atlas-Session` separate from evidence directives: routing does not imply what the PR
   implements or shapes;
4. never invent a Session ID, infer one from Plans, branches, changed files, or earlier chats, or
   reuse an ID from unrelated work;
5. when no exact Session directive was provided, omit it and let Atlas use implicit-session
   compatibility.

Before submitting or updating a PR through a CLI, API, or UI, inspect the final body rather than
assuming a template or an earlier draft retained the directive.

## Author workflow

Before coding:

1. identify the Plan being implemented, if any;
2. identify durable Atlas Items whose form may change;
3. update the owning Plan or smallest durable item when repository workflow requires it.

When preparing commits:

1. follow the repository's commit-title convention;
2. keep commits scoped to one coherent change;
3. optionally repeat Atlas directives as commit trailers when the individual commit should retain
   that intent;
4. do not rely on commit trailers to create a binding.

When preparing the PR:

1. explain the behavioral or system change normally;
2. add only the directives supported by the change;
3. use exact target references and remove template placeholders;
4. if the work arrived with a copied Session instruction, include its exact `Atlas-Session` line
   once; otherwise omit it;
5. keep the directives in the PR body through every edit, review, and merge;
6. report the verification actually run.

After merge, open the target node's `Evolution` section in Atlas and confirm that the PR appears as
implementation evidence. A missing binding is a target-resolution or ingestion problem, not a
reason to duplicate the PR in Markdown.

## Commit footer example

```text
feat(evidence): document Atlas binding conventions

Atlas-Implements: atlas://plans/102-workstream-atlas-implementation-evidence
Atlas-Shapes: spec-workstream-atlas.operating-practice.evidence-binding-conventions
```

The same directives must still appear in the PR body.

## Copyable PR section

```text
## Atlas context

<!-- Keep only the directives that apply. Session routing may exist without evidence. -->

Atlas-Implements:
- <source>://plans/<stable-plan-key>

Atlas-Shapes:
- <atlas-item-frontmatter-id>

Atlas-Session: <session-uuid>
```

Remove evidence directives when the PR has no meaningful Atlas target. Remove `Atlas-Session` when
the PR belongs to the implicit Session. Never submit literal placeholders.
