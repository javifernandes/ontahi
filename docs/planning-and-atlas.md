# Planning and Atlas

Ontahi keeps its active direction, research, completed intervention history, and durable framework
model in this repository.

## Plans

Plan folders represent workflow state:

- `plans/current/`: work actually in progress;
- `plans/next/`: actionable work ready to be pulled;
- `plans/backlog/`: deferred work and future ideas;
- `plans/research/`: investigations and option studies;
- `plans/done/`: completed historical plans.

Place `Status: <folder status>` immediately below the title. Move a plan between folders when its
status changes. Completed plans remain whole: they are the history of an intervention, including
evidence from host applications when that evidence shaped Ontahi.

Plans should make the following legible when applicable:

1. summary and context;
2. research or evidence;
3. scope and non-goals;
4. proposed form, with a small concrete example for design work;
5. execution slices and a flat acceptance checklist;
6. verification, decisions, open questions, and closure/evolution.

Do not silently drop scope. Record deferred work and extract a linked follow-up when it remains
actionable.

## Atlas

Plans record interventions. `atlas/items/` records durable shapes that survive individual plans:
models, concepts, capabilities, policies, operations, runtime surfaces, artifacts, evidence groups,
and operating practices.

When work discovers or materially changes a durable framework shape, update the smallest useful
Atlas item and connect it to the relevant plan. Prefer a narrow item over a speculative taxonomy.

## Canonical source references

Cross-repository relationships use a registered source name as the URI scheme and a logical path:

```yaml
relatedPlans:
  - bookops://plans/68b-data-graph-engine-api
```

Sources are registered once in `atlas/sources.yaml`. Logical plan paths omit workflow folders so an
identity remains stable when a plan moves from `next` to `current` to `done`:

```text
ontahi://plans/128-data-graph-execution-bridge
bookops://plans/68b-data-graph-engine-api
ontahi://atlas/model/selection
```

The physical Markdown path remains ordinary repository state. A resolver should first use
`localRoot` when available and otherwise resolve through the repository URL. Documents may include
normal relative Markdown links for relationships wholly inside this repository.

## Migrated knowledge

When a plan moves from another repository, preserve it completely and add provenance rather than
rewriting its history. Record at least the original repository, original path, and source commit.
The old repository may keep a small relocation stub, but must not keep a second canonical copy.
