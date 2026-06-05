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
          useful.
        </p>
        <h2>Data we use</h2>
        <p>
          The app may store your email identifier through magic-link auth, saved
          profile settings, feedback labels, favourite locations, weather
          snapshots, recommendation history, and AI explanation metadata.
        </p>
        <h2>AI explanations</h2>
        <p>
          AI receives structured weather, activity, profile, and recommendation
          facts. It should explain the outfit decision, not create a new one.
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
