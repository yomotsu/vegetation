# vegetation 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** grass / tree / flowers / bush / pebbles / rock を LOD0〜LOD4 付きでランタイム生成し、three.js の Mesh として返す TS ライブラリと、プレビュー用デモを作る。

**Architecture:** `src/core/` は three 非依存の純データ層（型付き配列のみ。Worker で実行可能）で、乱数・ノイズ・形状プリミティブ・種類ごとのジェネレータ・ビルボード焼き込み（CPU ラスタライザ）を持つ。`src/three/` は core の結果を `BufferGeometry` / `MeshStandardMaterial` / `DataTexture` に包み、`VegetationAsset`（LOD 全段・共有マテリアル・コライダ）と `XxxMesh extends Mesh` を提供する。`demo/` は Vite で動くプレビュー。

**Tech Stack:** TypeScript 5（strict, `noUncheckedIndexedAccess`）, three（peerDependency `>=0.170`）, Vite（ライブラリモード + デモ）, vitest, lil-gui（デモのみ）

**Spec:** `docs/superpowers/specs/2026-10-24-vegetation-design.md`

## Global Constraints

- ライブラリは `three` からのみ import する。`three/webgpu`・TSL・`onBeforeCompile` は使わない
- ランタイム依存は `three`（peer）のみ。乱数・ノイズは自前実装
- `src/core/` は `three` を import しない（テストで検査する）
- マテリアルは `MeshStandardMaterial` のみ
- 同じ seed とオプションからは、バイト単位で同じジオメトリが出る（決定的）
- 原点は根元（接地点）、+Y が上、単位はメートル
- 色変更でジオメトリを再生成しない（LOD4 のテクスチャの焼き直しだけは許可）
- 全 LOD に `windWeight` 属性を持たせる（0 = 根元・固定、1 = 先端）
- ジオメトリ属性は Float32 のまま（量子化しない）
- 1 種類・1 seed の全 LOD 生成（焼き込みを含む）は 50ms 以内
- コードスタイルは mrdoob スタイル（タブ、`f( x )`、`[ a, b ]`、ブロック開始後と終了前に空行、シングルクォート）。コメントは日本語
- 三角形数の目安（LOD0）: tree 600〜1000 / rock 350〜650 / pebbles 350〜650 / bush 200〜700 / flowers 80〜200 / grass 30〜80。LOD4 は 12 tris 以下

## Review Focus

1. **seed が 0・負数・小数・非常に大きい値のとき**: 落ちずに決定的な形が出るべき → Task 1 の `createRandom` テストで扱う
2. **同じ asset から作った複数の Mesh / LOD**: 色変更が全部に反映され、`dispose()` を 2 回呼んでも落ちないべき → Task 5 のテスト
3. **WebGPURenderer 環境（`three` が `three/webgpu` に alias されている）**: ライブラリのクラスがそのまま描画されるべき → Task 6 のデモ（WebGPU 起動）で確認
4. **InstancedMesh に `geometries[ lod ]` と `materials` をそのまま渡したとき**: groups ごとに正しく描画されるべき → Task 6 の散布ビュー
5. **オプションの部分指定（`{ seed: 1 }` だけ等）や範囲外の `lod`（-1, 5, 2.5）**: 既定値で埋まり、`lod` はクランプ・切り捨てされるべき → Task 5 のテスト

---

## ファイル構成

```
package.json / tsconfig.json / tsconfig.build.json / vite.config.ts / vite.demo.config.ts
src/
  index.ts                     公開エクスポート
  core/
    types.ts                   MeshData, PartDef, VegetationData, TextureData, ColliderData, LodLevel, Color3
    random.ts                  createRandom
    noise.ts                   createNoise3D
    color.ts                   hexToLinear, linearToSrgbByte
    meshBuilder.ts             MeshBuilder（頂点・三角形・グループの追加、MeshData 化）
    primitives.ts              addTube, addCard, addRockShell（極座標ベースの多面体）
    leafTexture.ts             createLeafClusterTexture
    impostor.ts                buildBillboard, bakeImpostor（CPU ラスタライザ）
    generators/
      rock.ts pebbles.ts tree.ts bush.ts grass.ts flowers.ts
  three/
    VegetationAsset.ts         core データ → three オブジェクト。色変更・焼き直し・dispose
    VegetationMesh.ts          XxxMesh の基底クラス（extends Mesh）、createLOD
    meshes.ts                  RockMesh, PebblesMesh, TreeMesh, BushMesh, GrassMesh, FlowersMesh, generateXxx
tests/
  helpers/validateMeshData.ts  共通の妥当性チェック
  core/*.test.ts  three/*.test.ts
demo/
  index.html  main.ts  renderer-webgl.ts  renderer-webgpu.ts  gallery.ts  scatter.ts
```

