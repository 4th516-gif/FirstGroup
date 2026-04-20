// Shared PubMed XML + NCBI helpers (imported by index.ts)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
export const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
export const NCBI_API_KEY = Deno.env.get("NCBI_API_KEY") ?? "";
export const CRON_SECRET = Deno.env.get("CRON_SECRET") ?? "";
export const DEFAULT_TERM =
  Deno.env.get("PUBMED_DEFAULT_TERM") ??
  "(exercise[Title/Abstract] OR athlete[Title/Abstract]) AND (randomized controlled trial[Publication Type] OR systematic review[Publication Type])";
export const ESEARCH =
  "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi";
export const EFETCH =
  "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi";

export function closingTag(name: string): string {
  return String.fromCharCode(60, 47) + name + String.fromCharCode(62);
}

export function requireAuth(req: Request): boolean {
  if (!CRON_SECRET) return true;
  const auth = req.headers.get("Authorization");
  return auth === `Bearer ${CRON_SECRET}`;
}

export function extractTag(xml: string, tag: string): string {
  const openRe = new RegExp("<" + tag + "[^>]*>", "i");
  const m = xml.match(openRe);
  if (!m || m.index === undefined) return "";
  const start = m.index + m[0].length;
  const end = xml.toLowerCase().indexOf(closingTag(tag).toLowerCase(), start);
  if (end === -1) return "";
  return xml.slice(start, end).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function stripTags(s: string): string {
  return s.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

export function extractAbstract(xml: string): string {
  const open = xml.toLowerCase().indexOf("<abstract>");
  const close = xml.toLowerCase().indexOf(closingTag("abstract").toLowerCase());
  if (open === -1 || close === -1 || close <= open) return "";
  const abs = xml.slice(open + "<abstract>".length, close);
  const texts: string[] = [];
  let i = 0;
  while (i < abs.length) {
    const tOpen = abs.toLowerCase().indexOf("<abstracttext", i);
    if (tOpen === -1) break;
    const tagEnd = abs.indexOf(">", tOpen);
    if (tagEnd === -1) break;
    const labelM = abs.slice(tOpen, tagEnd + 1).match(/Label="([^"]*)"/i);
    const label = labelM ? labelM[1] : "";
    const tClose = abs.toLowerCase().indexOf(
      closingTag("abstracttext").toLowerCase(),
      tagEnd,
    );
    if (tClose === -1) break;
    const inner = abs.slice(tagEnd + 1, tClose);
    const t = stripTags(inner);
    if (t) texts.push(label ? `${label}: ${t}` : t);
    i = tClose + closingTag("abstracttext").length;
  }
  if (texts.length) return texts.join(" ");
  const atOpen = abs.toLowerCase().indexOf("<abstracttext");
  if (atOpen !== -1) {
    const gt = abs.indexOf(">", atOpen);
    const ct = abs.toLowerCase().indexOf(
      closingTag("abstracttext").toLowerCase(),
      gt,
    );
    if (gt !== -1 && ct !== -1) return stripTags(abs.slice(gt + 1, ct));
  }
  return stripTags(abs);
}

export function splitDigest(abstract: string): {
  finding: string;
  mechanism: string;
  implication: string;
} {
  const s = abstract.replace(/\s+/g, " ").trim();
  if (!s) {
    return { finding: "", mechanism: "", implication: "" };
  }
  const parts = s.split(/(?<=[.!?])\s+/).filter(Boolean);
  const chunk = (i: number) =>
    parts.slice(i * 3, i * 3 + 3).join(" ").slice(0, 1200);
  return {
    finding: chunk(0) || s.slice(0, 400),
    mechanism: chunk(1) || s.slice(400, 800),
    implication: chunk(2) || s.slice(800, 1200),
  };
}

export async function esearch(term: string, retmax: number): Promise<string[]> {
  const u = new URL(ESEARCH);
  u.searchParams.set("db", "pubmed");
  u.searchParams.set("retmode", "json");
  u.searchParams.set("retmax", String(retmax));
  u.searchParams.set("term", term);
  if (NCBI_API_KEY) u.searchParams.set("api_key", NCBI_API_KEY);
  const res = await fetch(u.toString());
  if (!res.ok) throw new Error(`esearch ${res.status}`);
  const j = await res.json();
  const ids = j?.esearchresult?.idlist as string[] | undefined;
  return ids ?? [];
}

export async function efetchXml(pmids: string[]): Promise<string> {
  const u = new URL(EFETCH);
  u.searchParams.set("db", "pubmed");
  u.searchParams.set("retmode", "xml");
  u.searchParams.set("id", pmids.join(","));
  if (NCBI_API_KEY) u.searchParams.set("api_key", NCBI_API_KEY);
  const res = await fetch(u.toString());
  if (!res.ok) throw new Error(`efetch ${res.status}`);
  return await res.text();
}

export function splitArticles(xml: string): string[] {
  return xml.split(/<PubmedArticle>/i).slice(1).map((s) => "<PubmedArticle>" + s);
}

export function makeSupabase() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
}
