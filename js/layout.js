/* Injects the shared header + footer so every page stays in sync.
   A page needs: <body data-page="filename.html">, <header id="site-header">,
   <footer id="site-footer">, and config.js loaded before this file. */
(function () {
  var S = window.SITE || {};
  var current = document.body.getAttribute("data-page") || "index.html";
  // Pages in sub-folders load this file as "../js/layout.js"; reuse that prefix
  // so menu links resolve correctly from any depth.
  var script = document.currentScript;
  var base = script ? (script.getAttribute("src") || "").replace(/js\/layout\.js.*$/, "") : "";

  function el(tag, attrs, children) {
    var n = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      if (k === "text") n.textContent = attrs[k];
      else n.setAttribute(k, attrs[k]);
    });
    (children || []).forEach(function (c) { if (c) n.appendChild(c); });
    return n;
  }

  // ---------- header ----------
  var header = document.getElementById("site-header");
  if (header) {
    var brand = el("a", { class: "brand", href: base + "index.html", "aria-label": "Home" }, [
      el("span", { class: "brand-square" }),
      el("span", { class: "brand-name", text: S.name }),
      el("span", { class: "brand-slash", "aria-hidden": "true" }),
      el("span", { class: "brand-sub", text: S.subtitle })
    ]);

    var toggle = el("button", {
      class: "nav-toggle", type: "button",
      "aria-label": "Toggle menu", "aria-expanded": "false"
    }, [el("span"), el("span"), el("span")]);

    var nav = el("nav", { class: "nav", id: "nav", "aria-label": "Site" });
    (S.nav || []).forEach(function (item) {
      var a = el("a", { href: base + item.file, text: item.label });
      if (item.file === current) a.setAttribute("aria-current", "page");
      nav.appendChild(a);
    });

    toggle.addEventListener("click", function () {
      var open = nav.classList.toggle("open");
      toggle.setAttribute("aria-expanded", String(open));
    });

    header.appendChild(el("div", { class: "header-inner" }, [brand, toggle, nav]));
  }

  // ---------- footer ----------
  var footer = document.getElementById("site-footer");
  if (footer) {
    var cols = [];

    if (S.phone) cols.push(el("div", { class: "foot-col" }, [
      el("h4", { text: "Call" }),
      el("a", { href: "tel:" + S.phone.replace(/\s+/g, ""), text: S.phone })
    ]));

    if (S.handle || S.email) cols.push(el("div", { class: "foot-col" }, [
      el("h4", { text: "Write" }),
      S.email
        ? el("a", { href: "mailto:" + S.email, text: S.email })
        : el("span", { text: S.handle })
    ]));

    var icons = [
      ["linkedin", "in", "LinkedIn"],
      ["github", "gh", "GitHub"],
      ["twitter", "X", "X / Twitter"],
      ["instagram", "ig", "Instagram"]
    ];
    var links = icons
      .filter(function (i) { return S.social && S.social[i[0]]; })
      .map(function (i) {
        return el("a", {
          class: "social", href: S.social[i[0]], target: "_blank",
          rel: "noopener noreferrer", "aria-label": i[2], text: i[1]
        });
      });
    if (links.length) cols.push(el("div", { class: "foot-col" },
      [el("h4", { text: "Follow" }), el("div", { class: "socials" }, links)]));

    footer.appendChild(el("div", { class: "footer-inner" }, cols));
    footer.appendChild(el("p", {
      class: "footer-note",
      text: "© " + new Date().getFullYear() + " " + (S.cardTitle || S.name)
    }));
  }
})();