## 共通の型（Task 1 で定義。全タスクがこれに従う）

```ts
export type LodLevel = 0 | 1 | 2 | 3 | 4;
export type Color3 = [ number, number, number ]; // リニア RGB 0〜1

export interface MeshGroup { start: number; count: number; partIndex: number }

export interface MeshData {
	positions: Float32Array;   // xyz
	normals: Float32Array;     // xyz
	uvs: Float32Array;         // uv
	colors: Float32Array;      // rgb（明度・色相のゆらぎ。マテリアル色と乗算される）
	windWeight: Float32Array;  // 1 頂点 1 値、0〜1
	indices: Uint32Array;
	groups: MeshGroup[];       // index 範囲ごとの partIndex。start/count は index 単位
}

export interface PartDef {
	name: string;              // 'bark' | 'leaf' | 'rock' | 'impostor' など
	defaultColor: number;      // sRGB hex（0x5a8f3a）
	texture: string | null;    // VegetationData.textures のキー（'impostor' は three 層で焼く）
	alphaTest: number;         // テクスチャなしは 0
	doubleSided: boolean;
	flatShading: boolean;
}

export interface TextureData { width: number; height: number; data: Uint8Array } // RGBA8, sRGB
export interface ColliderData { positions: Float32Array; indices: Uint32Array }

export interface VegetationData {
	kind: string;
	parts: PartDef[];          // 最後の要素は必ず impostor パート
	lods: MeshData[];          // 長さ 5。lods[ 4 ] はビルボード
	collider: ColliderData | null;
	textures: Record<string, TextureData>; // impostor 以外の生成テクスチャ
	bounds: { radius: number; height: number }; // XZ 半径、高さ
}
```

---

### Task 1: プロジェクト雛形 + 乱数・ノイズ・色・型

**Files:**
- Create: `package.json`, `tsconfig.json`, `tsconfig.build.json`, `vite.config.ts`, `.gitignore`
- Create: `src/core/types.ts`, `src/core/random.ts`, `src/core/noise.ts`, `src/core/color.ts`
- Test: `tests/core/random.test.ts`, `tests/core/noise.test.ts`, `tests/core/color.test.ts`, `tests/core/purity.test.ts`

**Interfaces:**
- Produces:
  - 上記「共通の型」
  - `createRandom( seed: number ): Random`。`Random` は `{ next(): number /* [0,1) */; range( min: number, max: number ): number; int( min: number, maxInclusive: number ): number; fork( salt: number ): Random }`
  - `createNoise3D( seed: number ): ( x: number, y: number, z: number ) => number`。値は [-1, 1]
  - `hexToLinear( hex: number ): Color3`、`linearToSrgbByte( v: number ): number`

- [ ] **Step 1: 雛形を作る**
  - `git init` する
  - `package.json`:
    - `"name": "vegetation"`, `"type": "module"`
    - `peerDependencies: { three: ">=0.170.0" }`
    - devDependencies: `three`, `@types/three`, `typescript`, `vite`, `vitest`, `lil-gui`
    - `exports` は `./dist/index.js` と `./dist/index.d.ts`
    - scripts: `test`, `typecheck`, `build`（`vite build && tsc -p tsconfig.build.json`）, `demo`, `demo:webgpu`
  - `vite.config.ts`: ライブラリモード、`three` は external
- [ ] **Step 2: 失敗するテストを書く**
  - `createRandom`:
    - 同じ seed で 100 回の `next()` 列が一致する
    - seed 1 と 2 で列が異なる
    - seed `0`, `-5`, `1.5`, `2**40` で `next()` が [0,1) かつ NaN でない
    - `fork( 1 )` と `fork( 2 )` が異なる列を返し、元の列を進めない
  - `createNoise3D`: 同じ seed・同じ座標で同じ値。1000 点で [-1,1] に収まる。近い 2 点の差は 0.1 未満（連続性）
  - `hexToLinear( 0xffffff )` が `[ 1, 1, 1 ]`、`hexToLinear( 0x000000 )` が `[ 0, 0, 0 ]`
  - `purity.test.ts`: `src/core/**/*.ts` のどのファイルにも `from 'three'` が無い
