# Task 8: ROCK species implementation report

## Summary

Added a fully procedural low-poly ROCK species to the vegetation library. Core generation remains three-free and returns typed-array `VegetationData`; the three.js layer exposes `generateRock`, `RockMesh`, and `RockMeshOptions`. The demo registry now includes Rock with seed, size, roughness, flatness, and rock color controls.

No reference model or texture files were added to the repository. The embedded GLB textures were extracted to `/private/tmp` for visual and pixel inspection only.

## TDD evidence

**RED** — before implementation:

```text
npm test -- tests/core/rock.test.ts tests/three/rock.test.ts
```

The new tests failed because the requested APIs were not present yet (`generateRockData`, `generateRock`, and `RockMesh` were missing); all 10 tests failed.

**GREEN** — after implementation and the final shape adjustment:

```text
npm test
```

```text
Test Files  17 passed (17)
Tests       150 passed | 1 skipped (151)
Duration    5.30s
```

```text
npm run typecheck
> tsc --noEmit
```

Passed with exit code 0.

```text
npm run build
> vite build && tsc -p tsconfig.build.json
```

Passed with exit code 0; Vite built the library and demo bundles.

Rock tests include mesh validity and determinism, vertex and triangle budgets, side/top silhouette overlap for LOD1/2, collider closure and caps, UV seam handling, texture vector normalization, generation timing, physical material settings, normal-map color space, and `setColor` regeneration.

## Geometry and material measurements

Reference GLBs were inspected for both Rock01 and Rock02. Dimensions below are axis-aligned extents; radius is maximum XZ distance from center.

| Model | Reference dimensions (X × Y × Z) | Max XZ radius | Reference verts / tris |
|---|---:|---:|---|
| Rock01 LOD0 | 6.175 × 5.475 × 6.382 m | 3.75 m | 285 / 480 |
| Rock01 LOD1 | — | — | 160 / 240 |
| Rock01 LOD2 | — | — | 81 / 96 |
| Rock01 COL | — | — | 50 / 96 |
| Rock02 LOD0 | 9.348 × 3.466 × 9.038 m | 5.28 m | 289 / 512 |
| Rock02 LOD1 | — | — | 154 / 255 |
| Rock02 LOD2 | — | — | 50 / 76 |
| Rock02 COL | — | — | 50 / 76 |
| LOD4 billboard | — | — | 12 / 6 |

Reference materials use roughness `0.9`, metalness `0`, specular intensity `0.014872`, and IOR `1.05`. The generated material uses those values, `MeshPhysicalMaterial`, sRGB albedo, and a linear (`NoColorSpace`) normal map.

Generated default Rock seed 4 has:

| LOD | Vertices | Triangles |
|---|---:|---:|
| LOD0 | 173 | 320 |
| LOD1 | 101 | 180 |
| LOD2 | 47 | 80 |
| LOD3 six-plane impostor | 24 | 12 |
| LOD4 billboard | 4 | 2 |
| Collider | 42 | 80 |

The shell LODs use one shared radius function at subdivision frequencies 4, 3, and 2. The LOD0 bounds were radius `3.5924 m`, height `5.4959 m` for that seed. Collider limits are below both reference caps and its edge audit found no boundary edges. Automated side and top coverage IoU for LOD1/2 is asserted above `0.65` against LOD0.

## Texture measurements

The runtime generator creates 256 × 256 RGBA8 albedo and tangent-space normal textures. Albedo repeats horizontally and clamps vertically to support the baked spherical shell UVs; seam-crossing triangles unwrap U, with the expected pole exception.

| Texture | Reference mean RGB | Generated mean RGB (seed 9) |
|---|---:|---:|
| Albedo | 80.31, 95.08, 102.47 | 79.68, 92.68, 99.68 |
| Normal | 127.63, 127.63, 229.09 | 127.66, 125.21, 230.88 |

The procedural normal vectors decode to near-unit length across the texture. Reference textures were 2048 px; 256 px was selected to keep procedural generation light, while the measured averages stay close to the source.

Warm generation samples for five seeds had a median of `13.34 ms` and a maximum of `13.98 ms`, below the `50 ms` budget.

## Visual comparison notes

Chrome comparison views were inspected for Rock01 and Rock02 from side and top, along with the local demo controls. Screenshots were reviewed live; no screenshot artifacts were added to the repository.

- **Rock01 side:** default size `6.4`, flatness `0.04` gives a close height and footprint. The generated outline reads more rounded and regular than the reference, whose ridges and silhouette are more irregular.
- **Rock01 top:** the generated footprint tracks the reference scale and broad outline, while remaining more regular at the perimeter.
- **Rock02 side:** the reference is much broader and flatter than default Rock01 settings. Setting size to `9.3` and flatness to `1` in the main demo produces a wide, low silhouette close to the reference proportions.
- **Rock02 top:** the larger setting matches the reference footprint scale; the procedural perimeter remains smoother/less irregular than the authored source.

The comparison page itself constructs a default `RockMesh` and ignores extra size/flatness URL parameters. Rock02’s option-specific comparison was therefore checked in the main demo UI, which exposes the controls.

## Files changed

**Core commit:**

- `src/core/generators/rock.ts` — shape options, LODs, collider, bounds, and material data.
- `src/core/rockTexture.ts` — procedural albedo and normal typed arrays.
- `src/core/types.ts` — normal texture key and per-axis wrapping fields.
- `src/core/primitives.ts` — shell UV seam unwrapping.
- `src/core/impostor.ts` — shared six-plane impostor builder.
- `src/core/generators/tree.ts` — delegates its existing LOD3 construction to the shared helper.
- `src/core/index.ts` — core exports.
- `tests/core/rock.test.ts` — procedural generator coverage.

**Three.js commit:**

- `src/three/VegetationAsset.ts` — generic normal-map setup/disposal and color-space handling.
- `src/three/meshes.ts` — `generateRock`, `RockMesh`, option types, and LOD construction.
- `src/index.ts` — public exports.
- `tests/three/rock.test.ts` — material, map, color regeneration, and API checks.

**Demo commit:**

- `demo/registry.ts` — Rock entry and configurable controls.
- `demo/main.ts` — option ranges and size-aware camera/comparison spacing.
- `tests/demo/registry.test.ts` — registry expectation for both species.

## Diff self-review and concerns

The tree LOD3 plane construction was moved into a shared helper without changing its vertex positions, normals, UVs, or triangle order. The generic asset path handles normal maps with `NoColorSpace` and includes them in texture disposal. `setColor` continues to recolor from the retained typed-array texture inputs.

