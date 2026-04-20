export function CoachPage() {
  return (
    <div className="page">
      <h1 className="page__title">Coach dashboard</h1>
      <p className="page__lead">
        View athletes and session logs side by side — Phase 4. Restricted to
        coach role when auth is enabled.
      </p>
      <div className="card">
        <p className="text-muted">No athletes loaded yet.</p>
      </div>
    </div>
  )
}