- [ ] **Step 3: `npx vitest run tests/core` を実行して FAIL を確認する**
- [ ] **Step 4: 実装する**
  - 乱数は mulberry32。seed は `Math.floor( Math.abs( seed ) * 1000 ) >>> 0` で正規化する
  - fork は seed と salt のハッシュで新しい Random を作る
  - ノイズは 3D value noise か simplex のどちらでもよい
- [ ] **Step 5: テストと `npx tsc --noEmit` が通ることを確認する**
- [ ] **Step 6: コミットする**（`feat: scaffold package with core random/noise/types`）

---

### Task 2: MeshBuilder・プリミティブ・妥当性チェック

**Files:**
- Create: `src/core/meshBuilder.ts`, `src/core/primitives.ts`, `tests/helpers/validateMeshData.ts`
- Test: `tests/core/meshBuilder.test.ts`, `tests/core/primitives.test.ts`

**Interfaces:**
- Produces:
  - `class MeshBuilder`:
    - `addVertex( p: Vec3, n: Vec3, uv: [number,number], color: Color3, wind: number ): number`
    - `addTriangle( a: number, b: number, c: number ): void`
    - `beginGroup( partIndex: number ): void`（以降の三角形がこのパートに属する。同じパートが連続すればまとめる）
    - `triangleCount: number`
    - `build(): MeshData`
    - `Vec3 = [ number, number, number ]`
  - `addTube( b: MeshBuilder, spine: Vec3[], radii: number[], sides: number, opts: { color: Color3; wind: ( t: number ) => number; capEnd: boolean } ): void`
    - spine に沿った角柱。t は 0〜1（根元〜先端）
  - `addCard( b: MeshBuilder, center: Vec3, right: Vec3, up: Vec3, uvRect: [u0,v0,u1,v1], normal: Vec3 | null, color: Color3, wind: number ): void`
    - 四角形を 2 tris で追加する
    - normal が null なら面法線、指定があればその法線を全頂点に使う（stylized な葉の球面法線用）
  - `addRockShell( b: MeshBuilder, frequency: number, radiusAt: ( dir: Vec3 ) => number, opts: { color: ( dir: Vec3 ) => Color3; center: Vec3; scale: Vec3; flat: boolean } ): void`
    - 正二十面体を frequency 分割する（三角形数は `20 * frequency²`）
    - `flat` なら面ごとに頂点を複製して面法線にする
  - `validateMeshData( m: MeshData ): void`（テスト用）。次の条件で throw する:
    - 長さが不整合
    - NaN がある
    - index が範囲外
    - 法線の長さが 0.99〜1.01 の外
    - windWeight が 0〜1 の外
    - groups が index 範囲全体を重なりなく覆っていない

- [ ] **Step 1: 失敗するテストを書く**
  - `addRockShell` を frequency 1/2/5 で呼ぶと、三角形数がそれぞれ 20/80/500
  - `addTube` は 2 区間・6 角・capEnd なしで 24 tris
  - `addCard` は 2 tris
  - 全結果が `validateMeshData` を通る
  - groups: パート 0 で 2 tris、パート 1 で 1 tris を追加すると、`groups` が `[ { start: 0, count: 6, partIndex: 0 }, { start: 6, count: 3, partIndex: 1 } ]` になる
- [ ] **Step 2: FAIL を確認する**
- [ ] **Step 3: 実装する**
- [ ] **Step 4: PASS を確認する**
- [ ] **Step 5: コミットする**（`feat(core): mesh builder and primitives`）

---

### Task 3: ビルボード（LOD4）と CPU 焼き込み

**Files:**
- Create: `src/core/impostor.ts`
- Test: `tests/core/impostor.test.ts`

**Interfaces:**
- Consumes: `MeshBuilder`, `MeshData`, `VegetationData`, `Color3`, `linearToSrgbByte`
- Produces:
  - `buildBillboard( bounds: { radius: number; height: number }, impostorPartIndex: number ): MeshData`
    - 交差する 2 枚の板（XY 面と ZY 面）で 4 tris
    - 板 A は atlas の左半分、板 B は右半分の uv を持つ
    - windWeight は下端 0、上端 1
    - 法線は板の面法線と +Y を 1:1 で混ぜて正規化する（真横から暗くならないように）
  - `bakeImpostor( data: VegetationData, colors: Color3[] /* parts と同じ並び */, size: number ): TextureData`
    - 出力は `size*2 × size`
    - 左半分 = +Z 方向から見た正射影、右半分 = +X 方向から見た正射影
    - 描画範囲は X(Z) が `-radius..radius`、Y が `0..height`

