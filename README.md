# EPIC Logo Vote

A responsive, anonymous logo ballot hosted on GitHub Pages.

## Included

- Six supplied concept images
- Ranked top-three ballot with a separate revision-comment box for every concept
- No name or email fields
- Same-browser duplicate protection with a stable submission ID for safe retries
- Responsive desktop and mobile layout
- Accessible keyboard selection and clear confirmation states
- Google Sheets receiver with rank totals and weighted points
- Confirmation only after the receiver reports that the submission is in the sheet
- GitHub Pages deployment workflow

The page is connected to the owner's private **EPIC Logo Votes** Google Sheet through the deployed Apps Script endpoint in `dist/config.js`. See `SETUP.md` if the sheet, deployment, or repository must be recreated. The sheet itself is not shared publicly.

## Project structure

- `dist/` — the complete static website GitHub Pages publishes
- `backend/Code.gs` — the anonymous Google Sheets receiver
- `.github/workflows/pages.yml` — automatic GitHub Pages deployment
