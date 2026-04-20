# Stonebound Speed (VeloLift)

Vite + React + TypeScript shell for browser-based barbell velocity and power analysis. Supabase is used for profiles and session data; video processing stays client-side.

## Setup

```bash
npm install
cp .env.example .env.local
# Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY from your Supabase project
npm run dev
```

Open the URL Vite prints (usually `http://localhost:5173`).

## Scripts

| Command   | Description        |
| --------- | ------------------ |
| `npm run dev` | Development server |
| `npm run build` | Production build |
| `npm run preview` | Preview production build |

## Routes (shell)

- `/` — Home
- `/session` — Lift session / analysis (placeholder)
- `/profile` — Power profile charts (Phase 3 placeholder)
- `/onboarding` — Stevenson-style intake (placeholder)
- `/coach` — Coach dashboard (Phase 4 placeholder)

This folder is intended to be pushed to its **own Git repository** (separate from legacy FuelIQ code).
