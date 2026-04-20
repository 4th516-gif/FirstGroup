export function OnboardingPage() {
  return (
    <div className="page">
      <h1 className="page__title">Onboarding</h1>
      <p className="page__lead">
        Name, <code>.edu</code> email, sport, roster match, and squat 1RM will
        live here. Stevenson roster data will auto-fill height, weight, and
        position.
      </p>
      <form className="form-shell" onSubmit={(e) => e.preventDefault()}>
        <label className="field">
          <span className="field__label">Full name</span>
          <input type="text" name="name" placeholder="Jane Athlete" disabled />
        </label>
        <label className="field">
          <span className="field__label">School email</span>
          <input
            type="email"
            name="email"
            placeholder="you@stevenson.edu"
            disabled
          />
        </label>
        <p className="text-muted form-shell__note">
          Form wiring comes next; fields are disabled in the shell.
        </p>
      </form>
    </div>
  )
}
