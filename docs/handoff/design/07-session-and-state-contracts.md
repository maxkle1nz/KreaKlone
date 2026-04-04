# Session And State Contracts

## Current Session Shape

The scaffold currently stores session state like this:

```ts
type SessionState = {
  sessionId: string;
  version: number;
  layers: Array<{ id: string; assetId?: string; visible: boolean }>;
  masks: Array<{ id: string }>;
  prompt: { positive: string; negative: string };
  references: string[];
  activeRoi?: { x: number; y: number; width: number; height: number };
  seedHistory: number[];
  selectedVariantId?: string;
  activeFrameId?: string;
  timelineFrames: any[];
  loopRange?: { startFrameId: string; endFrameId: string };
  latestRefinedAssetId?: string;
  latestUpscaledAssetId?: string;
  latestRecordingAssetId?: string;
  importedAssetId?: string;
  strokes: any[];
  updatedAt: string;
};
```

## Versioning Rule

Every meaningful user edit increments `version`.

That means:

- the frontend should expect session state to advance frequently
- stale inference results must be visually treated as discardable

## Design Implications

- Show the user what is current vs stale
- make timeline selection explicit
- make loop range state explicit
- make refine/upscale/record output state explicit

## State That Designers Can Depend On

- `prompt`
- `references`
- `activeRoi`
- `timelineFrames`
- `activeFrameId`
- `latestRefinedAssetId`
- `latestUpscaledAssetId`
- `latestRecordingAssetId`

## State Still In Transition

- `selectedVariantId` still exists in code
- this is a legacy scaffold concept that should eventually give way to frame-first naming
