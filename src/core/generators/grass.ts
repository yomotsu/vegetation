import { createGrassBladeTextures, composeGrassBladeTexture, GRASS_TEXTURE_SIZE } from '../grassTexture';
import { MeshBuilder } from '../meshBuilder';
import { registerTextureRegenerator, regenerateTexture } from '../textureRegenerator';
import type { Color3, MeshData, PartDef, TextureData, TextureGeneratorDef, VegetationData } from '../types';

export const DEFAULT_BLADE_COLOR = 0x4b942b;
export const GRASS_CARD_ASPECT = 1.125;

export interface GrassOptions {
	seed?: number;
	height?: number;
	width?: number;
	bladeColor?: number;
}

function buildCardMesh( width: number, height: number ): MeshData {

	const builder = new MeshBuilder();
	const white: Color3 = [ 1, 1, 1 ];
	const halfWidth = width * 0.5;
	const bottomLeft = builder.addVertex( [ - halfWidth, 0, 0 ], [ 0, 1, 0 ], [ 0, 0 ], white, 0 );
	const bottomRight = builder.addVertex( [ halfWidth, 0, 0 ], [ 0, 1, 0 ], [ 1, 0 ], white, 0 );
	const topRight = builder.addVertex( [ halfWidth, height, 0 ], [ 0, 1, 0 ], [ 1, 1 ], white, 1 );
	const topLeft = builder.addVertex( [ - halfWidth, height, 0 ], [ 0, 1, 0 ], [ 0, 1 ], white, 1 );
	builder.addTriangle( bottomLeft, bottomRight, topRight );
	builder.addTriangle( bottomLeft, topRight, topLeft );

	return builder.build();

}

export function generateGrassData( options: GrassOptions = {} ): VegetationData {

	const seed = options.seed ?? 1;
	const height = options.height ?? 0.45;
	const width = options.width ?? height * GRASS_CARD_ASPECT;
	const bladeColor = options.bladeColor ?? DEFAULT_BLADE_COLOR;

	if ( ! Number.isFinite( seed ) ) throw new RangeError( 'Grass seed must be finite' );
	if ( ! Number.isFinite( height ) || height <= 0 ) throw new RangeError( 'Grass height must be a positive finite number' );
	if ( ! Number.isFinite( width ) || width <= 0 ) throw new RangeError( 'Grass width must be a positive finite number' );
	if ( ! Number.isInteger( bladeColor ) || bladeColor < 0 || bladeColor > 0xffffff ) throw new RangeError( 'Grass blade color must be a 24-bit integer' );

	const card = buildCardMesh( width, height );
	const grassTextures = createGrassBladeTextures( seed, bladeColor );
	const textures = { blade: grassTextures.blade, 'blade-normal': grassTextures.normal };
	const part: PartDef = {
		name: 'blade',
		defaultColor: bladeColor,
		texture: 'blade',
		normalTexture: 'blade-normal',
		colorizesTexture: true,
		alphaTest: 0.45,
		doubleSided: true,
		flatShading: false,
		roughness: 0.9,
	};

	return {
		kind: 'grass',
		parts: [ part ],
		lods: [ card, card, card, card, card ],
		collider: null,
		textures,
		textureGenerators: {
			blade: { type: 'grass-blade', seed, size: GRASS_TEXTURE_SIZE },
		},
		bounds: { radius: width * 0.5, height },
	};

}

function regenerateGrassBladeTextureData( existing: TextureData, generator: TextureGeneratorDef, color: number ): TextureData {

	if ( generator.type !== 'grass-blade' || existing.colorFactors === undefined || existing.colorPixelIndices === undefined ) {
		throw new Error( 'Grass blade texture cannot be regenerated' );
	}

	return composeGrassBladeTexture( existing, color );

}

export function regenerateGrassBladeTexture( data: VegetationData, color: number ): void {

	const generator = data.textureGenerators?.blade;
	if ( generator === undefined || data.textures.blade === undefined ) throw new Error( 'Grass blade texture cannot be regenerated' );
	data.textures.blade = regenerateTexture( data, 'blade', color );

}

registerTextureRegenerator( 'grass-blade', regenerateGrassBladeTextureData );
