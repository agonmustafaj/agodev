# AgoDev

SEO and web development by Agon Mustafaj, served at https://agodev.agonmustafaj.com/ through GitHub Pages.

The page reuses the stylesheet, scripts, translations, header, footer and project data from the portfolio at https://agonmustafaj.com (repo `agonmustafaj/portfolio`). The `<base href="https://agonmustafaj.com/">` tag makes the rendered header, footer and project links point to the portfolio, so links within this page must be absolute `https://agodev.agonmustafaj.com/...` URLs.

When the portfolio bumps its `?v=` asset versions, update the matching `<link>` and `<script>` tags in `index.html`.

Text on the page is translated through the `agodev.*` and `services.*` keys in the portfolio's `js/i18n.js`.
