# Component Inventory

## Goal

Enumerate the frontend components needed so design and implementation can cover the full product surface without guessing.

## Global Shell

- `AppShell`
- `TopToolbar`
- `StatusBadge`
- `ConnectionIndicator`
- `WorkerStatusIndicator`

## Left Side: Canvas And Tools

- `CanvasStage`
- `CanvasViewport`
- `ToolRail`
- `ToolButton`
- `BrushControls`
- `EraseControls`
- `MaskControls`
- `RegionSelectionOverlay`
- `LayerPanel`
- `LayerItem`
- `ReferencePanel`
- `ReferenceCard`
- `ReferenceUploadButton`
- `PromptPanel`
- `PromptTextarea`
- `NegativePromptTextarea`
- `StyleChipRow`
- `ModelSelector`
- `SeedControls`

## Right Side: Output And Timeline

- `OutputPanel`
- `CurrentFrameView`
- `TimelineRail`
- `TimelineFrameCard`
- `TimelineFrameThumbnail`
- `ActiveFrameBadge`
- `PinnedFrameBadge`
- `RefinedFrameBadge`
- `PlaybackControls`
- `PlayButton`
- `PauseButton`
- `TimelineScrubber`
- `TimelineCursor`
- `LoopControls`
- `LoopStartHandle`
- `LoopEndHandle`
- `LoopBadge`

## Frame Actions

- `FrameActionBar`
- `RefineButton`
- `UpscaleButton`
- `PinFrameButton`
- `RecordFromFrameButton`
- `CompareFrameButton`

## Recording

- `RecordButton`
- `RecordModePicker`
- `RecordingIndicator`
- `RecordingTimer`
- `RecordingCompleteCard`
- `ExportPanel`
- `ClipCard`

## System Feedback

- `ActivityLog`
- `Toast`
- `ErrorBanner`
- `InlineJobStatus`
- `QueueStatusPanel`
- `LoadingSkeleton`
- `EmptyState`

## Dialogs / Overlays

- `UploadDialog`
- `RefineDialog`
- `UpscaleDialog`
- `RecordDialog`
- `SettingsDialog`
- `BenchmarkInfoDialog`

## Responsive Variants

Design should define how these components behave on:

- desktop wide
- laptop
- tablet landscape
- mobile stacked fallback

## Priority

### Must-have for v1 design

- App shell
- Canvas stage
- Tool rail
- Prompt/reference modules
- Output panel
- Timeline rail
- Playback controls
- Loop controls
- Record controls
- Frame actions
- Error and empty states

### Good to define early

- model selector
- seed controls
- compare mode
- benchmark info

### Can remain future-facing

- advanced layer reorder UX
- collaborative presence
- multi-scene project management