**焼き込みのアルゴリズム（テストでは決まらない部分）:**
- `data.lods[ 0 ]` の三角形を正射影し、z バッファ付きでラスタライズする
- 1 ピクセルの色は `頂点カラー補間 × colors[ partIndex ]` に、ライティング `0.35 + 0.65 * max( 0, dot( n, L ) )`（`L = normalize( 0.4, 0.8, 0.45 )`）を掛ける
- パートにテクスチャがある場合は、uv で `data.textures[ part.texture ]` を最近傍サンプリングする。alpha が `part.alphaTest` 未満ならそのピクセルは捨て、rgb を色に乗算する
- 出力の alpha は 255（描いた）か 0（描いていない）
- 最後に 1px のエッジ膨張（dilate）を行い、描いていないピクセルの rgb を隣のピクセルからコピーする。alpha は 0 のまま。ミップマップ時の黒縁を防ぐため

- [ ] **Step 1: 失敗するテストを書く**
  - `buildBillboard` が 4 tris、`validateMeshData` を通る、全頂点の y が 0〜height
  - 1 つのパートで、高さ 1・半径 0.5 の箱状メッシュを手で組んだ VegetationData を `bakeImpostor( data, [ [ 1, 0, 0 ] ], 32 )` に渡すと:
    - 出力サイズが 64×32
    - 左半分の中央ピクセルの alpha が 255 で、r が g・b より大きい
    - 角（0, 0）の alpha が 0
  - colors を `[ 0, 0, 1 ]` に変えると、中央ピクセルの b が r より大きい（色の焼き直しが効く）
- [ ] **Step 2: FAIL を確認する**
- [ ] **Step 3: 実装する**
- [ ] **Step 4: PASS を確認する**
- [ ] **Step 5: コミットする**（`feat(core): billboard and CPU impostor baking`）

---

### Task 4: rock と pebbles のジェネレータ

**Files:**
- Create: `src/core/generators/rock.ts`, `src/core/generators/pebbles.ts`
- Test: `tests/core/rock.test.ts`, `tests/core/pebbles.test.ts`

**Interfaces:**
- Consumes: Task 1〜3
- Produces:
  - `generateRockData( options: RockOptions ): VegetationData`
    - `RockOptions = { seed?: number; size?: number /* 既定 1.0, m */; roughness?: number /* 0〜1, 既定 0.5 */; flatness?: number /* 0〜1, 既定 0.3 */ }`
    - parts: `[ { name: 'rock', defaultColor: 0x8a8378, flatShading: true, texture: null, alphaTest: 0, doubleSided: false }, impostorPart ]`
  - `generatePebblesData( options: PebblesOptions ): VegetationData`
    - `PebblesOptions = { seed?: number; count?: number /* 既定 10 */; spread?: number /* 半径 m, 既定 0.5 */ }`
    - parts: `[ { name: 'stone', defaultColor: 0x9a948a, flatShading: true, ... }, impostorPart ]`
  - 共通ヘルパ `impostorPart(): PartDef` を `impostor.ts` から export する
    - `{ name: 'impostor', defaultColor: 0xffffff, texture: 'impostor', alphaTest: 0.5, doubleSided: true, flatShading: false }`

**rock の形:**
- `addRockShell` を使う。半径関数は seed のノイズで、全 LOD 共通にする。シルエットが揃う
- frequency は LOD0 から順に 5 / 4 / 2 / 1（tris は 500 / 320 / 80 / 20）
- y 方向を `1 - flatness*0.5` 倍に潰し、底を y=0 より少し（size の 10%）沈める
- 頂点カラー: 上向きの面ほど少し明るく、ノイズで ±10% のゆらぎを付ける
- collider: LOD2 と同じ frequency 2 の形状。positions と indices のみで、頂点を共有した indexed 形式

**pebbles の形:**
- count 個の小石を spread 内に配置する。各石の半径は 0.04〜0.12m
- frequency は LOD0 から順に 2 / 1 / 1（LOD2 は石の数を半分）/ 1（LOD3 は大きい順に 3 個）。LOD4 はビルボード
- collider は null

