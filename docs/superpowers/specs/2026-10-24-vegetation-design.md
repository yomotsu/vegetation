# vegetation — ランタイム植生メッシュ生成ライブラリ 設計

## 意図

terrain-gen / terrain-kit のような地形の上に、木・草・岩などを数千個散らすゲームフィールドを作りたい。
現状の植生は Blender で作った glTF + テクスチャのアセットで、LOD ごと・種類ごとにファイルが増える。

このライブラリは **植生オブジェクトをモデルファイルなしでランタイムに生成する** TS パッケージ。

- ファイル容量を節約する（モデル・テクスチャのアセットを配信しない）
- ローポリだが見栄えが良い
- 全種類で LOD0〜LOD4 を持つ
- three.js の Mesh としてそのまま使える

```ts
import { TreeMesh } from 'vegetation';

const tree = new TreeMesh( { seed: 3, leafColor: '#5a8f3a' } );
scene.add( tree );
```

## ゴール

1. 6 種類の植生を生成する: **grass / tree / flowers / bush / pebbles / rock**
2. 各種類に **LOD0〜LOD4** を用意する
   - LOD0 は参考アセット（terrain-gen `assets/vegetation/`）と同程度の精度
   - LOD4 はビルボード（板ポリ）
3. 生成結果は three.js の `Mesh`。`new TreeMesh()` のように使える
4. 花や葉の色などをユーザーが変えられる
5. **tree と rock はコライダ用ジオメトリも同時に生成する**。tree のコライダは幹のみ
6. インスタンス化（`InstancedMesh`）するかどうかはユーザーが決める。ただしインスタンス化して使うことが多い前提で、LOD ごとの geometry / material を単体で取り出せるようにする
7. **WebGLRenderer と WebGPURenderer の両方で動く**
8. three.js でプレビューできる **デモ HTML** を同梱する

## 非ゴール

- 地形上への配置・散布（ブルーノイズ配置、密度マップ、チャンクストリーミング等）。これは terrain-kit 側の責務
- 物理エンジンとの結合。コライダは `BufferGeometry` として返すだけで、meshwalk / rapier 等への登録は利用側
- 風（揺れ）のシェーダー。v1 では入れない（※Claude の判断。後から追加しやすいよう、揺れ用の重みを頂点属性に持たせるかは実装者判断）
- glTF 等へのエクスポート
- Ivy（参考アセットにはあるが今回の対象外）

## アンチゴール（技術的に動いてもこうなったら失敗）

- 生成に時間がかかりすぎて、数種類×数バリエーションの生成でページ起動が目に見えて止まる
- 同じ `seed` で毎回違う形になる（決定的でない）
- 片方のレンダラーでしか正しく表示されない
- LOD 間で色・シルエットが大きく変わり、切り替えがはっきり見える
- 色を変えるたびにジオメトリの再生成が必要になる

## 参考アセットの精度（LOD0 の目安）

terrain-gen `assets/vegetation/` の三角形数:

| 種類 | LOD0 | LOD1 | LOD2 | LOD4 | COL |
|---|---|---|---|---|---|
| Tree01 | 760 | 368 | 176 | 6〜12 | 28 |
| Rock01/02 | ~500 | ~250 | ~80〜100 | 6〜12 | ~80〜100 |
| Pebbles01 | ~500 | ~150 | – | 6〜12 | – |
| Grass03 | 44 | 30 | 24 | 6〜12 | – |
| Flowers01/02 | 96〜120 | 24〜48 | – | 6〜12 | – |

参考アセットはテクスチャ（albedo + アルファマスク）で葉・草を描いている。bush の参考は terrain-kit `assets/vegetation/bush/`（40〜700 tris）。
LOD3 は参考アセットに無いので、LOD2 と LOD4 の中間を新たに定義する（下記）。

## 決まっていること

### 使い方の形

- 種類ごとにクラスを提供する: `GrassMesh` / `TreeMesh` / `FlowersMesh` / `BushMesh` / `PebblesMesh` / `RockMesh`
- 各クラスは `THREE.Mesh` を継承し、`new XxxMesh( options )` で即座に使える
- オプションで `seed` と `lod` を受け取る。同じ `seed` なら同じ形（決定的）
- 色はオプションで指定でき、生成後もマテリアル側で変更できる（ジオメトリ再生成不要）
- tree / rock はインスタンスに `collider: BufferGeometry` を持つ

### 見た目のスタイル

- **まずは stylized な見た目**で作る（参考アセットと同じ方向性）
- 将来、別スタイルとして**リアルな見た目を追加するかもしれない**。そのとき stylized を壊さずに追加できる構造にしておく（例: 形状生成とスタイル＝マテリアル・テクスチャ・頂点カラーの付け方を分離し、`style` オプションで切り替えられる余地を残す）。v1 でリアル系を実装する必要はない

### インスタンス時の LOD 切り替え

- **ユーザー（利用側）に任せる**。ライブラリは LOD ごとの geometry / parts を渡すだけで、InstancedMesh の LOD 振り分けやメモリ最適化の仕組みは提供しない
- 非インスタンス用途の `XxxMesh.createLOD()`（`THREE.LOD` を返す）は提供する

