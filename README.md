# CardNest — Pokémon card collection MVP

A responsive, installable **static website** for searching, scanning and tracking your Pokémon Trading Card Game collection.

## What works now

- Search Pokémon TCG cards by name using the live [TCGdex](https://tcgdex.dev/) catalog, inspect artwork, set, card number and rarity.
- Upload or capture a card photo. An optional browser-based OCR reader (Tesseract.js, loaded on demand) attempts to read the card name and collector number; you **confirm the exact card manually** before adding. Recognition can be incorrect, particularly on reflective, rare or stylized cards.
- View the available Cardmarket/TCGplayer market price for a **selected finish**. Converts EUR/USD source pricing to GBP using exchange rates from [Frankfurter](https://frankfurter.dev/) when available. Shows source, data date, and unavailability honestly.
- Save copies to a personal binder by condition, finish, quantity, and optional purchase price. See total estimated value, count, unique cards, top card, and search/sort the binder.
- Update price references, edit or delete cards, export a JSON backup or CSV, restore your backup.
- Install to a phone's home screen on HTTPS hosting (PWA manifest + service worker).

## How to run

For local testing, serve this folder with any static HTTP server. Example: `python3 -m http.server 8080`, then open `http://localhost:8080`.

To put online, upload this whole folder to a static hosting provider. On **Render**, create a Static Site from a GitHub repository containing these files. It needs no build command; set Publish Directory to `.`. You can add a custom domain later.

## Important limitations and launch checklist

- The collection is stored in **localStorage in the user's browser**, not a secure cloud account. Removing browser data deletes it. Back up before changing devices.
- No login or cross-device sync in this release. Before offering accounts publicly, add a server-backed database, identity authentication, access controls, backups, GDPR/privacy notices and monitoring.
- Photo reader uses on-device OCR, **not** robust computer-vision image recognition; some photos won't identify accurately. Always confirm the exact set and collector number. No multi-card scan yet.
- Price is a **reference**, not a UK sold listing or a guaranteed resale value. Condition/grade adjustments are NOT applied. Missing conversion means original EUR/USD source price may show, but it will be excluded from GBP collection totals.
- The free catalog may be incomplete, have mismatched prices for some finishes, or be temporarily unavailable. Check provider limits, attribution and commercial licensing before public monetized use. Never market this as an official Pokémon product.
- TCGdex returns variant-dependent prices when the source has data. Cardmarket price matching is not exhaustive; 1st edition/reverse-holo pricing may only exist on TCGplayer.
- For a production app, add server-side caching and controls to avoid needless API usage and verify current provider terms.

## Project files

- `index.html` — site markup
- `styles.css` — responsive layouts and visual design
- `app.js` — catalog searches, modal, pricing, collection storage, photo OCR
- `manifest.webmanifest`, `icon.svg`, `sw.js` — PWA support

This project is not affiliated with, supported by or endorsed by Nintendo, The Pokémon Company or TCGdex.