- [ ] **Step 1: 失敗するテストを書く**（rock / pebbles 共通）
  - 全 LOD が `validateMeshData` を通る
  - `lods.length === 5`
  - 三角形数が LOD0 > LOD1 > LOD2 > LOD3 > LOD4、LOD4 ≤ 12、LOD0 が Global Constraints の範囲内
  - 同じ seed で positions が一致し、seed 1 と 2 で異なる
  - 全頂点の y ≥ -0.2 * size（沈み込みの上限）
  - rock の collider: 三角形 ≤ 100、`collider.indices` が範囲内
  - pebbles の collider は null
  - 全 LOD の生成と `bakeImpostor( data, defaultColors, 128 )` の合計が 50ms 未満（`performance.now()` で計測。1 回温めてから計測する）
- [ ] **Step 2: FAIL を確認する**
- [ ] **Step 3: 実装する**
- [ ] **Step 4: PASS を確認する**
- [ ] **Step 5: コミットする**（`feat(core): rock and pebbles generators`）

---

### Task 5: three 層 — VegetationAsset・VegetationMesh・RockMesh・PebblesMesh

**Files:**
- Create: `src/three/VegetationAsset.ts`, `src/three/VegetationMesh.ts`, `src/three/meshes.ts`, `src/index.ts`
- Test: `tests/three/asset.test.ts`, `tests/three/meshes.test.ts`

**Interfaces:**
- Consumes: `VegetationData`, `bakeImpostor`, `generateRockData`, `generatePebblesData`
- Produces:
  - `class VegetationAsset`
    - `constructor( data: VegetationData, colors?: Record<string, ColorRepresentation>, impostorSize?: number /* 既定 128 */ )`
    - `readonly data: VegetationData`
    - `readonly geometries: BufferGeometry[]`（長さ 5）
      - 属性は `position`, `normal`, `uv`, `color`, `windWeight`（itemSize 1）
      - groups の `materialIndex` は partIndex
      - `boundingSphere` を計算済みにする
    - `readonly materials: MeshStandardMaterial[]`（parts と同じ並び）
      - `vertexColors: true`（impostor は false）
      - `color` = 指定色または defaultColor
      - `side` は doubleSided なら DoubleSide
      - `flatShading`、`alphaTest`
      - テクスチャ付きパートは `map` = `DataTexture`（`colorSpace = SRGBColorSpace`、`needsUpdate`、mipmap あり）
    - `readonly collider: BufferGeometry | null`
    - `getParts( lod: number ): { part: string; geometry: BufferGeometry; material: MeshStandardMaterial }[]`
      - LOD の groups ごとに index を切り出した geometry を返す（初回作成後はキャッシュする）
    - `setColor( part: string, color: ColorRepresentation ): void`
      - material.color を更新する
      - impostor テクスチャを全パートの現在色で焼き直し、`DataTexture.image.data` を差し替えて `needsUpdate` する
      - 存在しない part 名なら Error を投げる
    - `getColor( part: string ): Color`
    - `dispose(): void`（2 回呼んでも安全）
  - `class VegetationMesh extends Mesh`
    - `constructor( asset: VegetationAsset, lod?: number )`
      - lod は 0〜4 にクランプし、`Math.floor` する
      - geometry = `asset.geometries[ lod ]`、material = `asset.materials`
    - `readonly asset`、`readonly lod: LodLevel`、`get collider(): BufferGeometry | null`
    - `setColor( part, color )` は asset に委譲する
    - `static fromAsset( asset: VegetationAsset, distances: number[] /* 長さ 5 */ ): LOD`
  - `src/three/meshes.ts`:
    - `generateRock( options?: RockMeshOptions ): VegetationAsset`
    - `class RockMesh extends VegetationMesh`
      - `constructor( options?: RockMeshOptions )`
      - `static createLOD( options?: RockMeshOptions, distances?: number[] ): LOD`
    - `RockMeshOptions = RockOptions & { lod?: number; rockColor?: ColorRepresentation }`
    - Pebbles も同様: `generatePebbles`, `PebblesMesh`, `stoneColor`
    - createLOD の既定距離は `[ 0, 10, 25, 50, 100 ]` に size（rock）を掛けたもの
  - `src/index.ts` は three 層のクラス・関数と、型（`LodLevel`、各 Options）を export する