### バリエーション

- `seed` を変えると形が変わる。インスタンス化時は「種類ごとに数パターン生成して回転・拡縮で散らす」使い方を想定

### レンダラー

- WebGL と WebGPU 両対応のため、ライブラリは `three` からのみ import する（`three/webgpu` や TSL、`onBeforeCompile` は使わない）
- マテリアルは標準の `MeshStandardMaterial` / `MeshLambertMaterial` 系に留める。WebGPURenderer は標準マテリアルを自動でノードマテリアルに変換して描画する
- terrain-kit は `three` → `three/webgpu` の alias を張っているので、その環境でも同じクラスが解決される

### デモ

- ブラウザで開いて以下ができる:
  - 種類を選んで表示
  - `seed`、色を変える
  - LOD0〜LOD4 を切り替えて見比べる（並べて表示も）
  - コライダの表示切り替え（ワイヤーフレーム）
  - 地面に大量に並べて（InstancedMesh）重さを確認する
  - WebGL / WebGPU の切り替え

## Claude の判断（ユーザー未確認。違えば指摘してほしい）

### パッケージ構成

- TypeScript（strict）。ビルドは Vite ライブラリモード（ESM）+ `tsc` で型定義を出力
- `three` は peerDependency（`>=0.170`）。それ以外のランタイム依存はゼロ（乱数・ノイズは自前実装）
- テストは vitest。デモは Vite の dev サーバーで動く `demo/` ディレクトリ
- コードスタイルは参考プロジェクトと同じ mrdoob スタイル（タブ、`f( x )`、ブロック開始後の空行）。コメントは日本語

### API の詳細

```ts
// 1 つの LOD の Mesh
const tree = new TreeMesh( {
	seed: 3,
	lod: 0,            // 0〜4、既定 0
	leafColor: '#5a8f3a',
	barkColor: '#6b4a32',
} );
tree.collider;       // BufferGeometry（tree / rock のみ）

// LOD を自動で切り替えたい場合（THREE.LOD を返す。全 LOD でマテリアルを共有）
const treeLOD = TreeMesh.createLOD( { seed: 3 }, [ 0, 15, 30, 60, 120 ] );

// インスタンス化したい場合：geometry と material を単体で取り出す
const { geometries, material, collider } = generateTree( { seed: 3 } );
// geometries[ lod ] : BufferGeometry, material : Material | Material[]
const instanced = new THREE.InstancedMesh( geometries[ 2 ], material, 5000 );
```

- 複数マテリアル（例: 幹と葉）は 1 つの geometry の groups + マテリアル配列で表現する。これにより `Mesh` と `InstancedMesh` のどちらでも 1 オブジェクトで描ける
- 色の変更は `tree.setLeafColor( color )` のようなメソッド、または共有マテリアルの `color` を直接変更。参照共有している全インスタンスに反映される
- 原点は根元（地面との接地点）、+Y が上。単位はメートル

### 見た目の作り方

- **基本は頂点カラー + フラット寄りのシェーディング**（ローポリらしさとファイルゼロを両立）
- 葉・草・花びらのように輪郭が必要なものは、**ランタイムで生成する小さなテクスチャ**（`DataTexture`、アルファマスク）を貼ったカードを使ってよい。テクスチャは型付き配列で生成し、Canvas / DOM に依存しない（Node・Worker でも生成できる）
- テクスチャはグレースケール寄りで生成し、色はマテリアルの `color` で乗算する → 色変更が即反映
- 頂点カラーは明度・色相のゆらぎ（根元が暗い、先端が明るい等）に使う

### LOD の定義

| LOD | 内容 | 三角形数の目安（LOD0 比） |
|---|---|---|
| LOD0 | 参考アセット相当 | 100% |
| LOD1 | 細部を削減 | ~50% |
| LOD2 | 主要形状のみ | ~25% |
| LOD3 | シルエットがわかる最小限（例: 木なら幹 + 葉の塊数個） | ~10% |
| LOD4 | ビルボード。交差した 2〜3 枚の板ポリ（4〜12 tris） | – |

- LOD4 のテクスチャは **LOD0 の形状を CPU で正射影ラスタライズ** して生成する（レンダラーに依存しない、同期で生成できる）。正面・側面のシルエットと簡易ライティングを焼き込む
- LOD1〜3 は LOD0 を間引くのではなく、同じ seed から粗いパラメータで生成し直してよい（シルエットと色が揃っていれば手段は問わない）

### 種類ごとの形