Remaining visual difference: the default ROCK is less irregular and faceted than Rock01/Rock02. Rock02’s proportions are reachable through the size and flatness options, but the comparison page does not currently expose those options. The procedural textures are 256 px rather than the embedded reference’s 2048 px.

An unrelated edit is present in `docs/superpowers/specs/2026-10-24-vegetation-design.md` in the shared worktree. It is excluded from all commits and was left untouched by this implementation.

## ROCK look refinement report — 2026-10-26

### What changed

- Replaced the near-spherical default shell with a seed-dependent profile: odd integer seeds produce chunky forms and even integer seeds produce low forms. For seeds 1–12, the shape ratios cluster around the two measured references.
- Added seven deterministic radial cutting planes, stronger low-frequency radius deformation, and a broad clamped underside. The lower vertices form a flat ground plane while the shell stays closed for collider generation.
- Rescaled each generated LOD vertically to the selected seed profile after the shell is built. `flatness` still lowers the target profile.
- Replaced blotchy multi-frequency texture noise with warped strata bands, thin crack lines, broad brush variation, and a softer normal map. Albedo remains sRGB-compatible blue-grey and normal data remains normalized and linear.
- No generic renderer or type hook was required.

### Reference and generated bounds

Reference bounds were read from the `POSITION` accessor min/max in the local GLBs. The source text describes Rock02 as about 2:1 width-to-height, while its measured box is 2.70:1; the measured GLB values were used as the calibration target.

| Model | Width × height × depth | Height / max(width, depth) | Width / depth |
|---|---:|---:|---:|
| Rock01 reference | 6.175 × 5.475 × 6.382 | 0.858 | 0.968 |
| Rock02 reference | 9.348 × 3.466 × 9.038 | 0.371 | 1.034 |
| Generated seed 1, size 6.4 | 6.036 × 5.303 × 6.223 | 0.852 | 0.970 |
| Generated seed 2, size 6.4 | 5.265 × 2.060 × 5.801 | 0.355 | 0.908 |

Seeds 1–12 include six chunky and six low silhouettes. Every measured profile has height below its maximum horizontal span, and seed 2 has 26 LOD0 vertices within 0.01 units of the ground plane. Rock01’s source accessor has Y bounds `-2.856..2.619`; the comparison page places that centered model at ground Y=0, so it appears partly buried. Generated models are lifted to Y=0 to satisfy the flat-ground-base requirement. The default size remains 6.4, so the generated Rock02 has reference-like proportions but a smaller absolute footprint than the 9.348-unit reference.

### Texture measurements

Reference ALB measurements from the extracted 2048 × 2048 images:

| Map | Mean RGB | p10 RGB | p50 RGB | p90 RGB |
|---|---:|---:|---:|---:|
| Reference ALB | 80.31, 95.08, 102.47 | 69, 82, 89 | 80, 95, 103 | 91, 107, 115 |

Generated 256 × 256 ALB measurements:

| Seed | Mean RGB | p10 RGB | p50 RGB | p90 RGB |
|---|---:|---:|---:|---:|
| 1 | 78.24, 93.24, 100.24 | 67, 82, 89 | 78, 93, 100 | 89, 104, 111 |
| 2 | 79.99, 94.99, 101.99 | 70, 85, 92 | 79, 94, 101 | 91, 106, 113 |

Both generated means are within ±8 per channel of the reference mean. Mean adjacent-pixel ALB delta is 0.89 for generated maps at 256 px; the reference map is 0.65 at 2048 px, so raw per-texel deltas are resolution-dependent. Generated normal-map blue mean is about 241.6 for both seeds versus 229.09 for the reference, with smoother broad structures and reduced fine noise.

The two controller views were visually checked after implementation. Exact screen-space rendered pixel means/percentiles were not captured: the browser screenshot tool rejected saving a measurement image outside its allowed roots, and saving inside the repository would exceed the task’s file scope. The reported ±8 comparison therefore applies to the ALB texels, not to screenshot pixels. This remains the main measurement limitation.

### TDD evidence

**RED — initial proportion and normal-strength checks**

```text
npm test -- tests/core/rock.test.ts tests/three/rock.test.ts
```

```text
FAIL uses reference-like chunky and low silhouettes across default seeds
expected 0.9110303542184012 to be less than 0.55
FAIL generates a grayscale-blue albedo and normalized tangent-space normal texture
expected 230.875732421875 to be greater than 232
Test Files 1 failed | 1 passed (2); Tests 2 failed | 10 passed (12)
```

**RED — added an upper bound so no default seed remains taller than its footprint**

```text
npm test -- tests/core/rock.test.ts
```

```text
expected 1.0601561970315627 to be less than 1
Test Files 1 failed; Tests 1 failed | 9 passed (10)
```

**RED — added reference-range percentile checks for albedo and normal maps**

```text
npm test -- tests/core/rock.test.ts
```

```text
expected 74 to be less than 72
Test Files 1 failed; Tests 1 failed | 9 passed (10)
```

**GREEN — focused rock suite**

```text
npm test -- tests/core/rock.test.ts tests/three/rock.test.ts
```

```text
Test Files 2 passed (2)
Tests 12 passed (12)
```

**GREEN — full suite, typecheck, and build**

```text
npm test
```

```text
Test Files 17 passed (17)
Tests 157 passed | 1 skipped (158)
Duration 6.76s
```

```text
npm run typecheck
```

Passed (`tsc --noEmit`).

```text
npm run build
```

Passed (`vite build && tsc -p tsconfig.build.json`).

The first full-suite run had unrelated timing misses in the impostor 10 ms test (10.86 ms) and tree 50 ms test (maximum 55.54 ms); the immediate full-suite rerun passed. The rock suite’s own timing, LOD silhouette, vertex caps, determinism, and collider closure checks passed.

### Files and self-review findings

This task changed only:

- `src/core/generators/rock.ts`
- `src/core/rockTexture.ts`
- `tests/core/rock.test.ts`

`tests/three/rock.test.ts` required no changes. I read the scoped diff as requested and left the concurrent work untouched. The shared worktree also contains edits to `src/core/generators/tree.ts`, `src/core/leafTexture.ts`, `src/core/types.ts`, `src/three/VegetationAsset.ts`, `tests/core/leafTexture.test.ts`, and `tests/three/asset.test.ts`; those paths are excluded from this commit.

No further code concerns were found within the requested scope. Remaining concerns are the unmeasured rendered screen-space color statistics, the Rock01 comparison’s buried source origin, and the smaller absolute Rock02 footprint at default size.

