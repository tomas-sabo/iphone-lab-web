iPhone Lab Web — Progressive Web App

Public source contains only this static app. No Apple or private repo credentials.
GitHub Actions publishes dist/ to GitHub Pages on every main push.
Repository Settings > Pages must use GitHub Actions as build source.

Release: increment VERSION in dist/app.js and RELEASE in dist/sw.js together.
The changed service worker downloads the complete new shell, then offers an
Update button. Activation reloads the new version. localStorage remains intact.
Do not remove existing localStorage keys when publishing app updates.
No tokens or deployment secrets are required for GitHub Pages.

Offline works after the first successful load. Data is local to this browser
and origin; Safari/standalone may have separate storage. Clearing website data
or removing the app can delete it. This is not a synced or encrypted notes app.

For iPhone: open deployed HTTPS URL in Safari > Share > Add to Home Screen.
