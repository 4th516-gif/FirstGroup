import { Link } from 'react-router-dom'
import { isSupabaseConfigured } from '../lib/supabase'

export function HomePage() {
  const configured = isSupabaseConfigured()

  return (
    <div className="page">
      <h1 className="page__title">Stonebound Speed</h1>
      <p className="page__lead">
        Browser-based velocity and power feedback for the barbell — VBT zones,
        Prilepin-style intensity, and session history. Video processing stays on
        your device.
      </p>
      <div className="card card--highlight">
        <p className="card__label">Next step</p>
        <p>
          Start a <Link to="/session">session</Link> or complete{' '}
          <Link to="/onboarding">onboarding</Link> once roster matching is wired.
        </p>
      </div>
      <p className="page__meta">
        Supabase:{' '}
        {configured ? (
          <span className="text-gold">connected (env loaded)</span>
        ) : (
          <span className="text-muted">
            add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in{' '}
            <code>.env.local</code>
          </span>
        )}
      </p>
    </div>
  )
}
