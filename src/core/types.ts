export type LodLevel = 0 | 1 | 2 | 3 | 4;
export type Color3 = [ number, number, number ]; // リニア RGB 0〜1
export type Vec3 = [ number, number, number ];

export interface ImpostorView {
	direction: readonly [ number, number, number ];
	up?: readonly [ number, number, number ];
}

export interface MeshGroup {
	start: number;
	count: number;
	partIndex: number;
}

export interface MeshData {
	positions: Float32Array; // xyz
	normals: Float32Array; // xyz
	uvs: Float32Array; // uv
	colors: Float32Array; // rgb（明度・色相のゆらぎ。マテリアル色と乗算される）
	windWeight: Float32Array; // 1 頂点 1 値、0〜1
	impostorCard: Float32Array; // 0 = 縦カード、1 = 水平カード
	indices: Uint32Array;
	groups: MeshGroup[]; // index 範囲ごとの partIndex。start/count は index 単位
}

export interface PartDef {
	name: string; // 'bark' | 'leaf' | 'rock' | 'impostor' など
	/** sRGB hex. colorizesTexture が true なら texture を再生成し、それ以外は texture に乗算します。 */
	defaultColor: number;
	texture: string | null; // VegetationData.textures のキー
	impostorYawAngles?: readonly number[]; // 指定時は texture 用のビューを three 層で焼く。
	impostorViews?: readonly ImpostorView[]; // 視線方向と画像の上方向を指定して焼く。
	normalTexture?: string; // tangent-space normal map のキー
	/** true なら色変更でテクスチャを再生成し、false または未指定ならマテリアル色を乗算します。 */
	colorizesTexture?: boolean;
	/** true ならカードを逆向きにも追加し、上向き法線のまま描画します。 */
	upNormalCards?: boolean;
	roughness?: number;
	/** 誘電体の鏡面反射強度。指定時は MeshPhysicalMaterial を使用する。 */
	specularIntensity?: number;
	/** 屈折率。指定時は MeshPhysicalMaterial を使用する。 */
	ior?: number;
	emissive?: number;
	emissiveIntensity?: number;
	alphaTest: number; // テクスチャなしは 0
	doubleSided: boolean;
	flatShading: boolean;
}

export interface TextureGeneratorDef {
	type: string;
	seed: number;
	size: number;
	variety?: 'allium' | 'daisy' | 'lupine' | 'yarrow' | 'tulip';
	fixedColor?: number;
}

export interface TextureData {
	width: number;
	height: number;
	data: Uint8Array;
	colorFactors?: Float32Array;
	colorPixelIndices?: Uint32Array;
	colorOffsets?: Float32Array;
	wrap?: 'repeat' | 'clamp';
	wrapS?: 'repeat' | 'clamp';
	wrapT?: 'repeat' | 'clamp';
} // RGBA8。色マップは sRGB、法線マップは linear。row 0 は v=0（画像下端）。

export interface ColliderData {
	positions: Float32Array;
	indices: Uint32Array;
}

export interface VegetationData {
	kind: string;
	parts: PartDef[]; // 種別に応じて impostor パートを含む。
	lods: MeshData[]; // 長さ 5。最遠 LOD はメッシュまたはビルボード。
	collider: ColliderData | null;
	textures: Record<string, TextureData>; // impostor 以外の生成テクスチャ
	textureGenerators?: Record<string, TextureGeneratorDef>;
	bounds: { radius: number; height: number }; // XZ 半径、地上高（地下部分を含まない）
}
