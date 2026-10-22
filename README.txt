Tomy operator panel — v1.3.1

GitHub Pages publishes dist/ on main pushes.
Bump app.js VERSION, sw.js RELEASE and index.html version together.
Private operator transport: tomas-sabo/bridge/operator/requests.
Public source contains no requests, credentials or MacBook ID.
Sources: Rafi, Tinder, Robota. Supervisor: Architekt Iphone.
Operator pairing token is stored only in browser localStorage on the paired device, never in source or GitHub Pages assets. Reconnects after reload/update; explicit unpair removes the saved token, HTTP 401 clears invalid pairing. Expiration/revocation and deleting website data require pairing again.
Decisions use request digest and GitHub SHA compare-and-swap; no automatic execution.
MacBook launcher uses the RustDesk iOS companion. Numeric remote ID is saved only on that browser/device; passwords are entered exclusively in RustDesk.
Actual desktop access requires macOS screen capture/control permission and RustDesk authentication. The panel does not claim remote availability.
Verified browser update from 1.2.0 to 1.3.0. Actual iPhone desktop connection still needs pairing.

DIRECT GIT UPDATES (engine 1.9.0)
The installed PWA retains the original GitHub Pages address. Its stable service
worker downloads release.json and a versioned bundle directly from the public
repository on raw.githubusercontent.com. No bridge credential is attached.
The pointer identifies a protocol/version, immutable bundle path and SHA-256.
The engine checks the whole bundle and each file, restricts filenames and MIME
types, stages a separate cache and atomically switches the active-cache pointer.
A failed download, invalid hash, missing file or full storage keeps the previous
snapshot. Older releases cannot downgrade a newer installed version. Pairing,
MacBook ID and all other localStorage entries are untouched.

Create each release with python3 scripts/release.py VERSION, after changing the
version in dist/app.js and dist/index.html. Commit the generated release.json and
releases/VERSION.json together with the changed source. Never modify a published
bundle; use a new version. See AGENTS.md for the full release workflow.
Pages/Actions remains the one-time bootstrap and update-engine migration path.
Direct updates require access to GitHub's raw file service; this specifically
removes the dependency on Actions, not every possible GitHub/network outage.
