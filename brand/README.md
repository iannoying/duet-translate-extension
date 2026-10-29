# Brand icon sources

SVG sources of the Duet Translate (懂你翻译) icon, exported from the brand design system. The PNGs the extension ships live in `public/icon/` and `src/assets/icons/app-logo.png`.

- `icon16.svg`, `icon32.svg`: toolbar sizes, drawn on the pixel grid, bubbles only (no letters).
- `icon48.svg`, `icon120.svg`: tile nearly fills the canvas, with “文” and “A”.
- `icon128.svg`: 96px tile with 16px transparent padding, as the Chrome Web Store asks.

Do not scale the 128px file down for small sizes; use the matching source. `public/icon/96.png` is `icon48.svg` at 2x, `app-logo.png` is `icon120.svg` at 256px. The `-active` icons add a green check in the corner.
