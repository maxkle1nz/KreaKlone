# GPU Provider Pricing For The Fastest Krea-Like Stack

Generated on 2026-04-03.

## Scope

This document compares the most relevant rental options for the `fastest practical` Krea-like stack:

- `T4`
- `L4`
- `A10`
- `RTX 4090`
- `L40S`
- `fal.ai` as a hosted baseline for speed-first image APIs

The goal is not the absolute cheapest GPU. The goal is:

`the best speed/cost winner for burst preview + ROI editing + async refine`

## Important Pricing Rules

- `Monthly` below assumes `720 hours`
- Some providers quote `GPU only`, while others bundle CPU/RAM/storage
- Marketplace providers are dynamic; their prices move
- Serverless pricing is not directly comparable to an always-on VM

## Verified Price Table

| Provider | GPU / Product | Billing model | Verified price | 720h equivalent | Notes |
| --- | --- | --- | ---: | ---: | --- |
| LumaDock | `T4` | fixed monthly | `US$79.99/mo` | `US$79.99` | Cheapest fixed public T4 found |
| AWS | `g4dn.xlarge` (`T4`) | hourly VM | `US$0.526/hr` | `US$378.72/mo` | VM included |
| Google Cloud | `T4` GPU only | hourly GPU | `US$0.35/hr` | `US$252.00/mo` | Must add VM, disk, egress |
| Google Cloud | `g2-standard-4` (`L4`) | hourly VM | `US$0.70683228/hr` | `US$508.92/mo` | Includes L4-backed instance |
| Lambda | `A10` | hourly VM | `US$0.86/hr` | `US$619.20/mo` | VM/resources included |
| Runpod | `L4` Secure Cloud | hourly VM | `US$0.39/hr` | `US$280.80/mo` | Strong price/perf |
| Runpod | `RTX 4090` Secure Cloud | hourly VM | `US$0.59/hr` | `US$424.80/mo` | Best practical speed tier |
| Runpod | `L40S` Secure Cloud | hourly VM | `US$0.86/hr` | `US$619.20/mo` | Premium 48 GB path |
| TensorDock | `RTX 4090` | hourly VM | `from US$0.35/hr` | `from US$252.00/mo` | Marketplace-style, host-dependent |
| fal.ai | `Z-Image Turbo` | pay per MP | `US$0.005/MP` | N/A | Hosted API, not a dedicated GPU |

## Source Notes

### T4

- LumaDock publicly lists `NVIDIA T4` starting at `US$79.99/month`
- AWS `g4dn.xlarge` is publicly surfaced at `US$0.526/hr`
- Google Cloud lists `NVIDIA T4` at `US$0.35/hr` for the GPU alone

Sources:

