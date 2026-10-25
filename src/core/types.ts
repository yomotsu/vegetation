export type LodLevel = 0 | 1 | 2 | 3 | 4;
export type Color3 = [ number, number, number ]; // リニア RGB 0〜1
export type Vec3 = [ number, number, number ];

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
	indices: Uint32Array;
	groups: MeshGroup[]; // index 範囲ごとの partIndex。start/count は index 単位
}

export interface PartDef {
	name: string; // 'bark' | 'leaf' | 'rock' | 'impostor' など
	defaultColor: number; // sRGB hex（0x5a8f3a）
	texture: string | null; // VegetationData.textures のキー（impostor は three 層で焼く）
	colorizesTexture?: boolean;
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
	type: 'tree-leaf';
	seed: number;
	size: number;
}

export interface TextureData {
	width: number;
	height: number;
	data: Uint8Array;
	colorFactors?: Float32Array;
	colorPixelIndices?: Uint32Array;
	wrap?: 'repeat' | 'clamp';
} // RGBA8, sRGB。row 0 は v=0（画像下端）。three.js DataTexture は flipY=false で使う。

export interface ColliderData {
	positions: Float32Array;
	indices: Uint32Array;
}

export interface VegetationData {
	kind: string;
	parts: PartDef[]; // 最後の要素は必ず impostor パート
	lods: MeshData[]; // 長さ 5。lods[ 4 ] はビルボード
	collider: ColliderData | null;
	textures: Record<string, TextureData>; // impostor 以外の生成テクスチャ
	textureGenerators?: Record<string, TextureGeneratorDef>;
	bounds: { radius: number; height: number }; // XZ 半径、高さ
}