- **tree**: **terrain-gen `assets/vegetation/Tree01_LOD0.gltf` に近い針葉樹**（2026-10-24 ユーザー決定。当初の広葉樹は置き換え）。まっすぐな 1 本の幹（木目テクスチャ）に、水平〜やや垂れた枝葉カード（針葉の枝を描いたテクスチャ、アルファマスク）が段（輪生）状に付き、上ほど短い円錐形のシルエット。葉の法線はほぼ上向き（Tree01 と同じ stylized な陰影）。テクスチャはすべてランタイム生成
- **bush**: **（2026-10-26 ユーザー決定: 今回は対象外・保留）** 地面から複数の短い枝、葉カードのクラスタ。tree の生成ロジックを共有してよい
- **grass**: 1 株に複数の刃。刃は先細りの細長いポリゴン、根元暗・先端明の頂点カラー
- **flowers**: 茎＋花びら＋花芯。1 メッシュに数本。`petalColor` / `centerColor` / `stemColor` を指定可
- **pebbles**: 小さなローポリ石を数個〜十数個まとめた 1 メッシュ。コライダなし
- **rock**: ノイズで変形した低分割球体（フラットシェーディング）。苔などの色を上向き面に乗せるのは任意

### コライダ

- `BufferGeometry`（位置 + インデックスのみ）で返す。メッシュと同じローカル座標系
- tree: 幹のみの低分割角柱（8 角程度、30 tris 前後）。枝・葉は含めない
- rock: LOD2 相当の低ポリ（~100 tris 以下）。凸包にはしない（凹みを残す）

### レビュー後に Claude が決めたこと

- **出力の形は 2 通り**:
  - `XxxMesh` は 1 つの geometry + groups + マテリアル配列（`Mesh` として 1 オブジェクトで描ける）
  - `generateXxx()` は LOD ごとに **parts 配列**（`{ geometry, material }[]`、マテリアル 1 つにつき 1 part）も返す。terrain-kit の `partsFromScene` のように「part ごとに InstancedMesh を 1 つ作る」パイプラインにそのまま流せる
  - 両者は同じマテリアルインスタンスを共有する
- **マテリアルは `MeshStandardMaterial` のみ**にする。Lambert は WebGPU 側の変換で unlit になる事例があるため使わない
- **色変更の範囲**: 利用側がマテリアルを clone した場合（例: terrain-kit の `toNodeMaterial`）、その複製には色変更が届かない。これは利用側の責務とし、README に明記する
- **LOD4 の色**: ビルボードのテクスチャには複数パーツ（葉と幹、花びらと茎など）の色とライティングを焼き込む。色を変えたときは**テクスチャだけ焼き直す**（ジオメトリは再生成しない。焼き直しは数 ms 程度に収める）。LOD3→LOD4 の切り替えで色が飛ばないよう、焼き込みは現在のマテリアル色を使う
- **WebGL の意味**: three の従来の `WebGLRenderer` と `WebGPURenderer`（WebGPU バックエンド）の両方。ライブラリは `three` のみ import するので、どちらの環境でも動く。デモは 1 ページに 2 つの three を読み込まないよう、起動コマンドを分ける（`npm run demo` = WebGL、`npm run demo:webgpu` = `three` → `three/webgpu` alias で WebGPU）
- **Worker 対応の層を最初から分ける**:
  - 内部は 2 層構造にする
    - `core/`: 純データ層。型付き配列だけを扱い、`three` に依存しない。Worker で実行でき、結果を transfer できる
    - `three/`: 上の層。core の結果を `BufferGeometry` / `Material` / `Mesh` に包む
  - Worker そのものはライブラリに含めない
- **風**: v1 では実装しない。ただし将来のため、`windWeight` 頂点属性（0 = 根元・固定、1 = 先端・最大の揺れ）を全 LOD に入れておく（terrain-kit の既存の属性名に合わせる）

## 実装者に任せること

- 乱数（mulberry32 等）・ノイズ（simplex / value noise）の具体的な実装
- 木の分岐アルゴリズムの詳細（space colonization / L-system / 単純再帰など）
- 生成テクスチャの解像度（目安 64〜256px）
- 各オプションの既定値と細かいパラメータ名
- デモの UI ライブラリ（lil-gui 等）とレイアウト
- 生成をキャッシュするか（同じ seed × オプションでジオメトリ共有）

## 制約

- **LOD4 の板（2026-10-26 ユーザー決定）**: SpeedTree 方式。縦のビルボード（横から見た絵）と水平の板（真上から見た絵）を、カメラの見下ろし角に応じてシェーダーでディザ・フェードして切り替える。このマテリアルに限り独自シェーダーを許可（WebGL は onBeforeCompile、WebGPU は `vegetation/webgpu` エントリで TSL 版を登録）

- **頂点数（2026-10-25 ユーザー決定）**: tree の各 LOD の頂点数は参考 Tree01 と同じかそれ以下（LOD0 ≤ 795、LOD1 ≤ 513、LOD2 ≤ 331）。少ないほど良いが、見た目は参考を保つこと

- 参考プロジェクトの教訓（terrain-kit `CLAUDE.md`）:
  - WebGPU で `count = 0` の可視 InstancedMesh はクラッシュする（デモで注意）
  - 量子化属性に `applyMatrix4` すると ±1 にクランプされる → 生成ジオメトリは Float32 のままにする
- 数種類 × 数 seed × 5 LOD を生成しても、ページ起動を体感で止めない程度の速さ（目安: 1 種類 1 seed の全 LOD 生成が数十 ms 以内）
