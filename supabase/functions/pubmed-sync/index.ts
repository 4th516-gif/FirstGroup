// Stonebound — PubMed sync via NCBI E-utilities (esearch + efetch XML)
// Invoke on a schedule (Supabase cron) with Authorization: Bearer CRON_SECRET
// Optional: pass ?term= URL-encoded query override
// Requires env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, NCBI_API_KEY (recommended)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const NCBI_API_KEY = Deno.env.get("NCBI_API_KEY") ?? "";
const CRON_SECRET = Deno.env.get("CRON_SECRET") ?? "";
const DEFAULT_TERM =
  Deno.env.get("PUBMED_DEFAULT_TERM") ??
  "(exercise[Title/Abstract] OR athlete[Title/Abstract]) AND (randomized controlled trial[Publication Type] OR systematic review[Publication Type])";

const ESEARCH =
  "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi";
const EFETCH =
  "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi";

function requireAuth(req: Request): boolean {
  if (!CRON_SECRET) return true; // dev: allow if not set
  const auth = req.headers.get("Authorization");
  return auth === `Bearer ${CRON_SECRET}`;
}

function extractTag(xml: string, tag: string): string {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i");
  const m = xml.match(re);
  return m ? m[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() : "";
}

function extractAbstract(xml: string): string {
  const block = xml.match(/<Abstract>([\s\S]*?)<\/Abstract>/i);
  if (!block) return "";
  const texts: string[] = [];
  const abs = block[1];
  const re = /<AbstractText[^>]*(?:Label="([^"]*)")?[^>]*>([\s\S]*?)<\/AbstractText>/gi;
  let m;
  while ((m = re.exec(abs)) !== null) {
    const label = m[1];
    const t = m[2].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    if (t) texts.push(label ? `${label}: ${t}` : t);
  }
  if (texts.length) return texts.join(" ");
  return extractTag(block[1], "AbstractText");
}

function splitDigest(abstract: string): {
  finding: string;
  mechanism: string;
  implication: string;
} {
  const s = abstract.replace(/\s+/g, " ").trim();
  if (!s) {
    return {
      finding: "",
      mechanism: "",
      implication: "",
    };
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

async function esearch(term: string, retmax: number): Promise<string[]> {
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

async function efetchXml(pmids: string[]): Promise<string> {
  const u = new URL(EFETCH);
  u.searchParams.set("db", "pubmed");
  u.searchParams.set("retmode", "xml");
  u.searchParams.set("id", pmids.join(","));
  if (NCBI_API_KEY) u.searchParams.set("api_key", NCBI_API_KEY);
  const res = await fetch(u.toString());
  if (!res.ok) throw new Error(`efetch ${res.status}`);
  return await res.text();
}

function splitArticles(xml: string): string[] {
  return xml.split(/<PubmedArticle>/i).slice(1).map((s) => "<PubmedArticle>" + s);
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST" && req.method !== "GET") {
    return new Response("Method not allowed", { status: 405 });
  }
  if (!requireAuth(req)) {
    return new Response("Unauthorized", { status: 401 });
  }

  const url = new URL(req.url);
  const term = url.searchParams.get("term") ?? DEFAULT_TERM;
  const retmax = Math.min(
    25,
    Math.max(1, Number(url.searchParams.get("retmax") ?? "10") || 10),
  );

  const hubTag = url.searchParams.get("hub") ?? "N-10";

  try {
    const ids = await esearch(term, retmax);
    if (!ids.length) {
      return new Response(JSON.stringify({ ok: true, inserted: 0, ids: [] }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    const xml = await efetchXml(ids);
    const chunks = splitArticles(xml);
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    let inserted = 0;

    for (const chunk of chunks) {
      const pmid = extractTag(chunk, "PMID") || extractTag(chunk, "ArticleId");
      if (!pmid) continue;
      const title = extractTag(chunk, "ArticleTitle");
      const journal = extractTag(chunk, "Title");
      const pubDate =
        extractTag(chunk, "Year") ||
        extractTag(chunk, "MedlineDate") ||
        "";
      const authorsBlock = chunk.match(/<AuthorList[^>]*>([\s\S]*?)<\/AuthorList>/i);
      let authors = "";
      if (authorsBlock) {
        const lastNames = [...authorsBlock[1].matchAll(/<LastName>([^<]+)<\/LastName>/gi)]
          .map((m) => m[1])
          .slice(0, 4);
        authors = lastNames.join(", ");
      }
      const abstract = extractAbstract(chunk);
      const digest = splitDigest(abstract);

      const { error } = await supabase.from("pubmed_articles").upsert(
        {
          pmid,
          title: title || "Untitled",
          journal: journal || null,
          pub_date: pubDate || null,
          authors: authors || null,
          hub_tags: [hubTag],
          digest_finding: digest.finding || null,
          digest_mechanism: digest.mechanism || null,
          digest_implication: digest.implication || null,
          abstract_excerpt: abstract ? abstract.slice(0, 2000) : null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "pmid" },
      );

      if (!error) inserted++;
      else if (error.code !== "23505") console.error("upsert", error);
    }

    return new Response(
      JSON.stringify({ ok: true, inserted, searched: ids.length }),
      { headers: { "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