- [ ] **Step 1: 失敗するテストを書く**（Node 環境の vitest。three はレンダラーなしでも動く）
  - `new RockMesh( { seed: 1 } )` が `Mesh` のインスタンスで、`lod === 0`、`collider` が BufferGeometry
  - `new RockMesh( { seed: 1, lod: 9 } ).lod === 4`、`lod: -1` → 0、`lod: 2.5` → 2
  - `new PebblesMesh().collider === null`
  - `generateRock( { seed: 1 } ).geometries[ 0 ]` に `windWeight` 属性がある
  - 同じ asset から作った 2 つの `VegetationMesh` で `setColor( 'rock', 0xff0000 )` すると、両方の `material[ 0 ].color` が同じ参照で赤になる
  - `setColor` の前後で impostor の `map.image.data` の中身が変わる
  - `setColor( 'nope', 0 )` が throw する
  - `getParts( 0 )` の各要素は 1 つのパートだけを持ち、三角形数の合計が `geometries[ 0 ]` と一致する
  - `RockMesh.createLOD()` の `levels.length === 5`、全レベルで material 配列が同一参照
  - `asset.dispose()` を 2 回呼んでも throw しない
- [ ] **Step 2: FAIL を確認する**
- [ ] **Step 3: 実装する**
- [ ] **Step 4: PASS と `npm run build`（`dist/index.js`, `dist/index.d.ts` が出る）を確認する**
- [ ] **Step 5: コミットする**（`feat(three): VegetationAsset, VegetationMesh, RockMesh, PebblesMesh`）

---

### Task 6: デモ（WebGL / WebGPU、ギャラリー、LOD 比較、散布）

**Files:**
- Create: `vite.demo.config.ts`, `demo/index.html`, `demo/main.ts`, `demo/renderer-webgl.ts`, `demo/renderer-webgpu.ts`, `demo/gallery.ts`, `demo/scatter.ts`, `demo/registry.ts`

**Interfaces:**
- Consumes: `src/index.ts` の公開 API
- Produces: `demo/registry.ts` の `export const kinds: { name: string; create: ( opts: Record<string, unknown> ) => VegetationAsset; colorParts: string[] }[]`
  - 後続タスクは種類を追加するとき、ここに 1 行足す

**レンダラー切り替え（spec からの変更点）:**
- 1 つの Vite サーバーで `three` と `three/webgpu` を混在させると three が 2 重に読み込まれる。そのため **起動コマンドを分ける**:
  - `npm run demo` → `vite --config vite.demo.config.ts`（WebGL。`WebGLRenderer`）
  - `npm run demo:webgpu` → `vite --config vite.demo.config.ts --mode webgpu`
    - `three` → `three/webgpu` の exact alias（`{ find: /^three$/, replacement: 'three/webgpu' }`）を張り、`WebGPURenderer` で起動する
- `main.ts` は `import.meta.env.MODE` でレンダラーを選ぶ
- 画面に現在のレンダラー名を表示する

**画面の機能（lil-gui）:**
- 種類の選択、seed、各パートの色
- 表示モード:
  - single（選んだ LOD を 1 つ表示）
  - compare（LOD0〜4 を横に並べ、各 LOD の三角形数をラベルで表示）
  - scatter（下記）
- コライダ表示（ワイヤーフレーム、赤）
- scatter:
  - 100m 四方の平面に、選んだ種類を N 個（既定 2000）散らす
  - seed は 4 種類まで、パーツごとに InstancedMesh を作る（`asset.geometries[ lod ]` と `asset.materials` をそのまま使う）
  - LOD はカメラからの距離帯で 5 グループに分け、フレームごとではなく 0.5 秒ごとに振り分け直す
  - instance 数が 0 の InstancedMesh は `visible = false` にする（WebGPU で `count = 0` だとクラッシュするため）
  - FPS と描画三角形数を表示する
- 照明は HemisphereLight + DirectionalLight（影あり）。カメラは OrbitControls

- [ ] **Step 1: デモを実装する**（rock / pebbles を registry に登録する）
- [ ] **Step 2: `npm run demo` で起動し、ブラウザで確認する**
  - single / compare / scatter の 3 モードで rock と pebbles が表示される
  - 色変更が全 LOD（LOD4 を含む）に反映される
  - コンソールにエラーが出ない
- [ ] **Step 3: `npm run demo:webgpu` で同じ確認をする**
- [ ] **Step 4: コミットする**（`feat(demo): preview with WebGL/WebGPU, LOD compare, scatter`）

---

### Task 7: tree（葉テクスチャ・コライダ付き）

