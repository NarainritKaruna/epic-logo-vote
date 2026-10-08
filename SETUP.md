# EPIC voting page setup

This repository is already connected to the owner's private **EPIC Logo Votes** sheet and configured for GitHub Pages. Use these steps only to recreate the setup or deploy a new copy. Do not run `setupBallot` against a different sheet unless you intend to redirect future votes there.

## 1. Connect the anonymous response sheet

1. Create a blank Google Sheet named **EPIC Logo Votes**.
2. In the Sheet, choose **Extensions → Apps Script**.
3. Replace the sample code with everything in `backend/Code.gs`, then save.
4. Select `setupBallot` at the top and click **Run** once. Approve access to your own spreadsheet. This saves the sheet ID for the deployed web app, creates a private **Votes** tab, and creates a live **Results** tab. Results show 1st-, 2nd-, and 3rd-place totals plus weighted points (3, 2, and 1 point).
5. Choose **Deploy → New deployment → Web app**.
6. Set **Execute as** to **Me** and **Who has access** to **Anyone**. Deploy.
7. Copy the web-app URL ending in `/exec`.
8. Open `dist/config.js` and paste that URL between the quotes:

   ```js
   window.EPIC_VOTE_ENDPOINT = 'https://script.google.com/macros/s/…/exec';
   ```

The form asks for no name or email. It creates a random browser ID only to reject a repeat vote from the same browser. Each logo's revision comment is stored in its own column. The Google Sheet remains private to its owner unless you share it. The page confirms a vote only after it checks that the matching submission ID appears in the sheet. If that check cannot finish, the page keeps the same submission in the browser and offers a safe retry. Do not clear browser data while a vote is awaiting confirmation.

If you edit `backend/Code.gs` after deploying, use **Deploy → Manage deployments → Edit → New version** so the public web app runs the updated code. Run `setupBallot` again if you move the script to a different spreadsheet.

## 2. Publish with GitHub Pages

1. Create a new GitHub repository and upload the contents of this `epic-logo-vote` folder.
2. In the repository, open **Settings → Pages**.
3. Under **Build and deployment**, choose **GitHub Actions**.
4. Push or upload the files to the `main` branch. The included workflow publishes the `dist` folder automatically.

GitHub will show the public page address after the deployment finishes.

## Local preview

From the `epic-logo-vote` folder, run:

```sh
python3 -m http.server 4173 --directory dist
```

Then open `http://127.0.0.1:4173/`.

Without a response-sheet URL, a gold notice clearly marks the page as local preview mode on `localhost` or `127.0.0.1`. Test votes remain only in that browser and can be reset from the confirmation screen. If the page is published without a response-sheet URL, voting is disabled until `dist/config.js` is configured.

## Important limitation

This is a lightweight anonymous ranked ballot for a known audience. Each response ranks three different logo concepts. It prevents accidental repeat voting on the same browser, but someone can vote again by clearing browser storage or using another device. Stronger one-person-one-vote enforcement would require identity or single-use invitation codes, which would reduce anonymity.
