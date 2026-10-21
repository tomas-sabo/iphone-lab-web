Tomy operator panel — v1.1.0

GitHub Pages publishes dist/ on main pushes.
Bump app.js VERSION, sw.js RELEASE and index.html version together.
Private operator transport: tomas-sabo/bridge/operator/requests.
The public repository contains only client code and assets, never requests or keys.
Operator pairing: repo-scoped GitHub fine-grained PAT, Contents R/W, memory only.
Protocol and producer CLI: private bridge/operator/README.txt and operator_queue.py.
Decisions are stored with GitHub SHA compare-and-swap. No automatic sending.
Local checks: operator-bridge/tests test Python validation and mocked JS integration.
Browser verified: update, disconnected state. Real iPhone pairing remains required.