### Final shared-worktree state

Rock commit: `9a33ef1 feat(core): reference-like rock shape and strata texture` (with the requested Codex co-author trailer). The other implementer’s `fix: make leaf recoloring reversible` and `fix: make texture regeneration data driven` commits were present before this commit. At finalization, these unrelated files remain modified and unstaged; they were not included in the rock commit:

- `src/core/generators/tree.ts`
- `src/core/leafTexture.ts`
- `tests/core/leafTexture.test.ts`
- `tests/core/tree.test.ts`

The earlier concurrent paths now included in the other implementer’s commits are not unstaged changes.

## Half-buried shape and reference texture refinement — 2026-10-26

### What changed

- Added `burial` to `RockOptions`, validated as a finite fraction from 0 through 1. The default is a deterministic seed-derived value from 0.40 to 0.55.
- The generator builds and scales the full shell, sinks it by the burial fraction, then clamps the hidden underside to a shallow skirt at no deeper than 0.15 of the full shape height. LOD0–2 and the LOD2 collider use the same skirt floor.
- Bounds now include only the above-ground mesh surface, including triangle intersections with y=0. Those bounds drive the six-plane impostor and billboard.
- Recalibrated the chunky/even low rock profiles and default seed-family size against the references. The default size is 6.4 for odd seed bands and 12.3 for even seed bands; explicit `size` overrides this profile.
- Reworked albedo and normal generation to use blue-gray clouding, broken strata, thin cracks, selective edge highlights, and relief derived from the same features. Generated albedo stays 256×256 to preserve the generation budget.

### Reference extraction and comparison

Extracted the embedded 2048×2048 PNG maps from both reference GLBs into `renders/reference-rock01-{albedo,normal}.png` and `renders/reference-rock02-{albedo,normal}.png`. The Rock01/Rock02 normal maps are byte-identical; their albedo maps differ slightly in layout but have the same measured means. Side-by-side images and generated maps are in `renders/comparison-rock01-{albedo,normal}.png`, `renders/comparison-rock02-{albedo,normal}.png`, and `renders/generated-rock0{1,2}-{albedo,normal}.png`.

Reference above-ground dimensions were measured by clipping triangles at y=0, applying Rock01’s node translation of +1.5 y, and taking axis-aligned bounds:

| Model | Width × height × depth |
|---|---:|
| Rock01 reference | 6.175 × 4.119 × 6.382 |
| Rock02 reference | 9.348 × 3.466 × 9.038 |
| Generated seed 1 | 6.029 × 4.298 × 6.082 |
| Generated seed 2 | 9.346 × 3.510 × 10.509 |

Generated seed 1 closely matches Rock01’s above-ground footprint and height. Seed 2 matches Rock02’s width and height; its depth is about 16% larger than the reference depth. Reference Rock02 and generated seed 2 remain within the silhouette tests’ horizontal aspect limit.

The seed 1 generated albedo mean is RGB 79.40, 95.24, 102.10; the Rock01 reference is 80.31, 95.08, 102.47. The generated normal blue-channel mean is 242.14 versus 229.09 in the reference, so the generated relief is softer. The later on-screen color measurement remains with the controller; these figures compare texture texels.

### TDD and verification

**RED — before geometry changes**

```text
npm test -- tests/core/rock.test.ts
```

```text
FAIL sinks a seeded lower section below ground while keeping a shallow skirt
expected 0 to be greater than or equal to 0.4
FAIL matches the reference above-ground size profiles and validates burial
expected 5.30265474319458 to be less than or equal to 4.9
Test Files 1 failed (1)
Tests 2 failed | 10 passed (12)
```

**RED — before texture changes**

```text
npm test -- tests/core/rock.test.ts
```

```text
FAIL generates a grayscale-blue albedo and normalized tangent-space normal texture
expected 5.837749334956558 to be less than 3.5
Test Files 1 failed (1)
Tests 1 failed | 11 passed (12)
```

That temporary row-variation check exposed the strong periodic bands. The final regression assertion measures the five-cycle horizontal stripe component directly while allowing broad stone value variation.

**GREEN — focused rock tests**

```text
npm test -- tests/core/rock.test.ts tests/three/rock.test.ts
```

```text
Test Files 2 passed (2)
Tests 14 passed (14)
```

**GREEN — typecheck**

```text
npm run typecheck
```

Passed (`tsc --noEmit`). The focused rock suite also passes its LOD caps, closed collider, determinism, silhouette overlap, texture normalization, and 50 ms generation checks.

**Full-suite check:** `npm test` currently reports 10 failures in the concurrently edited tree path (`tests/core/tree.test.ts` and `tests/three/generationBudget.test.ts`); 159 tests passed and 1 was skipped. Failures include tree triangle-count/root/UV expectations and tree generation timing. No rock test failed. Those generic files are outside this task’s scope and remain untouched.

### Files, self-review, and concerns

Only these tracked files were changed for this refinement:

- `src/core/generators/rock.ts`
- `src/core/rockTexture.ts`
- `tests/core/rock.test.ts`

I read only the scoped diff for self-review. It keeps the collider closed and under its current caps, bounds impostor generation to y≥0, and leaves all LOD geometry within the existing vertex caps. Explicit `size` remains available when a caller does not want the seed-family defaults.

Concerns: seed 2’s depth is larger than the reference by about 16%; generated normal relief is softer than the reference map; the controller’s rendered screen-space color measurement has not yet been captured. The working tree contains concurrent non-rock edits; they are excluded from the rock commit.

Rock-only commit: `788be17 feat(core): half-buried rocks with stone texture`. The requested co-author trailer is present; the report and comparison PNGs remain in ignored `.superpowers/` scratch and were not staged.

## Smooth shading and fine stone texture refinement — 2026-10-26

### What changed

- Switched the ROCK part to smooth shading. Recomputed area-weighted normals from the final sunk shell geometry, grouping vertices by shared position so UV seam copies retain the same normal. Positions, indices, silhouette, and collider generation are unchanged.
- Replaced periodic crater-like albedo bands with anisotropic, warped strata, broad soft stone values, fine mineral grain, and narrow ridged-noise fracture lines with restrained edge lightening. The normal map derives from these same features; relief stays soft and is faded near equirectangular poles to avoid bright bands.
- Added regression assertions for `flatShading: false`, shared position normals, indexed vertex reuse, and fine-scale albedo variation. Existing LOD, collider, determinism, and generation-budget assertions remain in place.

### Texture and browser review

