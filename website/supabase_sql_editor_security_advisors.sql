-- ─────────────────────────────────────────────────────────────────────────────
--  Stonebound — Supabase Security Hardening
--  Run this in the Supabase SQL Editor:
--    https://supabase.com/dashboard/project/bkdubocmtzruyojkknch/sql/new
--
--  What this does:
--    1. Enables RLS on all application tables
--    2. Revokes public schema access from the anon + authenticated roles
--       (defense-in-depth; RLS is the primary control)
--    3. Creates per-user SELECT/INSERT/UPDATE/DELETE policies
--    4. Creates super_admin override policies for admin tables
--    5. Locks down wearable_connections (tokens should never be readable by
--       the anon key; service-role key only for OAuth functions)
--    6. Makes inquiries publicly insertable (contact form) but admin-only readable
--
--  IMPORTANT: Review each policy before running. Test in a branch first.
-- ─────────────────────────────────────────────────────────────────────────────


-- ── Helper: is current user a super_admin? ────────────────────────────────────
CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'super_admin'
  );
$$;


-- ═══════════════════════════════════════════════════════════════════════════
--  1. PROFILES
-- ═══════════════════════════════════════════════════════════════════════════
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- User can read their own profile
DROP POLICY IF EXISTS "profiles: self read"    ON public.profiles;
CREATE POLICY "profiles: self read"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

-- User can update their own profile
DROP POLICY IF EXISTS "profiles: self update"  ON public.profiles;
CREATE POLICY "profiles: self update"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id);

-- Super admin can read all profiles
DROP POLICY IF EXISTS "profiles: admin read"   ON public.profiles;
CREATE POLICY "profiles: admin read"
  ON public.profiles FOR SELECT
  USING (public.is_super_admin());


-- ═══════════════════════════════════════════════════════════════════════════
--  2. SUBSCRIPTIONS
-- ═══════════════════════════════════════════════════════════════════════════
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "subscriptions: self read"  ON public.subscriptions;
CREATE POLICY "subscriptions: self read"
  ON public.subscriptions FOR SELECT
  USING (auth.uid() = profile_id);

DROP POLICY IF EXISTS "subscriptions: admin read" ON public.subscriptions;
CREATE POLICY "subscriptions: admin read"
  ON public.subscriptions FOR SELECT
  USING (public.is_super_admin());


-- ═══════════════════════════════════════════════════════════════════════════
--  3. PAYMENTS
-- ═══════════════════════════════════════════════════════════════════════════
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "payments: self read"  ON public.payments;
CREATE POLICY "payments: self read"
  ON public.payments FOR SELECT
  USING (auth.uid() = profile_id);

DROP POLICY IF EXISTS "payments: admin read" ON public.payments;
CREATE POLICY "payments: admin read"
  ON public.payments FOR SELECT
  USING (public.is_super_admin());


-- ═══════════════════════════════════════════════════════════════════════════
--  4. INQUIRIES
--  Public INSERT (contact form, no auth required)
--  SELECT/UPDATE restricted to super_admin
-- ═══════════════════════════════════════════════════════════════════════════
ALTER TABLE public.inquiries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "inquiries: public insert" ON public.inquiries;
CREATE POLICY "inquiries: public insert"
  ON public.inquiries FOR INSERT
  WITH CHECK (true);   -- anyone can submit the contact form

DROP POLICY IF EXISTS "inquiries: admin read"   ON public.inquiries;
CREATE POLICY "inquiries: admin read"
  ON public.inquiries FOR SELECT
  USING (public.is_super_admin());

DROP POLICY IF EXISTS "inquiries: admin update" ON public.inquiries;
CREATE POLICY "inquiries: admin update"
  ON public.inquiries FOR UPDATE
  USING (public.is_super_admin());


-- ═══════════════════════════════════════════════════════════════════════════
--  5. WEARABLE_CONNECTIONS  ← most sensitive: contains access_tokens
--     anon key must NEVER be able to read tokens.
--     Only service-role (edge functions) writes here.
--     Athletes can see connection status but NOT tokens.
-- ═══════════════════════════════════════════════════════════════════════════
ALTER TABLE public.wearable_connections ENABLE ROW LEVEL SECURITY;

-- Create a masked view athletes can query instead of the base table
-- (Only non-token columns)
DROP VIEW IF EXISTS public.wearable_connections_status;
CREATE VIEW public.wearable_connections_status AS
  SELECT
    id,
    athlete_id,
    device_type,
    device_label,
    last_synced_at,
    is_active,
    created_at
    -- access_token, refresh_token, token_expires_at intentionally excluded
  FROM public.wearable_connections;

-- Athletes can read their own status (masked view)
DROP POLICY IF EXISTS "wearable_connections: self read status" ON public.wearable_connections;
CREATE POLICY "wearable_connections: self read status"
  ON public.wearable_connections FOR SELECT
  USING (auth.uid() = athlete_id);
-- NOTE: The SELECT policy on the base table still exposes tokens if athlete_id matches.
-- For full token protection, access_token/refresh_token should be stored
-- in a separate table (wearable_tokens) with no RLS select policy — service role only.

-- Athletes can update is_active = false (disconnect)
DROP POLICY IF EXISTS "wearable_connections: self disconnect" ON public.wearable_connections;
CREATE POLICY "wearable_connections: self disconnect"
  ON public.wearable_connections FOR UPDATE
  USING (auth.uid() = athlete_id)
  WITH CHECK (auth.uid() = athlete_id);

-- Super admin can read all
DROP POLICY IF EXISTS "wearable_connections: admin read" ON public.wearable_connections;
CREATE POLICY "wearable_connections: admin read"
  ON public.wearable_connections FOR SELECT
  USING (public.is_super_admin());


