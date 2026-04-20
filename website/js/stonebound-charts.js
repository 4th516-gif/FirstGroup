/**
 * Stonebound — Chart.js demos (DIAAS, CMJ norms, GI, ACWR, TEF, energy systems).
 * Requires: https://cdn.jsdelivr.net/npm/chart.js
 */
(function () {
  const palette = {
    perf: ["#e8942d", "#3d3830", "#9a9590", "#c97818"],
    nutr: ["#1f8f62", "#3d5248", "#6b7a72", "#2eb87c"],
  };

  function baseOptions(theme) {
    const c = theme === "nutrition" ? palette.nutr : palette.perf;
    return {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { labels: { color: c[2] } },
      },
      scales: {
        x: { ticks: { color: c[2] }, grid: { color: "rgba(148,163,184,0.15)" } },
        y: { ticks: { color: c[2] }, grid: { color: "rgba(148,163,184,0.15)" } },
      },
    };
  }

  window.StoneboundCharts = {
    mountDIAAS(ctx, theme) {
      return new Chart(ctx, {
        type: "bar",
        data: {
          labels: ["Whey isolate", "Milk", "Pea + rice", "Soy"],
          datasets: [{
            label: "DIAAS (illustrative)",
            data: [1.09, 1.18, 0.9, 0.91],
            backgroundColor: (theme === "nutrition" ? palette.nutr : palette.perf)[0],
          }],
        },
        options: { ...baseOptions(theme), plugins: { legend: { display: false } } },
      });
    },
    mountCMJ(ctx, theme) {
      return new Chart(ctx, {
        type: "line",
        data: {
          labels: ["Week 1", "2", "3", "4", "5", "6"],
          datasets: [{
            label: "CMJ height (cm) — example",
            data: [42, 43, 44, 45, 45.5, 46],
            borderColor: (theme === "nutrition" ? palette.nutr : palette.perf)[0],
            tension: 0.25,
          }],
        },
        options: baseOptions(theme),
      });
    },
    mountGI(ctx, theme) {
      return new Chart(ctx, {
        type: "bar",
        data: {
          labels: ["White bread", "Oats", "Beans", "Apple"],
          datasets: [{
            label: "GI (example)",
            data: [75, 55, 35, 40],
            backgroundColor: (theme === "nutrition" ? palette.nutr : palette.perf)[1],
          }],
        },
        options: { ...baseOptions(theme), plugins: { legend: { display: false } } },
      });
    },
    mountACWR(ctx, theme) {
      return new Chart(ctx, {
        type: "line",
        data: {
          labels: ["0.6", "0.8", "1.0", "1.2", "1.4", "1.6"],
          datasets: [{
            label: "Injury risk curve (schematic)",
            data: [0.3, 0.2, 0.15, 0.35, 0.7, 1.0],
            borderColor: (theme === "nutrition" ? palette.nutr : palette.perf)[0],
            tension: 0.35,
            fill: true,
            backgroundColor: "rgba(239,159,39,0.08)",
          }],
        },
        options: {
          ...baseOptions(theme),
          scales: {
            x: {
              title: { display: true, text: "ACWR", color: "#94a3b8" },
              ...baseOptions(theme).scales.x,
            },
            y: {
              title: { display: true, text: "Relative risk (illustrative)", color: "#94a3b8" },
              ...baseOptions(theme).scales.y,
            },
          },
        },
      });
    },
    mountTEF(ctx, theme) {
      return new Chart(ctx, {
        type: "doughnut",
        data: {
          labels: ["Protein", "Carb", "Fat"],
          datasets: [{
            data: [25, 8, 3],
            backgroundColor: [
              (theme === "nutrition" ? palette.nutr : palette.perf)[0],
              (theme === "nutrition" ? palette.nutr : palette.perf)[1],
              (theme === "nutrition" ? palette.nutr : palette.perf)[3],
            ],
          }],
        },
        options: {
          plugins: {
            legend: { labels: { color: "#94a3b8" } },
            title: { display: true, text: "TEF % of intake (illustrative ranges)", color: "#94a3b8" },
          },
        },
      });
    },
    mountEnergySystems(ctx, theme) {
      return new Chart(ctx, {
        type: "polarArea",
        data: {
          labels: ["ATP-PCr", "Glycolytic", "Oxidative"],
          datasets: [{
            data: [10, 40, 50],
            backgroundColor: [
              "rgba(239,159,39,0.7)",
              "rgba(239,159,39,0.45)",
              "rgba(239,159,39,0.25)",
            ],
          }],
        },
        options: {
          plugins: {
            legend: { labels: { color: "#94a3b8" } },
            title: {
              display: true,
              text: "Energy system contribution — sustained effort (example)",
              color: "#94a3b8",
            },
          },
        },
      });
    },
  };
})();
