import Image from 'next/image';

const essayUrl =
  'https://bookops.net/ontahi-library-01-living-systems/living-systems/why-systems-evolve';
const repoUrl = 'https://github.com/javifernandes/ontahi';

const adoptionLayers = [
  [
    'Domain',
    'Entities, relations, operations, policies, and events give ordinary applications a precise executable model.',
  ],
  [
    'Runtime',
    'Tasks, workflows, resources, state, and observability make the model durable beyond a single request.',
  ],
  [
    'Experience',
    'Actors, rooms, presence, memory, and autonomy become available when the domain needs a living world.',
  ],
] as const;

const domainLayers = [
  ['Entities', 'Things with identity, lifecycle, permissions, and meaning inside the domain.'],
  ['Relations', 'Connections that make the system navigable as a graph, not a pile of tables.'],
  ['Operations', 'Queries, commands, and streams named as domain actions rather than raw endpoints.'],
  ['Events', 'Facts that preserve what happened and make change observable.'],
  ['Policies', 'Rules for authority, visibility, invariants, and allowed transitions.'],
  ['Tasks', 'Durable work that can run, retry, pause, resume, and leave evidence.'],
  ['Resources', 'Cost, capacity, quotas, and scale modeled explicitly when they matter.'],
] as const;

const experienceLayers = [
  ['Actors', 'Autonomous entities with memory, goals, capabilities, and boundaries.'],
  ['Rooms & Presence', 'Spaces where humans and agents enter, coordinate, observe, and leave traces.'],
  ['Autonomy', 'Actions can be delegated without losing policy, history, or accountability.'],
  ['Living Worlds', 'The domain can keep running, adapting, and accumulating context over time.'],
] as const;

const usageModes = [
  ['Application', 'Use Ontahí to name a traditional product domain with clearer contracts.'],
  ['Workflow', 'Add durable tasks, policies, and resources when the system outgrows request/response.'],
  ['Experience', 'Introduce actors and presence when the domain becomes shared, autonomous, or persistent.'],
] as const;

const ecosystem = [
  ['Atlas', 'Design and planning of experiences.'],
  ['Ontahí', 'Runtime for living domains.'],
  ['BookOps', 'Documentation and knowledge.'],
] as const;

export default function HomePage() {
  return (
    <main>
      <section className="hero" aria-labelledby="hero-title">
        <header className="site-header" aria-label="Ontahi">
          <a className="brand-mark" href="/" aria-label="Ontahi home">
            <Image src="/brand/ontahi-symbol.svg" width={34} height={34} alt="" priority />
            <span>Ontahí</span>
          </a>
          <nav className="site-nav" aria-label="Primary">
            <a href={essayUrl}>Essay</a>
            <a href={repoUrl}>GitHub</a>
          </nav>
        </header>

        <div className="hero-grid">
          <div className="hero-copy">
            <p className="eyebrow">Coming soon</p>
            <h1 id="hero-title">Ontahí</h1>
            <p className="lede">Executable domains, from applications to living experiences.</p>
            <p className="support">
              Ontahí starts as a framework for modeling domains with entities, operations,
              relations, policies, and events. Actors and experiences are a further layer,
              not a requirement.
            </p>
          </div>

          <aside className="experience-panel" aria-label="Ontahi adoption path">
            <div className="panel-topline">
              <span>adoption path</span>
              <span>v0.2</span>
            </div>

            <div className="adoption-path">
              {adoptionLayers.map(([title, text], index) => (
                <div className="adoption-layer" key={title}>
                  <span>{String(index + 1).padStart(2, '0')}</span>
                  <strong>{title}</strong>
                  <span>{text}</span>
                </div>
              ))}
            </div>

            <p className="formula">Start with the domain. Add life only where life belongs.</p>
          </aside>
        </div>
      </section>

      <section className="essay-section" aria-labelledby="essay-title">
        <div className="essay-inner">
          <div className="essay-illustration" aria-hidden="true">
            <Image
              src="/living-systems/why-systems-evolve.png"
              width={768}
              height={1370}
              alt=""
              priority
            />
          </div>

          <div className="essay-copy">
            <p className="eyebrow">Living Systems</p>
            <h2 id="essay-title">To build a system is to enter a long conversation with change.</h2>
            <p>
              The first Ontahí essay starts before frameworks and actors. It asks why systems
              evolve, how requirements reveal hidden dimensions, and what it means for a model
              to change without losing itself.
            </p>
            <a className="text-link" href={essayUrl}>
              Read Why Systems Evolve
            </a>
          </div>
        </div>
      </section>

      <section className="runtime-section" aria-labelledby="runtime-title">
        <div className="section-inner runtime-inner">
          <div className="section-copy">
            <p className="eyebrow">Core model</p>
            <h2 id="runtime-title">A small application can still deserve an ontology.</h2>
            <p>
              Ontahí 1.0 is useful before autonomy enters the picture. A domain becomes
              easier to build when its names, boundaries, transitions, and history are explicit.
            </p>
          </div>

          <div className="layer-stack" aria-label="Ontahi runtime architecture">
            {domainLayers.map(([title, text], index) => (
              <article className="layer-row" key={title}>
                <span>{String(index + 1).padStart(2, '0')}</span>
                <h3>{title}</h3>
                <p>{text}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="principles-section" aria-labelledby="principles-title">
        <div className="section-inner principles-inner">
          <div className="section-copy">
            <p className="eyebrow">Experience layer</p>
            <h2 id="principles-title">Autonomy is a layer, not the entry fee.</h2>
            <p>
              Some domains need actors with memory, presence, goals, resource budgets, and
              observable behavior. Others only need a better way to name and execute the domain.
            </p>
          </div>

          <ol className="principles-list">
            {experienceLayers.map(([title, text]) => (
              <li key={title}>
                <strong>{title}</strong>
                <span>{text}</span>
              </li>
            ))}
          </ol>
        </div>

        <div className="ecosystem-strip" aria-label="Ways to use Ontahi">
          {usageModes.map(([title, text]) => (
            <article key={title}>
              <strong>{title}</strong>
              <span>{text}</span>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
