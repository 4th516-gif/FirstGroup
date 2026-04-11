// ============================================================
//  WHOOP Webhook — Supabase Edge Function
//  Receives WHOOP data pushes and stores in energy_expenditure
//  Deploy: supabase functions deploy whoop-webhook --no-verify-jwt
// ============================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const WHOOP_CLIENT_SECRET = Deno.env.get('WHOOP_CLIENT_SECRET')!

// Verify WHOOP webhook signature using HMAC-SHA256
async function verifyWhoopSignature(
  body: string,
  signatureHeader: string | null
): Promise<boolean> {
  if (!signatureHeader) return false

  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(WHOOP_CLIENT_SECRET),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify']
  )

  // WHOOP sends: "t=timestamp,v1=signature"
  const parts = Object.fromEntries(
    signatureHeader.split(',').map(p => p.split('=') as [string, string])
  )
  const timestamp = parts['t']
  const expectedSig = parts['v1']

  if (!timestamp || !expectedSig) return false

  // Signed payload = timestamp + "." + body
  const signedPayload = `${timestamp}.${body}`
  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    encoder.encode(signedPayload)
  )

  const computedHex = Array.from(new Uint8Array(signature))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')

  return computedHex === expectedSig
}

// Map WHOOP event data into our energy_expenditure schema
function mapWhoopEvent(eventType: string, payload: Record<string, unknown>) {
  const userId = payload['user_id'] as string
  const now = new Date().toISOString()

  switch (eventType) {
    case 'workout.updated':
    case 'workout.deleted': {
      const workout = payload as {
        user_id: string
        start: string
        end: string
        score?: { strain?: number; average_heart_rate?: number; kilojoule?: number }
      }
      const kcal = workout.score?.kilojoule
        ? Math.round(workout.score.kilojoule / 4.184)
        : null
      return {
        athlete_id: null, // resolved below via wearable_connections
        wearable_id: userId,
        recorded_date: workout.start?.split('T')[0] ?? now.split('T')[0],
        recorded_hour: workout.start
          ? new Date(workout.start).getHours()
          : null,
        active_kcal: kcal,
        strain_score: workout.score?.strain ?? null,
        source: 'whoop',
        created_at: now,
      }
    }

    case 'recovery.updated': {
      const recovery = payload as {
        user_id: string
        created_at: string
        score?: {
          recovery_score?: number
          hrv_rmssd_milli?: number
          resting_heart_rate?: number
          sleep_performance_percentage?: number
        }
      }
      return {
        athlete_id: null,
        wearable_id: userId,
        recorded_date: recovery.created_at?.split('T')[0] ?? now.split('T')[0],
        recorded_hour: null,
        recovery_score: recovery.score?.recovery_score ?? null,
        hrv_ms: recovery.score?.hrv_rmssd_milli ?? null,
        resting_hr: recovery.score?.resting_heart_rate ?? null,
        sleep_quality: recovery.score?.sleep_performance_percentage ?? null,
        source: 'whoop',
        created_at: now,
      }
    }

    case 'sleep.updated': {
      const sleep = payload as {
        user_id: string
        start: string
        score?: {
          sleep_performance_percentage?: number
          stage_summary?: { total_in_bed_time_milli?: number }
        }
      }
      const sleepMs = sleep.score?.stage_summary?.total_in_bed_time_milli
      return {
        athlete_id: null,
        wearable_id: userId,
        recorded_date: sleep.start?.split('T')[0] ?? now.split('T')[0],
        recorded_hour: null,
        sleep_hours: sleepMs ? Math.round((sleepMs / 3600000) * 10) / 10 : null,
        sleep_quality: sleep.score?.sleep_performance_percentage ?? null,
        source: 'whoop',
        created_at: now,
      }
    }

    case 'cycle.updated': {
      const cycle = payload as {
        user_id: string
        start: string
        score?: { strain?: number; kilojoule?: number }
      }
      const kcal = cycle.score?.kilojoule
        ? Math.round(cycle.score.kilojoule / 4.184)
        : null
      return {
        athlete_id: null,
        wearable_id: userId,
        recorded_date: cycle.start?.split('T')[0] ?? now.split('T')[0],
        recorded_hour: null,
        active_kcal: kcal,
        strain_score: cycle.score?.strain ?? null,
        source: 'whoop',
        created_at: now,
      }
    }

    default:
      return null
  }
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  const body = await req.text()
  const signature = req.headers.get('x-whoop-signature')

  // Verify authenticity
  const valid = await verifyWhoopSignature(body, signature)
  if (!valid) {
    console.error('Invalid WHOOP signature')
    return new Response('Unauthorized', { status: 401 })
  }

  let event: { type: string; data: Record<string, unknown> }
  try {
    event = JSON.parse(body)
  } catch {
    return new Response('Bad request', { status: 400 })
  }

  const { type, data } = event
  console.log(`WHOOP event received: ${type}`)

  const row = mapWhoopEvent(type, data)
  if (!row) {
    // Event type we don't handle — acknowledge and move on
    return new Response(JSON.stringify({ received: true }), { status: 200 })
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

  // Resolve WHOOP user_id → athlete profile via wearable_connections
  const whoopUserId = data['user_id'] as string
  const { data: conn } = await supabase
    .from('wearable_connections')
    .select('athlete_id')
    .eq('device_type', 'whoop')
    .eq('device_label', whoopUserId)
    .eq('is_active', true)
    .single()

  if (conn?.athlete_id) {
    row.athlete_id = conn.athlete_id
  } else {
    console.warn(`No active WHOOP connection found for user ${whoopUserId}`)
  }

  // Upsert into energy_expenditure (deduplicate by athlete + date + source)
  const { error } = await supabase
    .from('energy_expenditure')
    .upsert(row, {
      onConflict: 'athlete_id,recorded_date,source',
      ignoreDuplicates: false,
    })

  if (error) {
    console.error('DB error:', error.message)
    return new Response(JSON.stringify({ error: error.message }), { status: 500 })
  }

  return new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
})
