/* News page. Reads data/news.json:
   { generated, items: [{title, link, source, category, published, summary, tags}] }
   Feed text is untrusted: it is only ever inserted with textContent,
   and links are accepted only if they start with http(s). */
(function () {
  var ITEMS = [];
  var activeCat = "All";
  var query = "";
  var PAGE = 40, shown = PAGE;

  var list = document.getElementById("list");
  var count = document.getElementById("count");
  var cats = document.getElementById("cats");

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function ago(iso) {
    var t = new Date(iso).getTime();
    if (isNaN(t)) return "";
    var m = Math.round((Date.now() - t) / 60000);
    if (m < 60) return Math.max(m, 1) + " min ago";
    var h = Math.round(m / 60);
    if (h < 24) return h + " h ago";
    var d = Math.round(h / 24);
    return d + (d === 1 ? " day ago" : " days ago");
  }

  function safeUrl(u) { return /^https?:\/\//i.test(u || "") ? u : null; }

  function filtered() {
    var q = query.trim().toLowerCase();
    return ITEMS.filter(function (it) {
      if (activeCat !== "All" && it.category !== activeCat) return false;
      if (!q) return true;
      return (it.title + " " + (it.summary || "") + " " + it.source + " " + (it.tags || []).join(" "))
        .toLowerCase().indexOf(q) >= 0;
    });
  }

  function render() {
    var rows = filtered();
    list.textContent = "";
    count.textContent = rows.length + " item" + (rows.length === 1 ? "" : "s");
    if (!rows.length) {
      list.appendChild(el("p", "empty", ITEMS.length
        ? "Nothing matches that filter."
        : "No news yet. Run scripts/fetch_news.py (or wait for the scheduled job) to fill data/news.json."));
      return;
    }
    rows.slice(0, shown).forEach(function (it) {
      var art = el("article", "news-item");
      var h = el("h3");
      var url = safeUrl(it.link);
      if (url) {
        var a = el("a", null, it.title);
        a.href = url; a.target = "_blank"; a.rel = "noopener noreferrer";
        h.appendChild(a);
      } else h.textContent = it.title;
      art.appendChild(h);

      var meta = el("div", "meta");
      meta.appendChild(el("strong", null, it.source));
      if (it.published) meta.appendChild(el("span", null, ago(it.published)));
      if (it.category) meta.appendChild(el("span", "pill", it.category));
      (it.tags || []).slice(0, 3).forEach(function (t) { meta.appendChild(el("span", "pill", t)); });
      art.appendChild(meta);

      if (it.summary) art.appendChild(el("p", null, it.summary));
      list.appendChild(art);
    });

    if (rows.length > shown) {
      var more = el("button", "btn ghost", "LOAD MORE");
      more.style.marginTop = "20px";
      more.addEventListener("click", function () { shown += PAGE; render(); });
      list.appendChild(more);
    }
  }

  function buildCats() {
    var names = ["All"];
    ITEMS.forEach(function (it) { if (it.category && names.indexOf(it.category) < 0) names.push(it.category); });
    cats.textContent = "";
    names.forEach(function (n) {
      var b = el("button", "chip", n);
      b.setAttribute("aria-pressed", String(n === activeCat));
      b.addEventListener("click", function () {
        activeCat = n; shown = PAGE;
        cats.querySelectorAll(".chip").forEach(function (c) { c.setAttribute("aria-pressed", String(c === b)); });
        render();
      });
      cats.appendChild(b);
    });
  }

  document.getElementById("q").addEventListener("input", function (e) {
    query = e.target.value; shown = PAGE; render();
  });

  fetch("data/news.json", { cache: "no-cache" })
    .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
    .then(function (d) {
      ITEMS = (d.items || []).slice().sort(function (a, b) { return (b.published || "").localeCompare(a.published || ""); });
      document.getElementById("stamp").textContent = d.generated ? "Updated " + d.generated.slice(0, 16).replace("T", " ") + " UTC" : "";
      buildCats(); render();
    })
    .catch(function (e) {
      list.appendChild(el("p", "empty", "Could not load data/news.json (" + e.message + "). If you opened the file from disk, serve the folder: python3 -m http.server"));
    });
})();