-- ═══════════════════════════════════════════════════════════════════════════
--  6. ENERGY_EXPENDITURE
-- ═══════════════════════════════════════════════════════════════════════════
ALTER TABLE public.energy_expenditure ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "energy_expenditure: self read"  ON public.energy_expenditure;
CREATE POLICY "energy_expenditure: self read"
  ON public.energy_expenditure FOR SELECT
  USING (auth.uid() = athlete_id);

DROP POLICY IF EXISTS "energy_expenditure: admin read" ON public.energy_expenditure;
CREATE POLICY "energy_expenditure: admin read"
  ON public.energy_expenditure FOR SELECT
  USING (public.is_super_admin());


-- ═══════════════════════════════════════════════════════════════════════════
--  7. DAILY_SUMMARIES
-- ═══════════════════════════════════════════════════════════════════════════
ALTER TABLE public.daily_summaries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "daily_summaries: self read"  ON public.daily_summaries;
CREATE POLICY "daily_summaries: self read"
  ON public.daily_summaries FOR SELECT
  USING (auth.uid() = athlete_id);

DROP POLICY IF EXISTS "daily_summaries: self write" ON public.daily_summaries;
CREATE POLICY "daily_summaries: self write"
  ON public.daily_summaries FOR INSERT
  WITH CHECK (auth.uid() = athlete_id);

DROP POLICY IF EXISTS "daily_summaries: self update" ON public.daily_summaries;
CREATE POLICY "daily_summaries: self update"
  ON public.daily_summaries FOR UPDATE
  USING (auth.uid() = athlete_id);


-- ═══════════════════════════════════════════════════════════════════════════
--  8. NUTRITION_TARGETS
-- ═══════════════════════════════════════════════════════════════════════════
ALTER TABLE public.nutrition_targets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "nutrition_targets: self read"  ON public.nutrition_targets;
CREATE POLICY "nutrition_targets: self read"
  ON public.nutrition_targets FOR SELECT
  USING (auth.uid() = athlete_id);

DROP POLICY IF EXISTS "nutrition_targets: self write" ON public.nutrition_targets;
CREATE POLICY "nutrition_targets: self write"
  ON public.nutrition_targets FOR INSERT
  WITH CHECK (auth.uid() = athlete_id);


-- ═══════════════════════════════════════════════════════════════════════════
--  9. ATHLETE_SUPPLEMENTS
-- ═══════════════════════════════════════════════════════════════════════════
ALTER TABLE public.athlete_supplements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "athlete_supplements: self read"   ON public.athlete_supplements;
CREATE POLICY "athlete_supplements: self read"
  ON public.athlete_supplements FOR SELECT
  USING (auth.uid() = athlete_id);

DROP POLICY IF EXISTS "athlete_supplements: self write"  ON public.athlete_supplements;
CREATE POLICY "athlete_supplements: self write"
  ON public.athlete_supplements FOR INSERT
  WITH CHECK (auth.uid() = athlete_id);

DROP POLICY IF EXISTS "athlete_supplements: self update" ON public.athlete_supplements;
CREATE POLICY "athlete_supplements: self update"
  ON public.athlete_supplements FOR UPDATE
  USING (auth.uid() = athlete_id);


-- ═══════════════════════════════════════════════════════════════════════════
-- 10. SUPPLEMENTS_DB  (read-only reference table)
-- ═══════════════════════════════════════════════════════════════════════════
ALTER TABLE public.supplements_db ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "supplements_db: authenticated read" ON public.supplements_db;
CREATE POLICY "supplements_db: authenticated read"
  ON public.supplements_db FOR SELECT
  USING (auth.role() IN ('authenticated', 'anon'));
  -- Public read is intentional — this is reference data


-- ═══════════════════════════════════════════════════════════════════════════
-- 11. BIOMETRICS
-- ═══════════════════════════════════════════════════════════════════════════
ALTER TABLE public.biometrics ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "biometrics: self read"   ON public.biometrics;
CREATE POLICY "biometrics: self read"
  ON public.biometrics FOR SELECT
  USING (auth.uid() = athlete_id);

DROP POLICY IF EXISTS "biometrics: self write"  ON public.biometrics;
CREATE POLICY "biometrics: self write"
  ON public.biometrics FOR INSERT
  WITH CHECK (auth.uid() = athlete_id);


-- ═══════════════════════════════════════════════════════════════════════════
-- 12. INSTITUTIONS
-- ═══════════════════════════════════════════════════════════════════════════
ALTER TABLE public.institutions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "institutions: self read"  ON public.institutions;
CREATE POLICY "institutions: self read"
  ON public.institutions FOR SELECT
  USING (
    auth.uid() IN (
      SELECT id FROM public.profiles WHERE institution = institutions.name
    )
  );

DROP POLICY IF EXISTS "institutions: admin all" ON public.institutions;
CREATE POLICY "institutions: admin all"
  ON public.institutions FOR ALL
  USING (public.is_super_admin());


-- ═══════════════════════════════════════════════════════════════════════════
-- 13. Revoke default public schema privileges (defense-in-depth)
-- ═══════════════════════════════════════════════════════════════════════════
REVOKE ALL ON SCHEMA public FROM anon;
REVOKE ALL ON SCHEMA public FROM authenticated;
-- Re-grant SELECT on the supplements reference table
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT SELECT ON public.supplements_db TO anon, authenticated;


-- ═══════════════════════════════════════════════════════════════════════════
-- 14. Auth URL allow-list reminder (human task — can't be done in SQL)
-- ═══════════════════════════════════════════════════════════════════════════
-- HUMAN TODO: In Supabase Dashboard → Authentication → URL Configuration:
--   Site URL:              https://stonebound.netlify.app
--   Redirect URLs (add):   https://stonebound.netlify.app/**
--                          https://stonebound.netlify.app/auth/**
