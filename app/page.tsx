import Link from "next/link";
import { RunningDemo } from "@/features/recommendation/running-demo";
import { HeroWeatherVisual } from "@/features/weather/hero-weather-visual";

const systemSignals = [
  {
    label: "Start",
    title: "Forecast window",
    body: "ShortsAI compares start, finish, and return-home conditions instead of using one static weather snapshot.",
    meta: "Temperature, feels-like, wind, rain, humidity, UV",
  },
  {
    label: "Load",
    title: "Activity load",
    body: "Running, walking, and commute subtypes are treated differently, so body heat and outdoor exposure do not distort every recommendation.",
    meta: "Mode, intensity, commute type, exposure, return time",
  },
  {
    label: "Memory",
    title: "Comfort memory",
    body: "Post-activity feedback updates only the matching run, walk, or commute context.",
    meta: "Context offset, actual wear, changes, problem areas",
  },
  {
    label: "Risk",
    title: "Safety policy",
    body: "Cold, rain, wind, heat, and visibility are checked separately before any candidate is ranked.",
    meta: "Required items stay in every safe variant",
  },
];

const aiLayers = [
  {
    title: "Rules create safe choices first",
    body: "The app creates lighter, standard, and warmer candidates, then applies required safety items before ranking.",
    tag: "Safety-first",
  },
  {
    title: "AI classifies, rules recalculate",
    body: "OpenRouter returns a structured intent only. ShortsAI handles any permitted adjustment and writes the explanation.",
    tag: "Structured",
  },
  {
    title: "Fallback keeps it usable",
    body: "If the API, model artifact, or language service fails, the same local safety rules still return a recommendation.",
    tag: "Resilient",
  },
];

export default function Home() {
  return (
    <main className="min-h-dvh overflow-hidden">
      <section className="hero-shell">
        <header className="hero-nav" aria-label="Primary navigation">
          <a href="#" className="wordmark">
            ShortsAI
          </a>
          <span className="nav-kicker">Weather intelligence for active plans</span>
          <nav>
            <a href="#run-planner">Planner</a>
            <a href="#system-signals">Signals</a>
            <a href="#ai-angle">AI</a>
          </nav>
        </header>

        <div className="hero-grid">
          <div className="hero-copy-block">
            <h1>ShortsAI</h1>
            <h2>Plan what to wear before the weather changes.</h2>
            <p className="hero-copy">
              Live forecast timing, activity load, and comfort memory become
              a few safe clothing choices.
            </p>
            <div className="hero-actions">
              <a href="#run-planner" className="button button-primary">
                Plan an activity
              </a>
              <a href="#ai-angle" className="button button-secondary">
                How AI helps
              </a>
            </div>
          </div>

          <HeroWeatherVisual />
        </div>
      </section>

      <RunningDemo />

      <section id="system-signals" className="content-section signal-section">
        <div className="section-header">
          <div>
            <h2>Built around the moments where outfit plans fail.</h2>
          </div>
          <p>
            The recommendation is assembled from a small set of signals that
            matter before, during, and after the activity.
          </p>
        </div>

        <div className="signal-layout">
          <div className="signal-rail">
            {systemSignals.map((signal) => (
              <article key={signal.title} className="signal-step">
                <span>{signal.label}</span>
                <div>
                  <h3>{signal.title}</h3>
                  <p>{signal.body}</p>
                  <small>{signal.meta}</small>
                </div>
              </article>
            ))}
          </div>

          <aside className="signal-snapshot" aria-label="Recommendation signal snapshot">
            <div className="snapshot-topline">
              <span>Decision stack</span>
              <strong>Live</strong>
            </div>
            <div className="snapshot-scale">
              <span>Start</span>
              <span>Finish</span>
              <span>Return</span>
            </div>
            <div className="snapshot-orbit">
              <span className="orbit-dot dot-start" />
              <span className="orbit-dot dot-finish" />
              <span className="orbit-dot dot-return" />
            </div>
            <div className="snapshot-callout">
              <strong>Return feels colder</strong>
              <p>Add the layer after the activity, not during the main effort.</p>
            </div>
          </aside>
        </div>
      </section>

      <section id="ai-angle" className="content-section ai-section">
        <div className="ai-statement">
          <h2>Every model has a narrow job.</h2>
          <p>
            Safety stays rule-based. A sufficiently trained first-party ranker may
            order safe candidates, while language AI only classifies a follow-up.
          </p>
        </div>

        <div className="ai-layer-list">
          {aiLayers.map((layer) => (
            <article key={layer.title} className="ai-layer">
              <span>{layer.tag}</span>
              <h3>{layer.title}</h3>
              <p>{layer.body}</p>
            </article>
          ))}
        </div>
      </section>

      <footer className="site-footer">
        <span>ShortsAI</span>
        <Link href="/privacy">Privacy</Link>
        <Link href="/terms">Terms</Link>
      </footer>
    </main>
  );
}
