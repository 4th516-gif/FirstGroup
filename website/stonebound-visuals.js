// ─────────────────────────────────────────────────────────────────────────────
//  Stonebound Visuals  —  Animated bar fills
//
//  Usage: add data-fill="75" to any .sb-bar-fill element.
//  The fill animates when the element scrolls into view (IntersectionObserver).
//  Adds class .filled so the CSS transition from width:0 → var(--bar-fill) fires.
// ─────────────────────────────────────────────────────────────────────────────

;(function () {
  'use strict'

  function onEnter (entries, observer) {
    entries.forEach(function (entry) {
      if (!entry.isIntersecting) return
      var bar = entry.target
      var pct = parseFloat(bar.dataset.fill || '0')
      bar.style.setProperty('--bar-fill', pct + '%')
      bar.classList.add('filled')
      observer.unobserve(bar)
    })
  }

  function init () {
    var bars = document.querySelectorAll('.sb-bar-fill')
    if (!bars.length) return

    var io = new IntersectionObserver(onEnter, { threshold: 0.25 })
    bars.forEach(function (bar) { io.observe(bar) })
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init)
  } else {
    init()
  }
})()
