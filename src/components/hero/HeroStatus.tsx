export default function HeroStatus({ ready }: { ready: boolean }) { return <p className={`hero-status ${ready ? "is-ready" : ""}`} aria-live="polite">booting…</p>; }
