// ─────────────────────────────────────────────────────────────────────────────
//  Stonebound Hub Glow
//  Tracks mouse position inside each .hub-glow element and updates
//  CSS custom properties --hub-x / --hub-y so the radial gradient
//  in stonebound-theme.css follows the cursor.
// ─────────────────────────────────────────────────────────────────────────────

;(function () {
  'use strict'

  function attachGlow (el) {
    el.addEventListener('mousemove', function (e) {
      const rect = el.getBoundingClientRect()
      const x = ((e.clientX - rect.left) / rect.width  * 100).toFixed(1) + '%'
      const y = ((e.clientY - rect.top)  / rect.height * 100).toFixed(1) + '%'
      el.style.setProperty('--hub-x', x)
      el.style.setProperty('--hub-y', y)
    })
  }

  function init () {
    document.querySelectorAll('.hub-glow').forEach(attachGlow)
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init)
  } else {
    init()
  }
})()
