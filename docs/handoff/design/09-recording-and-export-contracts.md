# Recording And Export Contracts

## Recording Modes

Design should assume two recording modes:

### 1. Output-only

Records only the generated output stream / timeline result.

Use cases:

- export the evolving AI output
- create clips from timeline ranges

### 2. Full-session

Records the whole experience:

- left canvas
- right timeline/output
- user drawing actions
- controls and timeline playback

Use cases:

- tutorials
- social sharing
- process capture

## Recording UX Requirements

- Record button should be visible near playback controls
- User should understand whether they are recording output or full-session
- Timeline range selection should be reusable for recording
- Export artifact should feel like a first-class object, not a debug artifact

## Backend Direction

The intended backend contract is:

```ts
type RecordJob = {
  sessionId: string;
  source: "output" | "full-session";
  startFrameId?: string;
  endFrameId?: string;
  format: "mp4" | "gif" | "webm";
};
```

Current scaffold status:

- record controls exist as product direction
- backend recording is not fully implemented yet

Design can still move ahead with the control model and artifact expectations.
