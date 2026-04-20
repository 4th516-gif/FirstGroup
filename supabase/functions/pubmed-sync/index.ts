import {
  closingTag,
  DEFAULT_TERM,
  efetchXml,
  esearch,
  extractAbstract,
  extractTag,
  makeSupabase,
  requireAuth,
  splitArticles,
  splitDigest,
} from "./lib.ts";

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
    const supabase = makeSupabase();
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
      let authors = "";
      const alOpen = chunk.toLowerCase().indexOf("<authorlist");
      const alClose = chunk.toLowerCase().indexOf(
        closingTag("authorlist").toLowerCase(),
      );
      if (alOpen !== -1 && alClose !== -1 && alClose > alOpen) {
        const alInner = chunk.slice(alOpen, alClose);
        const lastNames: string[] = [];
        let p = 0;
        while (lastNames.length < 4 && p < alInner.length) {
          const lnOpen = alInner.toLowerCase().indexOf("<lastname>", p);
          if (lnOpen === -1) break;
          const lnClose = alInner.toLowerCase().indexOf(
            closingTag("lastname").toLowerCase(),
            lnOpen,
          );
          if (lnClose === -1) break;
          lastNames.push(
            alInner.slice(lnOpen + "<LastName>".length, lnClose).trim(),
          );
          p = lnClose + closingTag("lastname").length;
        }
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