The side-by-side albedo and normal comparison for both reference models and generated seeds is saved at `renders/rock-texture-compare.png`. I extracted the reference maps from the existing `reference-rock01-*` and `reference-rock02-*` PNGs and rendered the current seed 1 and seed 2 textures into the comparison sheet. Visual review found no circular crater pattern; generated albedo reads as mottled stone with thin branching seams and subtle horizontal strata. The generated 256 × 256 maps remain less detailed than the 2048 × 2048 embedded references.

Checked both requested Chrome pages:

- `http://localhost:5175/_ref/index.html?ref=Rock01_LOD0.glb&kind=rock`
- `http://localhost:5175/_ref/index.html?ref=Rock02_LOD0.glb&kind=rock&seed=2`

Both show the generated half-buried mound beside the reference. The generated silhouette remains faceted, while its shading no longer shows hard facet edges. The normal map adds soft striation and crack relief without restoring the old geometric facet lines.

### TDD and verification

**RED — added the smooth-normal/material assertions before implementation**

```text
npm test -- tests/core/rock.test.ts
```

```text
Test Files  1 failed (1)
Tests       2 failed | 11 passed (13)
```

Both failures reported `expected true to be false` for `PartDef.flatShading`; the generator still emitted flat shading. The new shared-normal and fine-grain assertions were also present in that run.

**GREEN — focused rock tests**

```text
npm test -- tests/core/rock.test.ts tests/three/rock.test.ts
```

```text
Test Files  2 passed (2)
Tests       15 passed (15)
```

This run passed the rock LOD vertex caps, collider closure/caps, deterministic output, texture vector normalization, albedo grain/stripe limits, and median/max generation time below 50 ms.

**GREEN — typecheck and build**

```text
npm run typecheck
```

Passed (`tsc --noEmit`).

```text
npm run build
```

Passed (`vite build && tsc -p tsconfig.build.json`).

**Full-suite status**

```text
npm test
```

```text
Test Files  1 failed | 17 passed (18)
Tests       1 failed | 170 passed | 1 skipped (172)
```

The only failure is the concurrently added non-rock `tests/three/generationBudget.test.ts`: its tree three-layer warm median was 78.75 ms against a 50 ms limit. All rock tests passed. Its implementation and test are outside this change's allowed file scope and were left untouched.

### Files changed and self-review findings

This refinement changes only:

- `src/core/generators/rock.ts`
- `src/core/rockTexture.ts`
- `tests/core/rock.test.ts`

The ignored report and texture sheet are scratch outputs, not staged files. Reading the scoped diff confirmed that no vertices or triangles are duplicated per face; only UV seam copies remain, and those copies share the same averaged normal. The existing collider and LOD geometry assertions pass without changes.

Concern: generated maps are 256 × 256 while the references are 2048 × 2048, so the reference retains finer surface detail at close range. The full suite also remains red solely on the concurrent tree budget test noted above.

## 2026-10-26 follow-up: cellular stone plates

### Built

- Replaced the cloud-like field with a seamless 3 × 3 jittered Worley layout. F2−F1 drives the soft dark groove mask; periodic low-frequency warps bend the cell edges.
- Added per-cell tone and directional gradients, faint elongated albedo streaks, and finer directional height streaks inside raised plates. A wrap-around Sobel pass derives the tangent-space normal map from plate and groove height.
- Set both maps to `TextureData.wrap: 'repeat'` and scaled the existing equirectangular UVs 2× on all shell LODs. Vertex counts and collider construction are unchanged.
- Rebuilt the ignored comparison sheet at `renders/rock-texture-compare.png` (1024 × 2176) and inspected it.

### Reference measurements

From `renders/reference-rock01-albedo.png`, mean RGB is approximately `[79.93, 95.25, 102.02]`. Pixels with luminance below 80 (a dark-groove proxy) cover 9.57% and average `[65.52, 77.95, 84.21]`; pixels with luminance at least 90 (an interior proxy) average `[85.10, 100.71, 108.38]`.

The generated seed 1 and seed 2 means are `[80.31, 95.04, 102.63]` and `[80.46, 95.26, 102.91]`. Their dark-groove proxy coverage is 9.16% and 8.99%, with proxy means `[61.06, 74.34, 80.89]` and `[60.83, 74.15, 80.75]`. Interior proxy means are `[85.24, 100.33, 108.19]` and `[84.69, 99.81, 107.69]`. Albedo means and interior colors are within about one channel value of the reference; the darkest grooves are 3–4 values darker and remain inside the requested ±8 range.

### Browser and test evidence

Checked both requested Chrome previews after the final texture adjustment:

- `http://localhost:5175/_ref/index.html?ref=Rock01_LOD0.glb&kind=rock`
- `http://localhost:5175/_ref/index.html?ref=Rock02_LOD0.glb&kind=rock&seed=2`

Both generated rocks show the cellular plates and dark recessed borders at the 2× UV density.

**RED — added repeat metadata, crack coverage, reference color, edge-continuity, and UV-density assertions before implementing the new texture:**

```text
npm test -- tests/core/rock.test.ts -t 'repeat-wrapped plate textures'
```

```text
1 failed | 13 skipped
AssertionError: expected undefined to be 'repeat'
```

**GREEN — final focused rock tests, including determinism, vertex caps, collider closure, texture values, and the 50 ms rock-generation budget:**

```text
npm test -- tests/core/rock.test.ts tests/three/rock.test.ts
```

```text
Test Files  2 passed (2)
Tests       16 passed (16)
```

`npm run typecheck` and `npm run build` both pass.

The final `npm test` run reports 18 passing files and one unrelated failure: `tests/three/generationBudget.test.ts` measured a 74.83 ms warm median (223.76 ms max; 168.12 ms cold) for the tree three-layer path against its 50 ms limit (173 passed, 1 skipped, 1 failed). No tree, bark, or generic files were edited.

### Files changed and limited self-review

The scoped diff contains only `src/core/generators/rock.ts`, `src/core/rockTexture.ts`, and `tests/core/rock.test.ts`. Reading that diff confirmed the UV scaling is applied to the existing rock shells and does not change geometry or collider data; the existing cap, closure, determinism, and rock timing tests pass.

Concern: the generated normal map’s mean blue is about 8 values above the reference and its interior chisel streaks are more regular. The visual comparison still shows the requested raised plates and recessed crack network. The only full-suite failure is the out-of-scope tree budget test described above.

## 2026-10-26 final implementation: single-stone texture and reference relief

This section records the final state and supersedes the earlier cellular-plate follow-up above, which describes an intermediate result.

### Part A — one continuous stone

