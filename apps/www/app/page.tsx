import Image from 'next/image';

const essayUrl =
  'https://bookops.net/ontahi-library-01-living-systems/living-systems/why-systems-evolve';
const repoUrl = 'https://github.com/javifernandes/ontahi';
const licenseUrl = `${repoUrl}/blob/main/LICENSE`;

const adoptionLayers = [
  [
    'Domain',
    'Entities, relations, operations, policies, and events give ordinary applications a precise executable ontology.',
  ],
  [
    'Execution',
    'When time matters, an invocation becomes a durable execution with identity, emissions, usage, and history.',
  ],
  [
    'Autonomy',
    'Policies, resources, and interchangeable implementations let entities act without introducing an Actor primitive.',
  ],
] as const;

const domainLayers = [
  ['Entities', 'Things with identity, lifecycle, permissions, and meaning inside the domain.'],
  ['Relations', 'Connections that make the system navigable as a graph, not a pile of tables.'],
  ['Operations', 'Possible transformations, named as domain actions rather than raw endpoints.'],
  ['Events', 'Facts that preserve what happened and make change observable.'],
  ['Executions', 'Invocations that happen in time, with identity, status, result, and history.'],
  ['Emissions', 'Values produced while an execution advances toward its final result.'],
  ['Resources', 'Cost, capacity, quotas, and scale modeled explicitly when they matter.'],
  ['Policies', 'Rules for admission, authority, limits, priority, and implementation choice.'],
] as const;

const autonomyCapacities = [
  ['Identity & memory', 'An entity carries state, context, and history across many executions.'],
  ['Operations', 'Its capabilities are operations, or useful views over related operations.'],
  [
    'Executions',
    'Work can persist, stream values, retry, cancel, and remain observable over time.',
  ],
  [
    'Resources & policies',
    'Availability, budgets, limits, priorities, and implementations stay explicit.',
  ],
] as const;

const usageModes = [
  [
    'Application',
    'Model a traditional product domain, from a to-do list upward, with clearer contracts.',
  ],
  [
    'Durable computation',
    'Give long-running operations identity, emissions, resource usage, and history.',
  ],
  [
    'Autonomous system',
    'Let domain entities act over time when policies and capacities make that useful.',
  ],
] as const;

export default function HomePage() {
  return (
    <>
      <main>
        <section className='hero' aria-labelledby='hero-title'>
          <header className='site-header' aria-label='Ontahi'>
            <a className='brand-mark' href='/' aria-label='Ontahi home'>
              <Image src='/brand/ontahi-symbol.svg' width={34} height={34} alt='' priority />
              <span>Ontahí</span>
            </a>
            <nav className='site-nav' aria-label='Primary'>
              <a href={essayUrl}>Essay</a>
              <a href={repoUrl}>GitHub</a>
            </nav>
          </header>

          <div className='hero-grid'>
            <div className='hero-copy'>
              <p className='eyebrow'>Coming soon</p>
              <h1 id='hero-title'>Ontahí</h1>
              <p className='lede'>Executable domains, from everyday apps to autonomous systems.</p>
              <p className='support'>
                Ontahí models software through entities, relations, operations, policies, and
                events. When work needs time, resources, or autonomy, the same model grows into
                durable, observable executions. No special Actor primitive required.
              </p>
            </div>

            <aside className='experience-panel' aria-label='Ontahi adoption path'>
              <div className='panel-topline'>
                <span>adoption path</span>
                <span>v0.2</span>
              </div>

              <div className='adoption-path'>
                {adoptionLayers.map(([title, text], index) => (
                  <div className='adoption-layer' key={title}>
                    <span>{String(index + 1).padStart(2, '0')}</span>
                    <strong>{title}</strong>
                    <span>{text}</span>
                  </div>
                ))}
              </div>

              <p className='formula'>Ontahí provides the grammar. The domain provides the names.</p>
            </aside>
          </div>
        </section>

        <section className='essay-section' aria-labelledby='essay-title'>
          <div className='essay-inner'>
            <div className='essay-illustration' aria-hidden='true'>
              <Image
                src='/living-systems/why-systems-evolve.png'
                width={768}
                height={1370}
                alt=''
                priority
              />
            </div>

            <div className='essay-copy'>
              <p className='eyebrow'>Living Systems</p>
              <h2 id='essay-title'>
                To build a system is to enter a long conversation with change.
              </h2>
              <p>
                The first Ontahí essay starts before frameworks and actors. It asks why systems
                evolve, how requirements reveal hidden dimensions, and what it means for a model to
                change without losing itself.
              </p>
              <a className='text-link' href={essayUrl}>
                Read Why Systems Evolve
              </a>
            </div>
          </div>
        </section>

        <section className='runtime-section' aria-labelledby='runtime-title'>
          <div className='section-inner runtime-inner'>
            <div className='section-copy'>
              <p className='eyebrow'>Core model</p>
              <h2 id='runtime-title'>A small application can still deserve an ontology.</h2>
              <p>
                Ontahí is useful before autonomy enters the picture. A domain becomes easier to
                build when its names, boundaries, transformations, and history are explicit.
              </p>
            </div>

            <div className='layer-stack' aria-label='Ontahi runtime architecture'>
              {domainLayers.map(([title, text], index) => (
                <article className='layer-row' key={title}>
                  <span>{String(index + 1).padStart(2, '0')}</span>
                  <h3>{title}</h3>
                  <p>{text}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className='principles-section' aria-labelledby='principles-title'>
          <div className='section-inner principles-inner'>
            <div className='section-copy'>
              <p className='eyebrow'>Emergent autonomy</p>
              <h2 id='principles-title'>An actor is not a new kind of thing.</h2>
              <p>
                Autonomous behavior emerges when an entity has operations whose executions can be
                scheduled, observed, limited, and resolved over time. Some domains need this. Many
                only need a better way to name and execute their domain.
              </p>
            </div>

            <ol className='principles-list'>
              {autonomyCapacities.map(([title, text]) => (
                <li key={title}>
                  <strong>{title}</strong>
                  <span>{text}</span>
                </li>
              ))}
            </ol>
          </div>

          <div className='ecosystem-strip' aria-label='Ways to use Ontahi'>
            {usageModes.map(([title, text]) => (
              <article key={title}>
                <strong>{title}</strong>
                <span>{text}</span>
              </article>
            ))}
          </div>
        </section>
      </main>

      <footer className='site-footer'>
        <div className='footer-inner'>
          <p>© 2026 Javier Fernandes and Ontahí contributors.</p>
          <p>
            Source code licensed under the <a href={licenseUrl}>Apache License 2.0</a>.
          </p>
        </div>
      </footer>
    </>
  );
}
