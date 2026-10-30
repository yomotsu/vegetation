# プロジェクト概要

vegetation: three.js 向けのランタイム植生メッシュ生成ライブラリ（tree / rock / pebbles / grass / flowers）。各種類に LOD0〜4 を持ち、LOD3/4 はインポスター。tree と rock はコライダも生成する。

- 決定事項の正本は `docs/superpowers/specs/2026-10-24-vegetation-design.md` の「実装で確定したこと」。見た目や仕様を変えたらここに追記する
- 試作はユーザーが採用するまでコミットしない。不採用の差分は `.superpowers/sdd/2026-10-24-vegetation/*.patch`（git 管理外）に残す
- ユーザーとのやり取りは日本語

## ファイル構成

- `src/core/generators/*.ts`: 種類ごとの生成（純粋関数、`generate*Data` が `VegetationData` を返す）。花の品種ごとの形は `src/core/flowers/*.ts`、allium / daisy の花テクスチャは `src/core/flowersTexture.ts`
- `src/core/impostor.ts`: インポスターの焼き込み（`bakeImpostor`）とカード生成。LOD3/4 は LOD0 から焼く。タイルは 2 のべき乗の格子に並べる
- `src/core/textureMipmaps.ts`: alpha test 用の CPU ミップ（カバレッジ保持）
- `src/core/uastc.ts` / `src/core/ktx2.ts`: 自作 UASTC エンコーダーと KTX2 書き出し（GPU 圧縮、既定 on・opt-out）
- `src/core/leafTexture.ts`: モミの小枝テクスチャ（`createFirSprigTexture`）と `padTextureEdges`（横一列の正方形タイルの縁埋め。アルファは変えない）
- `src/three/VegetationAsset.ts`: マテリアル・テクスチャ・色変更・UASTC 差し替え。`VegetationMesh.ts`: LOD ごとのパーツ Mesh、LOD4 ビルボードの向き、`upNormalCards` の両向き化
- `src/webgpu/index.ts`: WebGPU 用インポスターマテリアル（TSL）。`src/worker/*`: 非同期生成と UASTC エンコード（共有 Worker プール）
- `demo/`: `npm run demo`（vite, 5173）。view = single / compare（LOD0〜4 を頂点数付きで並べる）/ compression（RGBA と UASTC の左右比較）/ scatter。「UASTC textures」で圧縮を切り替え。`demo/grassBlueNoise.ts` はデモ専用

## API（2026-10-30 に絞った）

- メイン `vegetation`: `*Mesh`、`generate*` / `generate*Async`、`VegetationAsset`、`VegetationMesh`、`orientBillboardInstances`、`disposeVegetationWorkers` と型だけ。乱数・ノイズ・色変換などの部品は公開しない（デモは `../src/...` を直接 import）
- `vegetation/core`: `generate{Tree,Rock,Pebbles,Grass,Flowers}Data` と型だけ。`vegetation/webgpu`: 読み込むと TSL マテリアルを登録
- 公開リストは `tests/publicApi.test.ts` で固定している。export を増やしたらここも直す
- stylized な木（broadleaf / bush / pine / willow）は種類ごとに別クラス・別モジュール（`src/core/trees/*.ts`、`src/three/trees/*.ts`）。tree shaking のため種類のモジュール同士は import しない（共通は `stylized.ts` / `stylizedTextures.ts`）。Worker も kind ごとに動的 import して chunk を分ける
- GPU 圧縮: 既定 on。`compressTextures: false` で opt-out。通常は `VegetationMesh` が最初に描画されたとき renderer に対応する共有 `KTX2Loader` を遅延生成し、`detectSupport( renderer )` を呼ぶ。`getParts()` / `InstancedMesh` では `asset.setRenderer( renderer )` を呼ぶ。利用者が loader を渡した場合はそちらを使う

## アルゴリズム・設計

### テクスチャ全般
- 植生は半透明を使わない。抜きは alpha test（discard）のみ
- alpha test の色テクスチャは CPU でミップを作り、各段で alphaTest 以上の画素の割合を元にそろえる（倍率で合わせ、届かない段は不透明度の高い順にちょうど目標の数だけ閾値以上にする）。遠くで細い茎・針葉が消えないため。補正は誤差 0.2% 超の段だけ（生成予算 50 ms のため）
- テクスチャは 2 のべき乗。例外は tree の leafRing（1 段 128px を横一列、1280×128）。正方形に詰めると 1 段 64px になり LOD1/2 がまばらになった
- 花のまとめたカード（allium / tulip / calla）は描いた後に縦だけ下の 2 のべき乗へ縮める。上へ伸ばすと縦の画素密度が上がり GPU が粗いミップを選んで細い茎が消えた
- rock / pebbles の石テクスチャは 512²（`ROCK_TEXTURE_SIZE`）。1024² は 1 アセット 8MB だった

