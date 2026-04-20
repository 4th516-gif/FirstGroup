/**
 * Renders latest rows from public.pubmed_articles via Supabase anon key.
 * Requires stonebound-config.js (URL + anon key) and @supabase/supabase-js on the page.
 */
(function () {
  async function loadClient() {
    const url = window.STONEBOUND_SUPABASE_URL;
    const key = window.STONEBOUND_SUPABASE_ANON_KEY;
    if (!url || !key || url.includes("YOUR_PROJECT")) return null;
    const sb = window.supabase;
    if (!sb || typeof sb.createClient !== "function") return null;
    return sb.createClient(url, key);
  }

  function render(container, rows) {
    if (!rows || !rows.length) {
      container.innerHTML =
        "<p class=\"muted\">No articles yet. Run the <code>pubmed-sync</code> Edge Function on a schedule.</p>";
      return;
    }
    container.innerHTML = rows.map((r) => {
      const pmid = r.pmid;
      const link = `https://pubmed.ncbi.nlm.nih.gov/${pmid}/`;
      const tags = (r.hub_tags || []).join(", ");
      return `
        <article class="feed-card">
          <div class="feed-meta">
            <a href="${link}" target="_blank" rel="noopener">PMID ${pmid}</a>
            ${tags ? `<span class="tag">${tags}</span>` : ""}
          </div>
          <h3 class="feed-title">${escapeHtml(r.title)}</h3>
          <p class="digest"><strong>Finding:</strong> ${escapeHtml(r.digest_finding || "—")}</p>
          <p class="digest"><strong>Mechanism:</strong> ${escapeHtml(r.digest_mechanism || "—")}</p>
          <p class="digest"><strong>Implication:</strong> ${escapeHtml(r.digest_implication || "—")}</p>
        </article>`;
    }).join("");
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  window.StoneboundPubMedFeed = {
    async mount(selector) {
      const el = document.querySelector(selector);
      if (!el) return;
      const client = await loadClient();
      if (!client) {
        el.innerHTML =
          "<p class=\"muted\">Configure <code>js/stonebound-config.js</code> with your Supabase URL and anon key to load the live feed.</p>";
        return;
      }
      const { data, error } = await client
        .from("pubmed_articles")
        .select(
          "pmid,title,hub_tags,digest_finding,digest_mechanism,digest_implication,created_at",
        )
        .order("created_at", { ascending: false })
        .limit(12);
      if (error) {
        el.innerHTML = `<p class="error">Could not load feed: ${escapeHtml(error.message)}</p>`;
        return;
      }
      render(el, data);
    },
  };
})();