- [LumaDock GPU VPS](https://lumadock.com/gpu-vps)
- [AWS G4 instances](https://aws.amazon.com/ec2/instance-types/g4/)
- [Google GPU pricing](https://cloud.google.com/compute/gpus-pricing?hl=en)

### L4

- Runpod groups `L4` in its 24 GB class and documents `US$0.39/hr` for Cloud GPU and `US$0.00019/s` flex serverless for the same 24 GB class
- Google Cloud surfaces `g2-standard-4` at `US$0.70683228/hr`

Sources:

- [Runpod pricing](https://www.runpod.io/pricing)
- [Runpod serverless pricing](https://docs.runpod.io/serverless/pricing)
- [Google Compute pricing](https://cloud.google.com/compute/all-pricing?authuser=002)

### A10

- Lambda publicly lists `1x NVIDIA A10` at `US$0.86/hr` on its current pricing page

Source:

- [Lambda AI Cloud pricing](https://lambda.ai/service/gpu-cloud/pricing)

### RTX 4090

- Runpod publicly lists `RTX 4090` at `US$0.59/hr`
- TensorDock publicly lists `RTX 4090` from `US$0.35/hr`

Sources:

- [Runpod RTX 4090](https://www.runpod.io/gpu-models/rtx-4090)
- [TensorDock 4090](https://www.tensordock.com/gpu-4090)
- [TensorDock cloud GPUs](https://tensordock.com/cloud-gpus)

### L40S

- Runpod publicly lists `L40S` at `US$0.86/hr`

Source:

- [Runpod L40S](https://www.runpod.io/gpu-models/l40s)

### fal.ai

- `Z-Image Turbo` is publicly priced at `US$0.005/MP`
- It supports fast text-to-image, image-to-image, and ControlNet variants

Sources:

- [fal Z-Image Turbo](https://fal.ai/z-image-turbo)
- [fal Z-Image Turbo model page](https://fal.ai/models/fal-ai/z-image/turbo)
- [fal image-to-image](https://fal.ai/models/fal-ai/z-image/turbo/image-to-image)

## What The Numbers Mean For This Product

## 1. T4 wins on price, not on product feel

`T4` is still the cheapest serious entry point.

But for the Krea-like stack we want, it should be treated as:

- PoC
- fallback
- low-end benchmark

It is not the winning answer for `fastest possible`.

## 2. L4 is the strongest low-cost serious option

`L4` is the cheapest GPU here that still looks like a serious production answer for fast preview work.

Why it wins:

- much better product fit than T4
- materially cheaper than A10 and 4090 on several clouds
- 24 GB VRAM class is enough for the proposed preview lane

Best current price I verified:

- `Runpod L4`: `US$0.39/hr`, or about `US$280.80/month`

## 3. 4090 is the practical speed winner

For single-user or small-team `speed-first` work, `RTX 4090` is the strongest practical winner.

Why:

- much stronger preview lane headroom than T4/L4
- much lower cost than enterprise-tier GPUs
- ideal fit for `SDXL-Turbo`, `FLUX.1-schnell`, and TensorRT-heavy preview serving

Best current public pricing I verified:

- `TensorDock 4090`: `from US$0.35/hr`
- `Runpod 4090`: `US$0.59/hr`

At `US$0.35/hr`, a 4090 works out to roughly `US$252.00/month`, which is below `Runpod L4` on the raw hourly number and dramatically stronger for this workload.

## 4. L40S is the premium pro option

`L40S` is the better “clean pro GPU” answer when you want:

- more VRAM headroom
- stronger concurrency
- more breathing room for preview and refine sharing

But it is not the value winner.

Verified:

- `Runpod L40S`: `US$0.86/hr` or `US$619.20/month`

## 5. fal.ai is the speed baseline, not the infrastructure winner

`fal.ai` matters because it gives you a speed-first hosted reference point.

For a product team, it is useful as:

- a benchmark for the feel you want
- a way to prototype product UX without immediately owning GPU orchestration

But it is not a “monthly GPU rental winner” because it is not sold that way.

## Ranking

### Cheapest fixed T4

1. `LumaDock T4` — `US$79.99/month`

### Best low-cost production candidate

1. `Runpod L4` — `US$0.39/hr`
2. `TensorDock 4090` — `from US$0.35/hr`, if available and acceptable operationally

### Best pure speed/cost winner

1. `TensorDock RTX 4090` — `from US$0.35/hr`
2. `Runpod RTX 4090` — `US$0.59/hr`
3. `Runpod L40S` — `US$0.86/hr`

### Best enterprise-clean but not cheapest

1. `Runpod L40S`
2. `Lambda A10`
3. `Google Cloud L4`

## Final Recommendation

For the Krea-like product we defined earlier:

### Winner if you want the fastest practical self-hosted stack

`RTX 4090`, ideally on `TensorDock` if you can actually secure inventory at the lower end of the quoted range, otherwise `Runpod RTX 4090`.

Why:

- best price/performance for the `preview lane`
- materially better speed headroom than `T4` and `L4`
- much cheaper than overbuilding on enterprise GPUs

### Winner if you want the safest balanced default

`Runpod L4`

Why:

- cleaner and more predictable than bargain marketplace hunting
- strong enough to be serious
- cheaper than `A10`, `4090` on many providers, and `L40S`

### Winner if you want the absolute cheapest way to start

`LumaDock T4`

Why:

- unbeatable public monthly fixed price
- good enough for PoC and benchmark work

### Hosted speed benchmark

`fal.ai`

Why:

- not the rental winner
- but the best way to compare your product feel against a highly optimized hosted baseline

## Recommended Buying Order

1. Start with `Runpod L4` if you want clean validation quickly
2. Move to `4090` if the preview lane still needs more headroom
3. Use `fal.ai` briefly to sanity-check UX expectations
4. Skip `T4` unless the main objective is minimal spend