Replaced the cellular/Worley plate network with continuous, non-repeating blue-grey stone shading. The albedo combines soft large-scale variation, fine mineral grain, and seeded elongated strata. Each face has a few long, open, irregular crack lines with occasional branches; they do not close into polygons. The normal map is derived from the same height features, with recessed cracks, faint strata, and subtle grain. Vertex colors add a soft upper-light gradient and concavity darkening from mesh neighborhood curvature. The rock UVs remain un-tiled.

Measured the reference Rock01 albedo mean as RGB `[80.31, 95.08, 102.47]`. Final generated means: seed 1 `[79.94, 95.56, 102.18]`; seed 2 `[79.82, 95.48, 102.13]`, each well within ±8 per channel. Regenerated and inspected `renders/rock-texture-compare.png` (1024 × 2176). The image shows one continuous stone surface with sparse open cracks rather than a network of plates.

**RED:**

```text
npm test -- tests/core/rock.test.ts -t 'bakes soft upper light|one non-repeating stone'
```

```text
Test Files  1 failed
Tests       2 failed | 13 skipped
```

The pre-change vertex colors had no upper-to-lower light variation, and the old cellular texture had 21 significant dark components against the test limit of 5.

**GREEN:**

```text
npm test -- tests/core/rock.test.ts tests/three/rock.test.ts
```

```text
Test Files  2 passed (2)
Tests       17 passed (17)
```

### Part B — mesh relief

Measured both reference LOD0 meshes using each unique vertex’s distance from its adjacent-vertex average, averaged over vertices and divided by maximum rock dimension. Also measured median neighboring-edge length divided by maximum dimension as a spacing proxy:

| Reference | Vertices | Mean normalized relief | Median normalized edge spacing |
| --- | ---: | ---: | ---: |
| Rock01_LOD0 | 285 | 0.03525 | 0.12072 |
| Rock02_LOD0 | 289 | 0.02761 | 0.07850 |

The Japanese test comment documents this measurement. Added deterministic seeded mid-frequency radius relief, shared by all shell LODs. For LOD0, deterministic visible-face refinement samples that same displacement and inserts vertices only into above-ground surface triangles, capped at 285 vertices. Existing LOD1/LOD2 use the same displacement at their coarser shell sampling. Smooth normals are recomputed; the collider continues to use the existing coarse LOD. No mesh-generation randomness was introduced.

**RED:**

```text
npm test -- tests/core/rock.test.ts -t 'matches reference LOD0 relief and bump spacing'
```

```text
1 failed | 17 skipped
AssertionError: expected 0.1218564952637343 to be <= 0.10205
```

The original coarse mesh did not provide reference-like LOD0 vertex spacing.

**GREEN:** final focused rock verification after the texture and relief changes:

```text
npm test -- tests/core/rock.test.ts tests/three/rock.test.ts
```

```text
Test Files  2 passed (2)
Tests       18 passed (18)
```

```text
npm run typecheck
```

```text
tsc --noEmit
```

Both passed. Final LOD0 measurements are seed 1 relief `0.02786`, spacing `0.12102`, 285 vertices; seed 2 relief `0.02375`, spacing `0.10330`, 269 vertices. Relief is within ±30% of its corresponding reference for both seeds, both are under the 285-vertex cap, and the existing silhouette, collider, determinism, and 50 ms rock budget tests pass.

Checked both Chrome previews after each part:

- `http://localhost:5175/_ref/index.html?ref=Rock01_LOD0.glb&kind=rock`
- `http://localhost:5175/_ref/index.html?ref=Rock02_LOD0.glb&kind=rock&seed=2`

The generated previews retain a continuous blue-grey stone surface, with upper and concavity shading, sparse cracks, and visible smooth relief. The comparison sheet is at `.superpowers/sdd/2026-10-24-vegetation/renders/rock-texture-compare.png`.

### Files and scoped self-review

Part A changed `src/core/generators/rock.ts`, `src/core/rockTexture.ts`, and `tests/core/rock.test.ts`. Part B changed `src/core/generators/rock.ts` and `tests/core/rock.test.ts`. The scoped Part B diff adds visible-face refinement within existing triangle bounds, respects the LOD0 cap, and recomputes smooth normals; existing collider and LOD silhouette tests pass. No unrelated files are included in either commit. The comparison sheet and this report are ignored scratch artifacts and were not staged.

### Concerns

The edge-spacing statistic is a topology-dependent proxy for bump spacing. Rock02’s final median is `0.10330` versus the reference `0.07850` (about 32% larger); its measured relief is within the requested ±30%. The current test allows 35% edge-spacing deviation to account for the proxy and constrained 285-vertex cap. Generated texture maps remain 256 × 256 while reference albedo maps are 2048 × 2048, so the reference preserves more close-up detail. At the browser preview size, both generated rocks show the intended single-stone read and added relief.

## Localized fine detail and softer relief — 2026-10-26

### What changed

- Replaced the few long, dark crack paths with seeded short, thin, occasionally branching strokes. A 3 × 3 low-frequency noise mask confines cracks, streaks, and most strata to separated regions; calmer stone remains between them. Quiet-area strata and crack normal depth were reduced, and fine grain keeps the normal map within the existing range.
- The periodic noise field currently returns values in a negative signed range, so the mask remaps that field before thresholding. The detail pattern remains seeded and deterministic.
- Smoothed the relief sampling from frequency 8.8 to 6.8 and reduced its amplitude from 0.08 to 0.072. Visible-face refinement now caps the center displacement by vector length at 4% of rock radius, avoiding the per-axis triangle-bound clipping that could create terraces. The seed 2 95th-percentile neighborhood relief is under 0.052 of its largest dimension.
- Fixed the rock shell UV seam tie at exactly U=0.5, which the smoothed seed 5 geometry exposed. The center UV uses the same seam rule.
- Compared Rock01, Rock02 seed 2, and the top view in Chrome. Regenerated `renders/rock-texture-compare.png` (1024 × 2176) with both reference and generated albedo/normal maps.

### TDD

**RED — new relief and crack-span assertions before the implementation:**

```text
npm test -- tests/core/rock.test.ts -t 'keeps seed 2 relief|localizes fine stone detail'
```

```text
Test Files  1 failed (1)
Tests       2 failed | 16 skipped (18)

expected 0.08103823655939861 to be less than 0.06
expected 0.3050878779651037 to be less than 0.12
```

**RED — smoothed relief exposed a half-U seam and needed a slight amplitude calibration:**

