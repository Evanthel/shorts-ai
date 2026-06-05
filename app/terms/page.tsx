import Link from "next/link";

export default function TermsPage() {
  return (
    <main className="legal-page">
      <Link href="/" className="wordmark">
        ShortsAI
      </Link>
      <section>
        <p className="eyebrow">Terms</p>
        <h1>ShortsAI is planning support, not safety-critical advice.</h1>
        <p>
          Use recommendations as practical guidance and adjust for your own
          comfort, health, route, and local conditions.
        </p>
        <h2>Weather and recommendations</h2>
        <p>
          Forecast data can be incomplete or delayed. Clothing recommendations
          are generated from available signals and may not match every person or
          situation.
        </p>
        <h2>Account features</h2>
        <p>
          Magic-link sign-in lets the app save profile memory, feedback,
          favourite locations, and recent recommendation history.
        </p>
        <h2>AI usage</h2>
        <p>
          AI explanations are limited and may fall back to deterministic text
          when the service is unavailable or usage limits are reached.
        </p>
      </section>
    </main>
  );
}
