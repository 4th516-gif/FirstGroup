// ============================================================
//  Polar OAuth Callback — Supabase Edge Function
//  Handles /auth/polar/callback, exchanges code for tokens,
//  stores in wearable_connections table
//  Deploy: supabase functions deploy polar-oauth --no-verify-jwt
// ============================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const POLAR_CLIENT_ID = Deno.env.get('POLAR_CLIENT_ID')!         // e45c4048-9a86-4878-b5bb-5ff897c8188c
const POLAR_CLIENT_SECRET = Deno.env.get('POLAR_CLIENT_SECRET')! // ac16b6cc-d315-4369-af65-b0b103934933
const SITE_URL = Deno.env.get('SITE_URL') ?? 'https://stonebound.netlify.app'

const POLAR_TOKEN_URL = 'https://polarremote.com/v2/oauth2/token'
const POLAR_USER_URL = 'https://www.polaraccesslink.com/v3/users'

Deno.serve(async (req: Request) => {
  const url = new URL(req.url)
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state') // athlete_id passed as state
  const error = url.searchParams.get('error')

  if (error) {
    console.error('Polar OAuth error:', error)
    return Response.redirect(`${SITE_URL}/stonebound-athlete-profile.html?polar=denied`, 302)
  }

  if (!code || !state) {
    return new Response('Missing code or state', { status: 400 })
  }

  // Polar requires Basic auth for token exchange
  const credentials = btoa(`${POLAR_CLIENT_ID}:${POLAR_CLIENT_SECRET}`)

  const tokenRes = await fetch(POLAR_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${credentials}`,
      Accept: 'application/json',
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: `${SITE_URL}/auth/polar/callback`,
    }),
  })

  if (!tokenRes.ok) {
    const errText = await tokenRes.text()
    console.error('Polar token exchange failed:', errText)
    return Response.redirect(`${SITE_URL}/stonebound-athlete-profile.html?polar=error`, 302)
  }

  const tokens = await tokenRes.json() as {
    access_token: string
    token_type: string
    x_user_id?: number
    expires_in?: number
  }

  // Polar returns x_user_id in the token response
  const polarUserId = String(tokens.x_user_id ?? 'unknown')

  // Register user with Polar AccessLink API (required first time)
  await fetch(POLAR_USER_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${tokens.access_token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({ 'member-id': state }),
  })
  // 409 Conflict is fine — means user already registered

  const tokenExpiresAt = tokens.expires_in
    ? new Date(Date.now() + tokens.expires_in * 1000).toISOString()
    : null

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

  const { error: dbError } = await supabase
    .from('wearable_connections')
    .upsert(
      {
        athlete_id: state,
        device_type: 'polar',
        device_label: polarUserId,
        access_token: tokens.access_token,
        refresh_token: null, // Polar uses long-lived tokens
        token_expires_at: tokenExpiresAt,
        last_synced_at: new Date().toISOString(),
        is_active: true,
        created_at: new Date().toISOString(),
      },
      { onConflict: 'athlete_id,device_type' }
    )

  if (dbError) {
    console.error('DB error saving Polar connection:', dbError.message)
    return Response.redirect(`${SITE_URL}/stonebound-athlete-profile.html?polar=error`, 302)
  }

  console.log(`Polar connected for athlete ${state}, Polar user ${polarUserId}`)

  return Response.redirect(
    `${SITE_URL}/stonebound-athlete-profile.html?polar=connected`,
    302
  )
})
