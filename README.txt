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