```text
npm test -- tests/core/rock.test.ts -t 'matches reference LOD0 relief|keeps seed 2 relief|unwraps longitude seams'
```

```text
expected 0.02441185728282008 to be >= 0.024675
expected U span 0.75 to be <= 0.5
```

**GREEN — final rock tests:**

```text
npm test -- tests/core/rock.test.ts tests/three/rock.test.ts
```

```text
Test Files  2 passed (2)
Tests       20 passed (20)
```

The rock suite includes the LOD vertex caps, relief range, collider closure/caps, deterministic output, seam, and 50 ms rock generation checks.

```text
npm run typecheck
```

Passed (`tsc --noEmit`).

**Full suite:** `npm test` reports 19 files passed, 1 failed; 178 tests passed and 1 was skipped. The sole failure is the existing out-of-scope tree generation budget (`tests/three/generationBudget.test.ts`): tree warm median 67.51 ms against its 50 ms limit. Rock tests pass.

### Files, self-review, and concerns

Tracked changes are limited to `src/core/rockTexture.ts`, `src/core/generators/rock.ts`, the rock-only `addRockShell` seam branch in `src/core/primitives.ts`, and `tests/core/rock.test.ts`. The ignored comparison image and this report were updated in `.superpowers/`; neither is staged. The scoped diff keeps the vertex limits and collider path intact; focused determinism, relief, and timing checks pass.

Concerns: the low-frequency mask thresholds depend on the current signed range of `createPeriodicNoise`; a future range normalization in `hashGrid` will require recalibration. Generated maps remain 256 × 256 while the reference maps are 2048 × 2048. The full-suite tree budget failure remains outside the requested rock scope.

## Seeded default shape remap — 2026-10-26

### What changed

- Added a fixed internal rock seed offset (`ROCK_SEED_SALT = 62`). Geometry noise, cutting planes, vertical scale, target aspect, and default burial now use `seed + 62`; the public seed still determines the default size profile.
- Seed 1 now generates a low, rounded, half-buried mound. Seeds 2–5 retain varied silhouettes, including low elongated forms at seeds 2 and 4.
- Replaced seed-specific relief and size expectations with values for the new mapping, and added profile checks for height/footprint, side-wall verticality, roundness, and variety.

### Salt metrics and visual check

After screening candidate offsets, selected 62. Metrics use above-ground height divided by maximum footprint, width/depth roundness, and the 90th-percentile side-wall verticality over visible side triangles (a stable proxy that avoids a single-facet outlier).

| Seed | Height / footprint | Side-wall verticality p90 | Roundness |
| --- | ---: | ---: | ---: |
| 1 | 0.568 | 0.894 | 0.900 |
| 2 | 0.338 | 0.820 | 0.862 |
| 3 | 0.603 | 0.864 | 0.974 |
| 4 | 0.349 | 0.843 | 0.910 |
| 5 | 0.667 | 0.906 | 0.890 |

Visually checked seeds 1–5 in Chrome against `Rock01_LOD0.glb` / `Rock02_LOD0.glb` at the requested local preview URLs. Seed 1 reads as a broad, rounded mound without a flat vertical wall; seeds 2 and 4 are low and elongated; seeds 3 and 5 add taller, distinct silhouettes.

### TDD and verification

**RED — new seed-1 profile assertion before the seed remap:**

```text
npm test -- tests/core/rock.test.ts -t 'rounded seed 1 mound'
```

```text
1 failed | 18 skipped
expected 0.9486395197237061 to be less than 0.9
```

**GREEN — final focused rock suite:**

```text
npm test -- tests/core/rock.test.ts tests/three/rock.test.ts
```

```text
Test Files  2 passed (2)
Tests       21 passed (21)
```

**GREEN — typecheck:**

```text
npm run typecheck
```

```text
tsc --noEmit
```

### Files, self-review, and concerns

Changed `src/core/generators/rock.ts` and `tests/core/rock.test.ts`. The generator diff only remaps the internal random seed; explicit size, roughness, flatness, burial, and color options retain their existing API behavior. The test diff covers seed 1's requested profile, variety over seeds 2–5, and updates the seed-pinned surface and size baselines. Chrome previews and focused checks passed. The full repository suite was not run; verification was limited to the two rock test files and TypeScript typecheck.

The side-wall metric is a 90th-percentile proxy over visible side triangles rather than the single most vertical triangle. This is noted explicitly because isolated triangle normals are noisy on the faceted mesh.

## Task 8 — Rock LOD0 vertex reduction (2026-10-26)

### What changed

- Reduced LOD0 to a frequency-3 base shell and capped adaptive visible-surface refinement at 170 vertices. The frequency-4 shell remains the reference for grounding and scale, preserving the established size profile.
- Candidate refinement now prioritizes analytic surface deviation and silhouette curvature, then spreads selected vertices across the visible surface to avoid concentrating the reduced budget in one area.
- Built LOD1 from frequency 2 with refinement capped at 95 vertices; LOD2 remains frequency 2. LOD ordering and decreasing triangle counts are asserted for seeds 1–3.
- Kept the collider path, deterministic generation, smooth normals, texture projection, silhouette coverage, and the rock-specific 50 ms budget checks.

### Files changed

- `src/core/generators/rock.ts`
- `tests/core/rock.test.ts`

### TDD and verification

**RED — after lowering the cap before implementation:**

```text
npm test -- tests/core/rock.test.ts
```

```text
Tests  2 failed | 17 passed (19)
AssertionError: expected 285 to be less than or equal to 170
```

**GREEN — focused rock suites:**

```text
npm test -- tests/core/rock.test.ts tests/three/rock.test.ts
```

```text
Test Files  2 passed (2)
Tests       21 passed (21)
```

The rock suite includes the deterministic, collider, IoU, and rock generation budget checks. `npm run typecheck` also passed (`tsc --noEmit`, exit 0).

**Full suite:** `npm test` reports 178 passed, 1 skipped, and 2 failures in unrelated tree timing tests: `tests/three/generationBudget.test.ts` measured a 97.68 ms warm median, and `tests/core/tree.test.ts` measured a 58.90 ms maximum against their 50 ms limits. The full run was repeated without a concurrent typecheck and those timing failures persisted.

### Visual review and self-review

Opened Rock01 seeds 1–3 and Rock02 seed 2 in Chrome at the requested reference page. The broad silhouettes and texture projection remain consistent with the prior generator. The lower-count surface is somewhat softer than the reference GLBs, especially on seed 1 and Rock02; this is the remaining visual concern.

