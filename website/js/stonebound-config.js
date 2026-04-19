/**
 * Replace with your Supabase project values (Project Settings → API).
 * The anon key is safe for public read of pubmed_articles; never put the service role key here.
 */
window.STONEBOUND_SUPABASE_URL = "https://bkdubocmtzruyojkknch.supabase.co";
window.STONEBOUND_SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJrZHVib2NtdHpydXlvamtrbmNoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUyNDE0NDYsImV4cCI6MjA5MDgxNzQ0Nn0.uEOjliROvhAfkz3_oUf76SgduOfp8omIMqEfEkBiaIM";
/** Edge Functions: use same-origin /functions/* when deployed on Netlify with _redirects proxies */
window.STONEBOUND_FUNCTIONS_URL =
  typeof location !== "undefined" && location.hostname && location.hostname !== "localhost"
    ? `${location.origin}/functions`
    : "https://bkdubocmtzruyojkknch.supabase.co/functions/v1";