**Files:**
- Create: `src/core/leafTexture.ts`, `src/core/generators/tree.ts`
- Modify: `src/three/meshes.ts`, `src/index.ts`, `demo/registry.ts`
- Test: `tests/core/leafTexture.test.ts`, `tests/core/tree.test.ts`, `tests/three/tree.test.ts`

**Interfaces:**
- Produces:
  - `createLeafClusterTexture( seed: number, size: number /* 既定 128 */ ): TextureData`
    - 葉形（楕円の両端を尖らせた形）を 12〜20 枚、中心付近に密集させて描く
    - rgb はグレースケール 0.75〜1.0 のゆらぎ、alpha は 0 か 255
  - `generateTreeData( options: TreeOptions ): VegetationData`
    - `TreeOptions = { seed?: number; height?: number /* 既定 6 m */; crownSize?: number /* 0.5〜1.5, 既定 1 */; branchCount?: number /* 既定 6 */ }`
    - parts: `[ bark( 0x6b4a32, flatShading: true ), leaf( 0x5a8f3a, texture: 'leaf', alphaTest: 0.5, doubleSided: true ), impostorPart ]`
  - three 層: `generateTree`, `TreeMesh`, `TreeMeshOptions = TreeOptions & { lod?: number; leafColor?: ColorRepresentation; barkColor?: ColorRepresentation }`

**形（stylized 広葉樹 1 種）:**
- 幹:
  - 少し曲がった spine（ノイズ）に沿った `addTube`
  - 根元は太く、先端に向けて細くする
- 枝:
  - 幹の上部 40〜85% から branchCount 本出す
  - 枝からさらに 1 段だけ子枝を出す
- 葉:
  - 枝先ごとに葉クラスタ（球状の塊）を置く
  - 塊の中に `addCard` で葉カードをランダムな向きに配置する
  - カードの法線は `normalize( 頂点位置 - 塊の中心 )` にする（stylized の柔らかい陰影のため）
  - 頂点カラー: 塊の下側を暗く（0.6）、上側を明るく（1.0）する
- LOD ごとの段階:

| | 幹の角数 | 枝 | 葉カード |
|---|---|---|---|
| LOD0 | 7 | 子枝あり | 塊あたり 10〜14 枚 |
| LOD1 | 5 | 子枝なし | 塊あたり 6 枚 |
| LOD2 | 4 | 主枝のみ・区間を減らす | 塊あたり 3 枚 |
| LOD3 | 3 角の幹のみ | なし | 大きめのカード 4〜6 枚（樹冠全体） |
| LOD4 | ビルボード | | |

  - 塊の位置と大きさは全 LOD で共通にする（シルエットを揃えるため）
- windWeight: 幹は高さ比で 0〜0.3、枝は 0.3〜0.7、葉は 0.7〜1.0
- collider: 幹の spine のうち、最初の枝が出る高さまでを 8 角・2 区間の角柱にする。上端に蓋をする（48 tris 以下）

- [ ] **Step 1: 失敗するテストを書く**
  - Task 4 と同じ共通チェック（validate、5 LOD、tris 単調減少と範囲、決定性、y ≥ -0.05、50ms 未満）
  - 葉テクスチャ: 決定的。alpha が 255 のピクセルが 20%〜70%
  - collider: tris ≤ 48。全頂点の XZ 半径が LOD0 の幹の根元半径の 1.5 倍以内（枝や葉を含まない）。最大 y が height の 60% 以下
  - three 層: `new TreeMesh( { seed: 1, leafColor: 0xff0000 } ).asset.getColor( 'leaf' )` が赤。`material[ 1 ].map` がある
- [ ] **Step 2: FAIL を確認する**
- [ ] **Step 3: 実装する**
- [ ] **Step 4: PASS を確認する。demo に登録し、両レンダラーで見た目を確認する**
  - LOD0 が参考アセット Tree01 程度の密度
  - LOD3→LOD4 の切り替えで色とシルエットが大きく飛ばない
- [ ] **Step 5: コミットする**（`feat: TreeMesh with trunk collider`）

---

### Task 8: bush

**Files:**
- Create: `src/core/generators/bush.ts`
- Modify: `src/three/meshes.ts`, `src/index.ts`, `demo/registry.ts`
- Test: `tests/core/bush.test.ts`

**Interfaces:**
- Produces:
  - `generateBushData( options: BushOptions ): VegetationData`
    - `BushOptions = { seed?: number; size?: number /* 既定 1.2 m */; density?: number /* 0〜1, 既定 0.6 */ }`
    - parts: `[ branch( 0x5c4630 ), leaf( 0x4f7f35, texture: 'leaf' ), impostorPart ]`
  - three 層: `generateBush`, `BushMesh`, `BushMeshOptions`（`leafColor`, `branchColor`）
