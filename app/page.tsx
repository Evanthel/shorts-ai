import Link from "next/link";
import { RunningDemo } from "@/features/recommendation/running-demo";
import { HeroWeatherVisual } from "@/features/weather/hero-weather-visual";

const systemSignals = [
  {
    label: "01",
    title: "Forecast window",
    body: "ShortsAI compares start, finish, and return-home conditions instead of using one static weather snapshot.",
    meta: "Temperature, feels-like, wind, rain, humidity, UV",
  },
  {
    label: "02",
    title: "Activity load",
    body: "Running, walking, and everyday plans are treated differently, so body heat and duration do not distort every recommendation.",
    meta: "Mode, intensity, duration, return time",
  },
  {
    label: "03",
    title: "Comfort memory",
    body: "Feedback adjusts the next recommendation toward how the user actually feels outside.",
    meta: "Starter profile, saved offset, feedback count",
  },
  {
    label: "04",
    title: "Risk layer",
    body: "The engine flags conditions that usually break outfit plans: colder returns, rain, wind, heat, and low visibility.",
    meta: "Warnings before explanation",
  },
];

const aiLayers = [
  {
    title: "Rules lock the outfit first",
    body: "The app chooses clothing from structured weather, activity, and profile inputs before any language model is called.",
    tag: "Deterministic",
  },
  {
    title: "AI explains, not decides",
    body: "OpenRouter receives the final recommendation and facts, then turns them into a short explanation without changing items.",
    tag: "Guardrailed",
  },
  {
    title: "Fallback keeps it usable",
    body: "If the AI key is missing or the request fails, the app still generates a plain explanation from the same facts.",
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
          <span className="nav-kicker">Weather intelligence for runners</span>
          <nav>
            <a href="#run-planner">Planner</a>
            <a href="#system-signals">Signals</a>
            <a href="#ai-angle">AI</a>
          </nav>
        </header>

        <div className="hero-grid">
          <div className="hero-copy-block">
            <h1>ShortsAI</h1>
            <h2>Weather-aware outfit planning for your next run.</h2>
            <p className="hero-copy">
              Live forecast data, return-home conditions, and personal comfort
              feedback become one clear clothing recommendation.
            </p>
            <div className="hero-actions">
              <a href="#run-planner" className="button button-primary">
                Plan a run
              </a>
              <a href="#ai-angle" className="button button-secondary">
                How the AI works
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
            <p className="eyebrow">System signals</p>
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
          <p className="eyebrow">AI angle</p>
          <h2>The model is useful because it has a narrow job.</h2>
          <p>
            Outfit decisions stay deterministic. AI only explains the result in
            user language, with the activity mode and profile context included.
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