### GPU 圧縮（UASTC、2026-10-30 採用）
- 生成した RGBA → 自作エンコーダーで UASTC（不透明色と法線はモード 5、alpha test 色はモード 13）→ メモリ上の KTX2 → renderer 対応の共有 `KTX2Loader` が端末の形式（ASTC / BC7 / ETC2 / RGBA）へ変換
- 既定 on、`compressTextures: false` で opt-out。エンコードは共有 Worker プールでテクスチャ 1 枚ずつ始め、loader が使えるまで RGBA を描く。届いたら差し替え。色変更・焼き直しは再エンコードし、古い結果は捨てる。Worker がない環境では既定圧縮を行わず RGBA のままにする。明示的に渡した loader はメインスレッドの細切れ fallback（最大約 2.6 ms）を使える
- 内部 loader は renderer ごとに遅延生成し、`disposeVegetationWorkers()` で dispose。`VegetationMesh` は初回描画時に renderer を登録。`getParts()` / `InstancedMesh` 利用時は `asset.setRenderer( renderer )` を一度呼ぶ
- alpha test のテクスチャは各ミップの不透明度を 0 / 255 に 2 値化してからエンコードする（BC7 で抜きがずれたため）。全変換先で抜きのずれ 0
- 却下: BC/ETC2 の直接エンコード（ETC2 が遅く画質も破綻）、basisu の wasm（数 MB）

### 花の LOD（2026-10-30 確定、詳細は仕様書）
- allium / tulip / calla: LOD1/2（allium は LOD0 も）は花・茎・葉を 1 本分描いた共通テクスチャの交差カード。tulip は葉を片側 1 枚だけ描き、交差 2 枚で LOD0 と同じ葉数にする
- daisy / poppy: LOD3/4 に花の高さの水平カード。poppy の水平カードだけ葉を除いて焼く（ビューの `excludesBakeRanges`）
- primrose: LOD2/3 は群全体を覆う伏せたお椀（真上焼きを投影、片面描画）
- bluebell: LOD0 は花柄＋釣り鐘の 6 頂点の立体×4 と 4 区間の茎（168 頂点）。LOD1/2 は LOD0 と同じ茎の弧に沿って曲げた帯 2 枚（茎は帯の中央にまっすぐ描く。正面と横で別の絵にすると茎が 2 本に見えた）
- 花の LOD3/4 は全種類で切り替え（impostorFade）なし。切り替えを使う生成物は現在ない（マテリアルのテストは明示的に有効化して確認）
- `upNormalCards` の部品は裏向きの三角形を足して FrontSide で描く（両面だと裏で法線が反転して黒くなる）。primrose のお椀は `doubleSided: false`
- 葉の付け根は地面から 3 mm 埋める。allium の既定色は紫 `#8b5fbf`。pebbles の既定 `burial` は 0.48

### tree の LOD1/2: 段ごとのお椀（2026-10-29 採用）
- 各段の 5 枚の枝葉を 1 枚の扇形メッシュにまとめる。テクスチャ `leafRing` は各段の LOD0 の枝葉を真上から焼いたアトラス（1 段 128px の横一列）。UV は水平位置そのままなので LOD1/2 で共有
- 焼き込みは「不透明な面同士だけで高さを比較」する。透明な隙間が上に来て下の葉を消すと、付け根が空いて幹から浮いて見えた
- 縁は 10 頂点（枝葉方向 5 + 間 5）。間の頂点を `lodFrondFoldRatio × 3.5` × 幅だけ持ち上げて V 字の折れの代わりにする（真横の葉の量を LOD0 の 70% 以上にするため値を振って決定）
- 頂上の 1 枚（leader）だけ従来の `leaf` カード。色変更時は `tree-leaf-ring` 生成器で焼き直す（`TextureGeneratorDef` に height / crownSize / branchCount を持たせる）
- LOD0 への適用は不採用: 近距離用に 1 段 512px が必要でアトラス約 12MB、生成約 166ms、段がスカート状になる

