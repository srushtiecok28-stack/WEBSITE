/* ------------------------------------------------------------------
   SITE CONFIG — the only place you edit name / contact / nav.
   Every page reads this through js/layout.js, so a change here
   updates the header and footer on all pages at once.
------------------------------------------------------------------- */
window.SITE = {
  name: "SRUSHTI PATIL",
  subtitle: "FINANCIAL ENGINEERING",

  // Text on the beige card on the home page
  cardTitle: "Srushti Patil",
  cardTagline: "MARKETS · MACRO · MODELS",

  // Footer contact block (leave a value "" to hide it)
  phone: "9209233566",
  handle: "srushti_FE/QE",
  email: "",              // e.g. "you@example.com" — used by the contact page

  // Social links: leave "" to hide an icon. Full URLs only.
  social: {
    linkedin: "",
    github: "",
    twitter: "",
    instagram: ""
  },

  // Contact form: create a free form at formspree.io and paste the
  // endpoint here (looks like https://formspree.io/f/xxxxxxx).
  // If empty, the form falls back to opening the visitor's email app.
  formEndpoint: "",

  // Navigation. `file` must match the page's filename.
  nav: [
    { label: "ABOUT ME",  file: "index.html" },
    { label: "RESUME",    file: "resume.html" },
    { label: "PROJECTS",  file: "projects.html" },
    { label: "DASHBOARD", file: "dashboard.html" },
    { label: "NEWS",      file: "news.html" },
    { label: "CONTACT",   file: "contact.html" }
  ]
};
