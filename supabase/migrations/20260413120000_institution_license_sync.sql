-- Sync institutions.license_used with count of profiles linked to that institution.
-- Demo institution row for PoC (link users via admin or SQL).

CREATE OR REPLACE FUNCTION public.sync_institution_license_used()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  old_inst uuid;
  new_inst uuid;
BEGIN
  IF TG_OP = 'INSERT' THEN
    new_inst := NEW.institution_id;
    IF new_inst IS NOT NULL THEN
      UPDATE public.institutions
      SET license_used = (
        SELECT count(*)::int FROM public.profiles p
        WHERE p.institution_id = new_inst AND p.deleted_at IS NULL
      ),
      updated_at = now()
      WHERE id = new_inst;
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    old_inst := OLD.institution_id;
    new_inst := NEW.institution_id;
    IF old_inst IS DISTINCT FROM new_inst OR OLD.deleted_at IS DISTINCT FROM NEW.deleted_at THEN
      IF old_inst IS NOT NULL THEN
        UPDATE public.institutions
        SET license_used = (
          SELECT count(*)::int FROM public.profiles p
          WHERE p.institution_id = old_inst AND p.deleted_at IS NULL
        ),
        updated_at = now()
        WHERE id = old_inst;
      END IF;
      IF new_inst IS NOT NULL THEN
        UPDATE public.institutions
        SET license_used = (
          SELECT count(*)::int FROM public.profiles p
          WHERE p.institution_id = new_inst AND p.deleted_at IS NULL
        ),
        updated_at = now()
        WHERE id = new_inst;
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    old_inst := OLD.institution_id;
    IF old_inst IS NOT NULL THEN
      UPDATE public.institutions
      SET license_used = (
        SELECT count(*)::int FROM public.profiles p
        WHERE p.institution_id = old_inst AND p.deleted_at IS NULL
      ),
      updated_at = now()
      WHERE id = old_inst;
    END IF;
    RETURN OLD;
  END IF;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_profiles_institution_license ON public.profiles;
CREATE TRIGGER trg_profiles_institution_license
  AFTER INSERT OR UPDATE OF institution_id, deleted_at OR DELETE
  ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_institution_license_used();

UPDATE public.institutions i
SET license_used = (
  SELECT count(*)::int FROM public.profiles p
  WHERE p.institution_id = i.id AND p.deleted_at IS NULL
),
updated_at = now();

INSERT INTO public.institutions (
  id, name, short_name, ncaa_division, city, state, country,
  license_type, license_seats, license_used, primary_contact_email
)
VALUES (
  'a0000000-0000-4000-8000-000000000001',
  'Stonebound Demo University',
  'SBDU',
  'D1',
  'Austin',
  'TX',
  'US',
  'institutional',
  50,
  0,
  'demo@stonebound.performance'
)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  short_name = EXCLUDED.short_name,
  license_type = EXCLUDED.license_type,
  license_seats = EXCLUDED.license_seats,
  primary_contact_email = EXCLUDED.primary_contact_email,
  updated_at = now();
