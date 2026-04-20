/**
 * Loads data/tooltip-terms.json (relative to site root) and sets title on [data-term="slug"].
 */
(function () {
  const CACHE = { terms: null };

  async function loadTerms() {
    if (CACHE.terms) return CACHE.terms;
    const res = await fetch("data/tooltip-terms.json");
    if (!res.ok) {
      console.warn("Stonebound: tooltip-terms.json not found");
      CACHE.terms = {};
      return CACHE.terms;
    }
    CACHE.terms = await res.json();
    return CACHE.terms;
  }

  function findTerm(terms, slug) {
    if (!terms || !slug) return null;
    for (const cat of Object.keys(terms)) {
      const t = terms[cat][slug];
      if (t) return { category: cat, ...t };
    }
    return null;
  }

  window.StoneboundTooltips = {
    async init(root) {
      const terms = await loadTerms();
      const scope = root || document;
      scope.querySelectorAll("[data-term]").forEach((el) => {
        const slug = el.getAttribute("data-term");
        const info = findTerm(terms, slug);
        if (info && info.definition) {
          el.setAttribute("title", info.definition);
          el.classList.add("has-tooltip");
        }
      });
    },
  };
})();
