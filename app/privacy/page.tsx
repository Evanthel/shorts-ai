import Link from "next/link";

export default function PrivacyPage() {
  return (
    <main className="legal-page">
      <Link href="/" className="wordmark">
        ShortsAI
      </Link>
      <section>
        <p className="eyebrow">Privacy</p>
        <h1>Weather plans need memory, but only the useful parts.</h1>
        <p>
          ShortsAI stores account, profile, feedback, favourite location, and
          recommendation data only to make future clothing recommendations more
          useful and to evaluate first-party recommendation quality.
        </p>
        <h2>Data we use</h2>
        <p>
          The app may store your email identifier through magic-link auth, saved
          profile settings, feedback labels, favourite locations, weather
          snapshots, candidate exposures, recommendation history, outfit acceptance,
          post-activity outcomes, and structured AI intent metadata.
        </p>
        <h2>Services we use</h2>
        <p>
          Open-Meteo provides location and forecast data. Supabase provides
          authentication and user-scoped storage. OpenRouter receives structured
          your current open question only through the server-side explanation endpoint
          so it can classify a permitted intent. Raw question text is not stored or logged.
          Vercel Speed Insights collects web performance telemetry.
        </p>
        <h2>AI explanations</h2>
        <p>
          AI classifies an English follow-up into a strict schema. ShortsAI rules
          recalculate warmer, lighter, or item-avoidance requests and generate the
          displayed explanation. AI cannot remove safety-required items.
        </p>
        <h2>First-party learning data</h2>
        <p>
          Authenticated outcomes may be exported to the pseudonymous SWAOP dataset.
          The export excludes email, exact location, location labels, raw AI questions,
          guest data, and recommendations the user did not follow. Guest pending
          feedback remains on the device and is not used for training.
        </p>
        <h2>Rate limiting</h2>
        <p>
          Explanation requests are rate limited. The server derives a client key
          from forwarded IP headers, stores an HMAC hash of that key with request
          counts and reset times, and avoids storing raw IP addresses for this
          purpose.
        </p>
        <h2>Control</h2>
        <p>
          You can reset profile memory in the app. You can also remove favourite
          locations from the planner.
        </p>
      </section>
    </main>
  );
}