- tree の葉クラスタ生成（塊の配置・カード配置・法線）は `tree.ts` から関数として切り出して共有する（例: `addLeafClump( b, center, radius, cardCount, partIndex, rand )`）
- 形: 地面付近から 3〜6 本の短い枝。半球状に塊を 4〜8 個並べる。collider は null

- [ ] **Step 1: 失敗するテストを書く**（Task 4 の共通チェック。LOD0 の範囲は 200〜700）
- [ ] **Step 2: FAIL を確認する**
- [ ] **Step 3: 実装する**
- [ ] **Step 4: PASS とデモでの見た目を確認する**
- [ ] **Step 5: コミットする**（`feat: BushMesh`）

---

### Task 9: grass と flowers

**Files:**
- Create: `src/core/generators/grass.ts`, `src/core/generators/flowers.ts`
- Modify: `src/three/meshes.ts`, `src/index.ts`, `demo/registry.ts`
- Test: `tests/core/grass.test.ts`, `tests/core/flowers.test.ts`

**Interfaces:**
- Produces:
  - `generateGrassData( options: GrassOptions ): VegetationData`
    - `GrassOptions = { seed?: number; height?: number /* 既定 0.4 m */; bladeCount?: number /* 既定 9 */; spread?: number /* 既定 0.15 m */ }`
    - parts: `[ blade( 0x6a9a3a, doubleSided: true, texture: null ), impostorPart ]`
    - 刃は 3 区間の先細り帯で、先端は 1 頂点（1 本 5 tris）。外側へ反らせる
    - 頂点カラーは根元 0.55、先端 1.0
    - LOD1 は 1 本 3 tris、LOD2 は刃を 2/3 本に、LOD3 は 3 本・1 本 1 tris
    - windWeight は高さ比の 2 乗
  - `generateFlowersData( options: FlowersOptions ): VegetationData`
    - `FlowersOptions = { seed?: number; count?: number /* 既定 3 */; height?: number /* 既定 0.35 m */; petalCount?: number /* 既定 5 */ }`
    - parts: `[ stem( 0x4f7a30 ), petal( 0xe8c547, doubleSided: true ), center( 0x8a5a20 ), impostorPart ]`
    - 茎は 3 角 `addTube`。花びらはカップ状に傾けた三角形 2 枚ずつ。花芯は 4 角錐
    - LOD1 は茎を 1 枚板にし、花びらを 1 tris ずつにする。LOD2 は花の数を半分。LOD3 は花びらを 1 枚の円板カード（2 tris）にする
  - three 層:
    - `GrassMesh`（`bladeColor`）
    - `FlowersMesh`（`petalColor`, `centerColor`, `stemColor`）
    - `generateGrass`、`generateFlowers`
  - collider はどちらも null

- [ ] **Step 1: 失敗するテストを書く**（Task 4 の共通チェック。LOD0 の範囲は grass 30〜80、flowers 80〜200）
  - flowers で `setColor( 'petal', 0x0000ff )` すると、impostor テクスチャに青寄りのピクセルが増える
- [ ] **Step 2: FAIL を確認する**
- [ ] **Step 3: 実装する**
- [ ] **Step 4: PASS とデモでの見た目を確認する**
- [ ] **Step 5: コミットする**（`feat: GrassMesh and FlowersMesh`）

---

### Task 10: README と最終確認

**Files:**
- Create: `README.md`

- [ ] **Step 1: README を書く**
  - 基本の使い方
  - LOD（`createLOD`）
  - InstancedMesh での使い方（`geometries[ lod ]` + `materials`、または `getParts( lod )`）
  - 色変更
  - コライダ（meshwalk に渡す例）
  - Worker で core を使う方法（`vegetation/core` の subpath export を `package.json` に追加する）
  - 注意事項:
    - マテリアルを clone すると色変更が届かない
    - InstancedMesh の LOD 振り分けは利用側の責務
- [ ] **Step 2: `npm test`、`npm run typecheck`、`npm run build` がすべて通ることを確認する**
- [ ] **Step 3: 両デモで 6 種類すべてを single / compare / scatter で確認し、コンソールにエラーが無いことを確かめる**
- [ ] **Step 4: コミットする**（`docs: README`）
