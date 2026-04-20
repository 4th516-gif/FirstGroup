export function SessionPage() {
  return (
    <div className="page">
      <h1 className="page__title">Session</h1>
      <p className="page__lead">
        Upload a lift video, set load, and analyze reps. TensorFlow.js pose
        tracking and charts will plug in here.
      </p>
      <div className="placeholder-chart" aria-hidden>
        <span>Velocity curve (placeholder)</span>
      </div>
    </div>
  )
}