### インポスター
- パートの `impostorFade: false` で視線角度のディザ切り替えをやめ、全カードを常に描く。現在は全種類 false
- カメラを向く LOD4 縦カードは、影パスでは光源（影カメラ）へ向ける。WebGL は `onBeforeShadow` より前に modelViewMatrix を計算するので、向きを変えた後に再計算している。WebGPU は影でも `onBeforeRender` が影カメラで呼ばれる

### tree のその他
- `rootDepth` はオプションではなく固定: 0.3 ×（樹高 / 7.55）m 幹を y=0 より下へ伸ばす（コライダも）

### stylized な木（2026-10-30〜）
- 参考: CGTrader「Simple Trees Pack」と、ユーザーの Blender 素材 `~/Library/CloudStorage/Dropbox/works/_material/3d/models/vegitation-mountain/`（Forest の Tree01〜03 / Bush01、Leaf01 / Trunk01 テクスチャ）。フォルダの一覧は TCC で拒否されるが、ファイルはパス指定で読める（Blender は `/Applications/Blender.app/Contents/MacOS/Blender -b` で調べられる）
- 葉は大きな正方形カードに房テクスチャを丸ごと貼り、法線は塊の中心から外向き（カードの向きではない）。`upNormalCards: true`
- LOD1/2 は同じ骨格から分割数と葉の枚数だけ落とす（`*Detail` の表）。LOD3/4 はモミと同じインポスター（`buildStylizedImpostorLods`、板は `upNormalCards`）
- 頂点数の目標: broadleaf ≤ 800、pine ≤ 1000、willow ≤ 900（bush 約 450）。葉カードは木全体の枚数を固定して塊の大きさで配分する。broadleaf / bush は房 4 つの大カード（内側）＋房 1 つの小カード（表面）
- willow の葉は枝先に置く釣り鐘形の殻にシェブロンの垂れ枝テクスチャを巻く（YouTube「Stylized Willow Tree Tutorial」の方式）。主枝は 2 方向にまとめる

## 注意事項

- テストの `bakeLod( data, lod, topDown )` の topDown は真上視点ではない。真上は `LOD4_IMPOSTOR_VIEWS[ 1 ]` を `bakeImpostor` に渡す
- `bakeLod( …, solidLeafCoverage )` は `leaf` テクスチャだけ不透明化する。`leafRing` には効かない
- vitest は console.log を表示しない。調査用の probe テストは `appendFileSync` でファイルへ書き出す
- 処理時間のテスト（50ms / 500ms 予算）は全体並列実行だと落ちることがある。ファイル単体で再実行して判断する。三層の tree 予算は 50ms ぎりぎりなので、テクスチャ処理を足したら単体で計測する
- `tests/three/generationBudget.test.ts`（三層 tree）は単体でも 51〜63ms で落ちる回がある（HEAD でも同程度）。変更の影響を見るときは HEAD と交互に数回回して比べる。Node にはグローバル `Worker` がないので、テストでは既定の UASTC 圧縮は走らない
- rock の「HEAD とバイト一致」テストはパーツ定義もハッシュする（`impostorFade` は除外済み）。パーツに項目を足すとき注意
- HEAD と見た目を比べるときは、HEAD の detached worktree（node_modules をシンボリックリンク）を別ポートで `vite --config vite.demo.config.ts --port 5180` として立てる。worktree から three の `libs/basis` を読むと Vite が 403 を返すので、`server.fs.strict: false` の一時設定で立てる
- 見た目の変更はブラウザで確認してからコミットする（テストが通るだけでは不可）
- Codex（`codex exec`）のサンドボックス内では `npx vitest run` の全体実行が 1 時間止まる。対象ファイルだけ実行させ、全体はこちらで回す。ブラウザ操作もさせない（ループして止まった）

## 未解決の課題

- 焼き込み（`bakeImpostor`）がテクスチャの繰り返し（wrap / wrapS / wrapT）を無視して UV を切り詰める。willow の葉の殻と岩に影響。直すと岩のインポスターが約 2% 変わるのでユーザー判断待ち

- インスタンス用の `orientBillboardInstances( mesh, camera )` は影もカメラ向きのまま（影がオービットで動く）
- 利用者が `getParts()` で自前の `InstancedMesh` を作ると `upNormalCards` の部品の裏が黒くなる（デモの scatter は対処済み。公開の手段はまだない）
- tree の LOD1/2 は真上から見ると LOD0 より葉が 15〜20% 少ない（128px 焼きで細い針葉が欠ける）
- UASTC の ETC2（古い Android など）と BC7（Windows デスクトップ）は実機で未確認
