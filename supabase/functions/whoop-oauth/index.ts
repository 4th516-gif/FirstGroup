// ============================================================
//  WHOOP OAuth Callback — Supabase Edge Function
//  Handles /auth/whoop/callback, exchanges code for tokens,
//  stores in wearable_connections table
//  Deploy: supabase functions deploy whoop-oauth --no-verify-jwt
// ============================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const WHOOP_CLIENT_ID = Deno.env.get('WHOOP_CLIENT_ID')!        // 47f70a90-26dd-4885-926d-bd9256724d73
const WHOOP_CLIENT_SECRET = Deno.env.get('WHOOP_CLIENT_SECRET')!
const SITE_URL = Deno.env.get('SITE_URL') ?? 'https://stonebound.netlify.app'

const WHOOP_TOKEN_URL = 'https://api.prod.whoop.com/oauth/oauth2/token'
const WHOOP_PROFILE_URL = 'https://api.prod.whoop.com/developer/v1/activity/profile'

Deno.serve(async (req: Request) => {
  const url = new URL(req.url)
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state') // athlete_id passed as state
  const error = url.searchParams.get('error')

  // WHOOP denied access
  if (error) {
    console.error('WHOOP OAuth error:', error)
    return Response.redirect(`${SITE_URL}/stonebound-athlete-profile.html?whoop=denied`, 302)
  }

  if (!code || !state) {
    return new Response('Missing code or state', { status: 400 })
  }

  // Exchange authorization code for tokens
  const tokenRes = await fetch(WHOOP_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      client_id: WHOOP_CLIENT_ID,
      client_secret: WHOOP_CLIENT_SECRET,
      redirect_uri: `${SITE_URL}/auth/whoop/callback`,
    }),
  })

  if (!tokenRes.ok) {
    const errText = await tokenRes.text()
    console.error('Token exchange failed:', errText)
    return Response.redirect(`${SITE_URL}/stonebound-athlete-profile.html?whoop=error`, 302)
  }

  const tokens = await tokenRes.json() as {
    access_token: string
    refresh_token: string
    expires_in: number
  }

  // Fetch WHOOP profile to get their user_id (used as device_label)
  const profileRes = await fetch(WHOOP_PROFILE_URL, {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  })

  let whoopUserId = 'unknown'
  if (profileRes.ok) {
    const profile = await profileRes.json() as { user_id?: number }
    whoopUserId = String(profile.user_id ?? 'unknown')
  }

  const tokenExpiresAt = new Date(
    Date.now() + tokens.expires_in * 1000
  ).toISOString()

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

  // Upsert into wearable_connections
  const { error: dbError } = await supabase
    .from('wearable_connections')
    .upsert(
      {
        athlete_id: state, // athlete profile UUID passed as OAuth state
        device_type: 'whoop',
        device_label: whoopUserId,
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        token_expires_at: tokenExpiresAt,
        last_synced_at: new Date().toISOString(),
        is_active: true,
        created_at: new Date().toISOString(),
      },
      { onConflict: 'athlete_id,device_type' }
    )

  if (dbError) {
    console.error('DB error saving WHOOP connection:', dbError.message)
    return Response.redirect(`${SITE_URL}/stonebound-athlete-profile.html?whoop=error`, 302)
  }

  console.log(`WHOOP connected for athlete ${state}, WHOOP user ${whoopUserId}`)

  // Redirect back to athlete profile with success flag
  return Response.redirect(
    `${SITE_URL}/stonebound-athlete-profile.html?whoop=connected`,
    302
  )
})
