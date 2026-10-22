# iPhone Lab release workflow

This is the public PWA frontend only. Never publish tokens, private requests, personal histories or real remote credentials here.

Application updates now use the stable dist/sw.js engine and the public release.json pointer, without GitHub Actions. Preserve localStorage pairing and MacBook keys. GitHub Pages is still needed for initial installation and changes to the update engine itself.

For each app change:
1. Set a NEW semantic version in dist/app.js and the visible version in dist/index.html. Do not bump BOOTSTRAP_VERSION in dist/sw.js for routine application releases.
2. Run the updater tests in tests/test-updater.cjs and applicable operator-bridge client/pairing/refresh tests from the parent workspace.
3. Run python3 scripts/release.py VERSION. Existing releases are immutable; do not edit a published release bundle or reuse its version.
4. Publish changed source files, release.json and releases/VERSION.json together in one GitHub commit. Confirm the raw pointer and bundle are reachable and match SHA-256. No Actions run is required for app updates.
5. The phone's Aktualizovať button explicitly downloads and checks the complete bundle before switching the active snapshot. It never changes localStorage or sends the bridge token to the update source.

The GitHub Actions workflow only triggers on dist/sw.js or workflow changes (or manual dispatch), so ordinary app releases bypass Actions. First deployment of this engine is version 1.9.0 and must pass through Pages once. If the engine protocol changes later, migrate it through Pages separately and maintain backwards compatibility.
