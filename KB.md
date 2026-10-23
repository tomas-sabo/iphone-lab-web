# Local troubleshooting notes

## A pending-action list can hide a still-blocked workflow

A UI that reads only undecided operator requests is not a reliable view of workflows waiting for user input. A request may already contain an approval or comment while its underlying case still remains blocked because the supplied answer was incomplete or only authorized further preparation.

For Tinder status, use the validated `awaiting_details` array from the authenticated progress snapshot as the source of truth for the waiting-chat panel. Keep the aggregate count and detail count consistent. Render private fields with `textContent`, retain them only in memory, and refresh elapsed time independently of network polling. The generic operator request list remains a decision transport, not the workflow-status ledger.
