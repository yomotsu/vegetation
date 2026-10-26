import type { TextureData, TextureGeneratorDef, VegetationData } from './types';

export type TextureRegenerator = ( texture: TextureData, definition: TextureGeneratorDef, color: number ) => TextureData;

const regenerators = new Map<string, TextureRegenerator>();

export function registerTextureRegenerator( type: string, regenerator: TextureRegenerator ): void {

	if ( type.length === 0 ) {
		throw new RangeError( 'Texture generator type must not be empty' );
	}

	regenerators.set( type, regenerator );

}

export function regenerateTexture( data: VegetationData, textureName: string, color: number ): TextureData {

	const texture = data.textures[ textureName ];
	const definition = data.textureGenerators?.[ textureName ];

	if ( texture === undefined || definition === undefined ) {
		throw new Error( `Texture cannot be regenerated: ${ textureName }` );
	}

	const regenerator = regenerators.get( definition.type );

	if ( regenerator === undefined ) {
		throw new Error( `Unknown texture generator type: ${ definition.type }` );
	}

	return regenerator( texture, definition, color );

}
