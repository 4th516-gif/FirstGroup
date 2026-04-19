/**
 * Replace with your Supabase project values (Project Settings → API).
 * The anon key is safe for public read of pubmed_articles; never put the service role key here.
 */
window.STONEBOUND_SUPABASE_URL = "https://bkdubocmtzruyojkknch.supabase.co";
window.STONEBOUND_SUPABASE_ANON_KEY = "YOUR_ANON_KEY";
/** Edge Functions: use same-origin /functions/* when deployed on Netlify with _redirects proxies */
window.STONEBOUND_FUNCTIONS_URL =
  typeof location !== "undefined" && location.hostname && location.hostname !== "localhost"
    ? `${location.origin}/functions`
    : "https://bkdubocmtzruyojkknch.supabase.co/functions/v1";
