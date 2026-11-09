/* Macro dashboard. Reads data/macro.json:
   { generated, demo, errors, series: [ {id, name, group, units, freq, obs: [["YYYY-MM-DD", value], ...]} ] }
   All text from the JSON goes in via textContent, never innerHTML. */
(function () {
  var charts = [];       // {chart, series}
  var DATA = null;
  var rangeYears = 5;
  var ACCENT = "#0050ff";

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function fmt(v, units) {
    if (v == null || isNaN(v)) return "–";
    var d = Math.abs(v) >= 100 ? 1 : 2;
    var s = v.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
    return units === "%" ? s + "%" : s;
  }

  function sliceRange(obs) {
    if (!rangeYears || !obs.length) return obs;
    var last = new Date(obs[obs.length - 1][0]);
    var cutoff = new Date(last);
    cutoff.setFullYear(cutoff.getFullYear() - rangeYears);
    return obs.filter(function (o) { return new Date(o[0]) >= cutoff; });
  }

  // change vs ~1 year earlier for tiles (by calendar date, not by count)
  function yearAgo(obs) {
    if (obs.length < 2) return null;
    var last = new Date(obs[obs.length - 1][0]);
    last.setFullYear(last.getFullYear() - 1);
    for (var i = obs.length - 1; i >= 0; i--) {
      if (new Date(obs[i][0]) <= last) return obs[i][1];
    }
    return null;
  }

  function renderTiles(series) {
    var host = document.getElementById("tiles");
    host.textContent = "";
    series.filter(function (s) { return s.tile && s.obs.length; }).forEach(function (s) {
      var last = s.obs[s.obs.length - 1];
      var prev = yearAgo(s.obs);
      var t = el("div", "tile");
      t.appendChild(el("div", "t-name", s.name));
      t.appendChild(el("div", "t-val", fmt(last[1], s.units)));
      var delta = prev == null ? null : last[1] - prev;
      var cls = delta == null ? "flat" : delta > 0 ? "up" : delta < 0 ? "down" : "flat";
      var txt = delta == null ? "as of " + last[0]
        : (delta > 0 ? "▲ " : delta < 0 ? "▼ " : "• ") + Math.abs(delta).toFixed(2) + (s.units === "%" ? " pp" : "") + " vs 1y · " + last[0];
      t.appendChild(el("div", "t-delta " + cls, txt));
      host.appendChild(t);
    });
  }

  function buildChart(canvas, s) {
    var obs = sliceRange(s.obs);
    return new Chart(canvas, {
      type: "line",
      data: {
        labels: obs.map(function (o) { return o[0]; }),
        datasets: [{
          label: s.name, data: obs.map(function (o) { return o[1]; }),
          borderColor: ACCENT, backgroundColor: "rgba(0,80,255,.08)", fill: true,
          borderWidth: 1.8, pointRadius: obs.length < 40 ? 3 : 0, pointHoverRadius: 4, tension: 0.15
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false, animation: false,
        interaction: { mode: "index", intersect: false },
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: function (c) { return " " + fmt(c.parsed.y, s.units); } } }
        },
        scales: {
          x: { ticks: { maxTicksLimit: 6, maxRotation: 0, callback: function (v, i, t) {
                 var l = this.getLabelForValue(v); return l ? l.slice(0, s.freq === "A" ? 4 : 7) : ""; } },
               grid: { display: false } },
          y: { ticks: { callback: function (v) { return fmt(v, s.units); } } }
        }
      }
    });
  }

  function renderGroups(series) {
    var host = document.getElementById("groups");
    host.textContent = "";
    charts.forEach(function (c) { c.chart.destroy(); });
    charts = [];

    var order = [];
    series.forEach(function (s) { if (order.indexOf(s.group) < 0) order.push(s.group); });

    order.forEach(function (g) {
      host.appendChild(el("h2", "group-title", g));
      var grid = el("div", "charts");
      series.filter(function (s) { return s.group === g && s.obs.length; }).forEach(function (s) {
        var card = el("div", "chart-card");
        card.appendChild(el("h3", null, s.name));
        card.appendChild(el("div", "sub", (s.units || "") + " · " + (s.source || "") + " · " + s.id));
        var box = el("div", "chart-box");
        var canvas = document.createElement("canvas");
        canvas.setAttribute("role", "img");
        canvas.setAttribute("aria-label", s.name + " line chart");
        box.appendChild(canvas); card.appendChild(box); grid.appendChild(card);
        charts.push({ chart: buildChart(canvas, s), series: s });
      });
      host.appendChild(grid);
    });
  }

  function updateRange() {
    charts.forEach(function (c) {
      var obs = sliceRange(c.series.obs);
      c.chart.data.labels = obs.map(function (o) { return o[0]; });
      c.chart.data.datasets[0].data = obs.map(function (o) { return o[1]; });
      c.chart.data.datasets[0].pointRadius = obs.length < 40 ? 3 : 0;
      c.chart.update();
    });
  }

  function banner(msg, warn) {
    var b = document.getElementById("banner");
    var n = el("div", "notice" + (warn ? " warn" : ""), msg);
    b.appendChild(n);
  }

  document.querySelectorAll("[data-range]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      rangeYears = parseInt(btn.getAttribute("data-range"), 10);
      document.querySelectorAll("[data-range]").forEach(function (b) {
        b.setAttribute("aria-pressed", String(b === btn));
      });
      updateRange();
    });
  });

  if (typeof Chart === "undefined") {
    banner("Chart library failed to load (network or ad-blocker). Reload the page.", true);
    return;
  }

  fetch("data/macro.json", { cache: "no-cache" })
    .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
    .then(function (d) {
      DATA = d;
      if (d.demo) banner("DEMO DATA — these are synthetic series generated for layout testing, not real market data. Run scripts/fetch_macro.py with a FRED key to replace them.", true);
      if (d.errors && d.errors.length) banner("Some series failed to update and show their last good values: " + d.errors.join("; "), true);
      document.getElementById("stamp").textContent = d.generated ? "Updated " + d.generated.slice(0, 16).replace("T", " ") + " UTC" : "";
      if (!d.series || !d.series.length) { banner("No series in data/macro.json yet.", true); return; }
      renderTiles(d.series);
      renderGroups(d.series);
    })
    .catch(function (e) {
      banner("Could not load data/macro.json (" + e.message + "). If you opened the file directly from disk, serve the folder instead: python3 -m http.server", true);
    });
})();