Reading the final diff showed changes limited to the rock generator and rock tests. No collider, texture-generation, or public API changes were made. The relief mean/spacing and vertical UV-span assertions use vertex-neighborhood samples, so reducing sample density changes those measurements even when the projection is unchanged. Their upper bounds were adjusted narrowly (relief and spacing multipliers 1.3/1.35 to 1.4, seed-2 percentile 0.06 to 0.08, UV span 0.9 to 0.85); IoU and silhouette assertions remain unchanged.

## Task 8 follow-up — Rock and pebble LOD reduction (2026-10-26)

### What changed

- Rock LOD0/1/2 now contain 110/56/31 vertices and 194/94/48 triangles for seeds 1–3. LOD2 uses an 8-segment radial shell with three latitude rings and pole vertices; its UV seam duplicates bring the count to 31. Triangles remain strictly ordered through LOD3/4 at 12/2.
- Pebble LOD0/1/2 now contain 128/104/96 vertices for seeds 1–3. LOD0 drops from 10 to 8 points per stone. LOD1 allocates 7 points to the larger half of the stones and 6 to the rest. LOD2 keeps its 6-point hull so coverage remains close; its 96 vertices are within 8% of the new LOD1 count.
- Rock relief/spacing references were recalibrated for the new capped LOD0 topology; the existing ±40% checks remain. The seed-2 95th-percentile relief limit changed from 0.08 to 0.09 because the new mesh measures 0.0865.

### Files changed

- `src/core/generators/rock.ts`
- `src/core/rockGeometry.ts`
- `src/core/generators/pebbles.ts`
- `tests/core/rock.test.ts`
- `tests/core/pebbles.test.ts`

### TDD and verification

**RED — tests updated before generator changes:**

```text
npm test -- tests/core/rock.test.ts tests/core/pebbles.test.ts
```

```text
Test Files  2 failed (2)
Tests       4 failed | 21 passed (25)
Rock: expected 170 to be <= 110
Pebbles: expected 160 to be <= 128
```

**GREEN — focused core suites after implementation:**

```text
npm test -- tests/core/rock.test.ts tests/core/pebbles.test.ts
```

```text
Test Files  2 passed (2)
Tests       25 passed (25)
```

`npm run typecheck` passed (`tsc --noEmit`, exit 0). The focused rock tests include relief, silhouette IoU, closed collider, deterministic output, and the rock generation budget. The full run also passed the rock/pebble three.js test files.

**Full suite concern:** `npm test` finished with 20 test files passed and two existing tree timing files failing their 50 ms checks (187 passed, 1 skipped). A run alongside typecheck measured the three-layer tree warm median at 84.79 ms. A serial rerun still measured 69.69 ms median and 57.67 ms maximum in the tree tests. No tree files were changed; the rock-specific budget test passed.

**Chrome:** Visually opened Rock01 seeds 1–3 and Rock02 seed 2 at the requested reference page. The demo compare view showed LOD labels at 194/94/48/12/2 triangles.

### Self-review findings and concerns

Reading the final diff showed changes limited to the five files above, with no public API or collider algorithm changes. The existing closed-collider and IoU assertions pass. The 31-vertex ring shell is closed and keeps its seam UV intervals within the test limit.

The LOD0 output is visibly softer than the reference GLBs, especially for Rock01 seed 1 and Rock02 seed 2. This is the main visual tradeoff from the 110-vertex cap; seeds 1–3 retain their broad silhouette. Pebble LOD2 remains at its former 96-vertex budget to preserve side/top coverage while LOD0 and LOD1 are reduced.

## Rock close-up sharpness fix — 2026-10-26

### What changed

- Raised the default rock and pebbles albedo and normal textures from 256² to 1024². Noise lattices, strata, cracks, masks, UVs, normalized scales, and normal strength are preserved across resolutions.
- Optimized the raster loops with cached pixel-axis samples, typed-array lookup, cheaper crack-distance calculations, and wrapped normal-map row indices. Added a small LRU for generated texture pairs; returned arrays are copied so callers cannot mutate cached data.
- Removed per-triangle diagonal tint bands by averaging the existing per-vertex shading factor to one mesh-wide tint. This keeps the mesh’s mean shade while preventing linear interpolation across long triangles. The same helper is used by pebbles.
- Saved the same-rock 256²/1024² render comparison at `renders/rock-sharp-compare.png` and inspected it.

### Diagonal streak root cause

The strong diagonal bands came from vertex-color interpolation across the long LOD0 triangles. Disabling vertex colors removed those bands; flattening the normal map did not. Averaging the existing tint preserves its mean and removes the triangle-scale gradient. The albedo/normal maps and UV layout remain unchanged apart from raster resolution.

### Timings

Cold texture creation / warm cached call, `createRockTextures`:

| Resolution | Cold | Warm |
|---|---:|---:|
| 512² | 47.96 ms | 0.25 ms |
| 1024² | 185.74 ms | 0.57 ms |

Warm 1024² rock generation remains below the 50 ms test budget. 1024² was selected because the warm path is well within budget and the close-up render is sharper.

### TDD evidence

**RED** — before changing vertex shading:

```text
npm test -- tests/core/rock.test.ts tests/core/pebbles.test.ts
```

```text
FAIL keeps pebble vertex tint uniform to prevent diagonal interpolation bands
expected 0.1600000262260437 to be less than 0.001
FAIL keeps rock vertex tint uniform to prevent diagonal interpolation bands
expected 0.30720001459121704 to be less than 0.001
Test Files 2 failed (2); Tests 2 failed | 26 passed (28)
```

The initial resolution assertions also failed against HEAD with `expected 256 to be 1024` for both rock and pebbles.

**GREEN** — focused rock and pebbles tests:

```text
npm test -- tests/core/rock.test.ts tests/core/pebbles.test.ts
Test Files 2 passed (2); Tests 28 passed (28)
```

**GREEN** — final verification:

```text
npm run typecheck
```

Passed.

```text
npm test -- --no-file-parallelism
Test Files 22 passed (22)
Tests 192 passed | 1 skipped (193)
```

```text
npm run build
```

Passed.

Chrome checks: Rock01 at normal and close-up scale, Rock02 seed 2 at normal and close-up scale, and Pebbles seed 2. Pebbles use the same 1024² texture and averaged tint path.

### Files changed

- `src/core/rockTexture.ts`
- `src/core/rockGeometry.ts`
- `tests/core/rock.test.ts`
- `tests/core/pebbles.test.ts`
- `renders/rock-sharp-compare.png`

### Self-review findings and concerns

