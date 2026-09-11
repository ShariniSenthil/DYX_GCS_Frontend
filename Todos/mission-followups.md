# Mission follow-ups

## Mission marking points — live update

Done. `WaypointsTable` folds live status into recycled rows (`extraData` / `dataVersion`).

## Rerun without reload

GCS now treats a still-loaded CSV as Start-eligible after COMPLETED/STOPPED.

- If mission-manager still has `ready`, Start goes straight through.
- If `loaded && !ready`, GCS calls `POST /api/mission/prepare` then Start. No Path Plan re-upload.
- Start clears run-scoped status and the previous canonical report (`mission_run_id` hold) so the table does not keep the last run as completed.

## Start delay

GCS no longer always waits on execution-mode and E-stop release before Start.

- Skip `POST /api/mission/execution-mode` when the mode already matches.
- Always `POST /api/estop/release` before Start (Complete/Stop can latch STOP without `emergency_stop=true`).
- If Start lands in a leftover PAUSED (not RTK/odom/failsafe), GCS auto-resumes once so the operator does not have to press Resume.
- Logs: `[MissionStartTiming] ...` for confirm, handle enter, mode, estop, Start POST, backend phase, first motion.
- Button/modal show Preparing / Arming / Switching offboard / Starting from backend state.

If Start HTTP itself is still slow, or wheels move only after `RUNNING`, that remaining wait is rover_backend / RPP / PX4 (trajectory rebuild, arm, OFFBOARD). Read the timing logs on the next field run before changing backend.
