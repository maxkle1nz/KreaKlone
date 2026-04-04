# Left Canvas Contract

## Purpose

The left canvas is the authoritative control surface for the composition.

It is not the generated output.

## User Actions The Backend Already Understands

The current backend contract supports these canvas events:

- `brush`
- `erase`
- `mask.update`
- `prompt.update`
- `reference.add`
- `reference.remove`
- `region.set`
- `image.import`

## Canvas Event Shape

```ts
type CanvasEvent =
  | { type: "brush"; strokeId: string; points: number[]; color: string; size: number; layerId: string }
  | { type: "erase"; strokeId: string; points: number[]; size: number; layerId: string }
  | { type: "mask.update"; maskId: string; points: number[]; mode: "add" | "subtract" }
  | { type: "prompt.update"; positive: string; negative?: string }
  | { type: "reference.add"; assetId: string; uri: string }
  | { type: "reference.remove"; assetId: string }
  | { type: "region.set"; x: number; y: number; width: number; height: number }
  | { type: "image.import"; assetId: string; uri: string; x: number; y: number };
```

## Design Implications

- The canvas should always expose a visible region/selection model.
- Brush and erase are modeled as point lists, so gestural tools are valid.
- Prompt edits are part of the canvas control model, not a disconnected form submission.
- Imported images and references should visually feel like part of the same composition state.

## Not Yet First-Class In Backend

These are desired soon, but not yet explicit backend event types:

- text objects on canvas
- layer reorder
- blend mode changes
- camera/composition transforms
- object pin / lock / visibility groups

Design can include them, but they should be clearly marked as future if needed.
