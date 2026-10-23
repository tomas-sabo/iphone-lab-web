# Local troubleshooting notes

## A pending-action list can hide a still-blocked workflow

A UI that reads only undecided operator requests is not a reliable view of workflows waiting for user input. A request may already contain an approval or comment while its underlying case still remains blocked because the supplied answer was incomplete or only authorized further preparation.

For Tinder status, use the validated `awaiting_details` array from the authenticated progress snapshot as the source of truth for the waiting-chat panel. Keep the aggregate count and detail count consistent. Render private fields with `textContent`, retain them only in memory, and refresh elapsed time independently of network polling. The generic operator request list remains a decision transport, not the workflow-status ledger.

## A stalled trigger can turn conservative polling into a deferred queue

When an event trigger stops advancing or is not delivered, a long fallback interval becomes the only discovery path. A ten-minute fallback combined with a per-run limit of three can let new work arrive faster than it is discovered and processed. The visible effect is delayed handling and a deferred queue even though the worker itself remains healthy.

Use a three-minute fallback scan, process up to ten eligible cases per run, and schedule another run whenever the completed pass reports `deferred > 0`. Keep idempotency and terminal-state guards in place so the faster recovery loop cannot repeat sent, uncertain, or already-started work.