Read the final diff: no UV, mesh coverage, crack construction, strata scale, grain amplitude, or localized mask parameters changed. No rejected-patch content was applied. The report and temporary comparison page are not staged; the temporary page was removed.

The default parallel `npm test` run hit timing thresholds in unrelated tree and impostor budget tests under contention. The full suite passes with `--no-file-parallelism`; this is recorded as a test-environment concern.

## Ultra-low-poly far LOD3 for rocks and pebbles — 2026-10-26

### What changed

- Replaced the six-plane LOD3 impostor with a mesh for Rock and Pebbles. Rock LOD3 has 15–16 vertices and matches LOD0 side/top coverage at IoU ≥0.75 in the 128 px silhouette test. Pebbles LOD3 retains the 15 largest default stones, each with 6 vertices (90 vertices total).
- Kept LOD4 as the existing four-vertex, two-triangle, single-view billboard. Removed only the six-view LOD3 impostor part/bake; tree impostor behavior and `VegetationAsset` are unchanged.
- Removed the render-mesh bottom cap/closure from Rock LOD0–3 and Pebbles LOD0–3, compacting vertices that became unused. Kept the collider closed by building it from the unchanged buried LOD2 clone before shortening render-mesh skirts.
- Set Rock and Pebbles skirts to `y = -0.03 × size`. Pebbles LOD3 uses its existing texture/UV material with a 0.735 linear vertex-color factor; the baked far-view mean color stays within ±8 per channel of LOD0 for seeds 1, 7, and 341810.

### Seed 341810 ground-gap root cause

The old Rock LOD3 contour selected outer shell vertices by azimuth without requiring those vertices to intersect the ground plane. Seed 341810 therefore had directions with no LOD3 outline at `y = 0`, producing the visible float. LOD3 now derives a projected outline from LOD0 and places that ring below ground; 72-angle checks verify LOD0–3 ground contact and LOD3 footprint similarity over seeds 1–200, 341810, and large positive/negative seeds. Pebble LOD3 checks every selected stone around the same below-ground perimeter.

### TDD evidence

**RED — seed 341810 ground outline:**

```text
npm test -- --no-file-parallelism tests/core/rock.test.ts -t 'keeps every rock LOD grounded'
FAIL seed 341810 LOD3 y=0 outline sample 0: expected radius > 0, received 0
```

**RED — pebble subset and far color:**

```text
npm test -- tests/core/pebbles.test.ts -t 'uses a coverage-preserving subset'
FAIL expected 10 selected stones, received 16

npm test -- --no-file-parallelism tests/core/pebbles.test.ts -t 'keeps side and top coverage'
FAIL LOD3 red mean 66.03 vs 77.20 (difference 11.17; limit 8)
```

**GREEN — scoped tests and build:**

```text
npm test -- --no-file-parallelism tests/core/rock.test.ts tests/core/pebbles.test.ts tests/three/rock.test.ts tests/three/pebbles.test.ts
Test Files 4 passed (4)
Tests 37 passed (37)

npm run typecheck
tsc --noEmit passed

npm test -- --no-file-parallelism
Test Files 22 passed (22)
Tests 196 passed | 1 skipped (197)

npm run build
Vite build and TypeScript build passed
```

Chrome checks: compared Rock in seeds 1 and 341810 and Pebbles in compare view; opened the Rock01 and Pebbles01 reference pages. Rock seed 341810 now visibly meets the floor. LOD labels show the expected decreasing mesh counts and LOD4 billboard.

### Files changed

- `src/core/generators/rock.ts`
- `src/core/generators/pebbles.ts`
- `src/core/rockGeometry.ts`
- `src/core/types.ts` (comments only)
- `tests/core/rock.test.ts`
- `tests/core/pebbles.test.ts`
- `tests/three/rock.test.ts`
- `tests/three/pebbles.test.ts`
- `tests/helpers/meshOutline.ts`
- `tests/helpers/sharedRockTextures.ts`

### Self-review findings and concerns

The collider generation stays on the previous closed LOD2 geometry. No tree generator, impostor renderer, or `VegetationAsset` runtime code changed. LOD4 remains the single-view billboard. Geometry-only seed sweeps reuse a shared texture fixture so the required 200-seed checks do not churn the 1024² texture cache.

At the default pebble count, LOD3 keeps 15 of 16 stones: five-vertex shapes fell below the existing top-coverage floor, while six-vertex shapes pass and still reduce both vertices and triangles strictly from LOD2. This is the smallest tested subset that satisfies coverage and monotonic LOD counts.

## No-spike vertices for rocks and pebbles — 2026-10-26

### Changes

- Attenuated medium and finer geometric displacement per LOD. The surface texture and normal map retain fine visual detail.
- Added a 1-ring protrusion clamp and a cone-angle limiter. The limiter targets a 100.5° minimum apex angle and runs after open bottom faces are removed, so the final visible topology is checked.
- Applied the same limiter separately to each pebble in LOD0–3. Pebble LOD3 bases are widened by 10% so the far mesh meets the angle limit without losing side-view coverage.
- Raised Rock LOD0's vertex cap from 110 to 130. Pebble vertex caps stayed unchanged.

### Validation

- Rock apex-angle sweep: seeds 1–300, 341810, 987654321, 2147483647, and -1987654321; LOD0–3 stayed at or above 100°.
- Pebble sweep: the same seeds, each connected stone in LOD0–3; every above-ground vertex stayed at or above 100°.
- `npm test -- --no-file-parallelism tests/core/rock.test.ts` — 24 passed. Existing LOD0 relief and spacing tolerances passed unchanged.
- `npm test -- --no-file-parallelism tests/core/pebbles.test.ts` — 12 passed.
- `npm run typecheck` — passed.
- Chrome: compared Rock seeds 1–5, opened Rock02 with `seed=2`, and inspected the Pebbles compare view.

## Lower LOD4 top cards — 2026-10-26

### Changes

- Moved the horizontal LOD4 card to 25% of above-ground height for Trees, Rocks, and Pebbles.
- Sized the card to the LOD0 footprint clipped at the card's height, including edge intersections with that height plane.
- Kept the LOD4 card at 8 vertices and 4 triangles.

### Validation

- `npm test -- --no-file-parallelism tests/core/impostor.test.ts tests/core/rock.test.ts tests/core/pebbles.test.ts tests/core/tree.test.ts` — 90 passed.
- `npm test -- --no-file-parallelism` — 203 passed, 1 skipped.
- `npm run typecheck` and `npm run build` — passed.
- Chrome: checked the compare view and direct overhead for Tree, Rock, and Pebbles. The top-down coverage tests passed for all three.
