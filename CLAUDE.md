# プロジェクト概要

vegetation: three.js 向けのランタイム植生メッシュ生成ライブラリ（tree / rock / pebbles / grass / flowers）。各種類に LOD0〜4 を持ち、LOD3/4 はインポスター。tree と rock はコライダも生成する。

- 決定事項の正本は `docs/superpowers/specs/2026-10-24-vegetation-design.md` の「実装で確定したこと」。見た目や仕様を変えたらここに追記する
- 試作はユーザーが採用するまでコミットしない。不採用の差分は `.superpowers/sdd/2026-10-24-vegetation/*.patch`（git 管理外）に残す
- ユーザーとのやり取りは日本語

## ファイル構成

- `src/core/generators/*.ts`: 種類ごとの生成（純粋関数、`generate*Data` が `VegetationData` を返す）
- `src/core/impostor.ts`: インポスターの焼き込み（`bakeImpostor`）とカード生成。LOD3/4 は LOD0 から焼く
- `src/core/leafTexture.ts`: モミの小枝テクスチャ（`createFirSprigTexture`）と `padTextureEdges`（横一列の正方形タイルの縁埋め。アルファは変えない）
- `src/three/VegetationAsset.ts`: マテリアル・テクスチャ・色変更。`VegetationMesh.ts`: LOD ごとのパーツ Mesh、LOD4 ビルボードの向き
- `src/webgpu/index.ts`: WebGPU 用インポスターマテリアル（TSL）。`src/worker/*`: 非同期生成
- `demo/`: `npm run demo`（vite, 5173）。view = single / compare（LOD0〜4 を頂点数付きで並べる）/ scatter

## アルゴリズム・設計

### tree の LOD1/2: 段ごとのお椀（2026-10-29 採用）
- 各段の 5 枚の枝葉を 1 枚の扇形メッシュにまとめる。テクスチャ `leafRing` は各段の LOD0 の枝葉を真上から焼いたアトラス（1 段 128px の横一列）。UV は水平位置そのままなので LOD1/2 で共有
- 焼き込みは「不透明な面同士だけで高さを比較」する。透明な隙間が上に来て下の葉を消すと、付け根が空いて幹から浮いて見えた
- 縁は 10 頂点（枝葉方向 5 + 間 5）。間の頂点を `lodFrondFoldRatio × 3.5` × 幅だけ持ち上げて V 字の折れの代わりにする（真横の葉の量を LOD0 の 70% 以上にするため値を振って決定）
- 頂上の 1 枚（leader）だけ従来の `leaf` カード。色変更時は `tree-leaf-ring` 生成器で焼き直す（`TextureGeneratorDef` に height / crownSize / branchCount を持たせる）
- LOD0 への適用は不採用: 近距離用に 1 段 512px が必要でアトラス約 12MB、生成約 166ms、段がスカート状になる

### インポスター
- パートの `impostorFade: false` で視線角度のディザ切り替えをやめ、全カードを常に描く。tree / rock / pebbles は false、flowers だけ切り替えが残る
- カメラを向く LOD4 縦カードは、影パスでは光源（影カメラ）へ向ける。WebGL は `onBeforeShadow` より前に modelViewMatrix を計算するので、向きを変えた後に再計算している。WebGPU は影でも `onBeforeRender` が影カメラで呼ばれる

### tree のその他
- `rootDepth` はオプションではなく固定: 0.3 ×（樹高 / 7.55）m 幹を y=0 より下へ伸ばす（コライダも）

## 注意事項

- テストの `bakeLod( data, lod, topDown )` の topDown は真上視点ではない。真上は `LOD4_IMPOSTOR_VIEWS[ 1 ]` を `bakeImpostor` に渡す
- `bakeLod( …, solidLeafCoverage )` は `leaf` テクスチャだけ不透明化する。`leafRing` には効かない
- vitest は console.log を表示しない。調査用の probe テストは `appendFileSync` でファイルへ書き出す
- 処理時間のテスト（50ms / 500ms 予算）は全体並列実行だと落ちることがある。ファイル単体で再実行して判断する
- rock の「HEAD とバイト一致」テストはパーツ定義もハッシュする（`impostorFade` は除外済み）。パーツに項目を足すとき注意
- HEAD と見た目を比べるときは、HEAD の detached worktree（node_modules をシンボリックリンク）を別ポートで `vite --config vite.demo.config.ts --port 5180` として立てる
- 見た目の変更はブラウザで確認してからコミットする（テストが通るだけでは不可）

## 未解決の課題

- インスタンス用の `orientBillboardInstances( mesh, camera )` は影もカメラ向きのまま（影がオービットで動く）
- インポスターの上面カードが目の高さで水平な薄い板として見える。真上寄りでは上面と縦カードの絵が重なる
- tree の LOD1/2 は真上から見ると LOD0 より葉が 15〜20% 少ない（128px 焼きで細い針葉が欠ける）
