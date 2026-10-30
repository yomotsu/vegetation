import { hexToLinear } from './color';
import { bakeImpostor, extractImpostorViews, impostorViewsForPart } from './impostor';
import { regenerateTexture } from './textureRegenerator';
import { alphaTestForTexture, prepareTextureMipmaps, withTextureMipmaps } from './textureMipmaps';
import type { Color3, ImpostorView, TextureData, VegetationData } from './types';

export interface PreparedVegetationAsset {
	data: VegetationData;
	partColorsHex: Record<string, number>;
	partColorsLinear: Record<string, Color3>;
	impostorTextures: Record<string, TextureData>;
	impostorViews: Record<string, readonly ImpostorView[]>;
	impostorSize: number;
}

function copyTextureData( data: VegetationData ): VegetationData {

	const textures = Object.fromEntries( Object.entries( data.textures ).map( ( [ name, texture ] ) => [ name, {
		...texture,
		data: texture.data.slice(),
		...( texture.colorFactors === undefined ? {} : { colorFactors: texture.colorFactors.slice() } ),
		...( texture.colorPixelIndices === undefined ? {} : { colorPixelIndices: texture.colorPixelIndices.slice() } ),
		...( texture.colorOffsets === undefined ? {} : { colorOffsets: texture.colorOffsets.slice() } ),
	} ] ) );

	return { ...data, textures };

}

export function prepareVegetationAsset(
	data: VegetationData,
	partColorsHex: Record<string, number> = {},
	impostorSize = 128,
	partColorsLinear: Record<string, Color3> = {},
): PreparedVegetationAsset {

	const preparedData = copyTextureData( data );
	const colors = Object.fromEntries( preparedData.parts.map( ( part ) => [ part.name, partColorsHex[ part.name ] ?? part.defaultColor ] ) );
	const linearColors = Object.fromEntries( preparedData.parts.map( ( part ) => [ part.name, partColorsLinear[ part.name ] ?? hexToLinear( colors[ part.name ]! ) ] ) );
	const plantCardGenerator = preparedData.textureGenerators?.plantCard;
	if ( plantCardGenerator?.type === 'flowers-allium-plant-card' || plantCardGenerator?.type === 'flowers-calla-plant-card' ) {
		const petalColor = colors.petal ?? plantCardGenerator.petalColor;
		const stemColor = colors.stem ?? plantCardGenerator.stemColor;
		if ( petalColor !== plantCardGenerator.petalColor || stemColor !== plantCardGenerator.stemColor ) {
			preparedData.textureGenerators = {
				...preparedData.textureGenerators,
				plantCard: { ...plantCardGenerator, petalColor, stemColor },
			};
			preparedData.textures.plantCard = regenerateTexture( preparedData, 'plantCard', petalColor ?? stemColor ?? 0xffffff );
		}
	}

	for ( let index = 0; index < preparedData.parts.length; index ++ ) {

		const part = preparedData.parts[ index ]!;

		if ( ! part.colorizesTexture || part.texture === null ) continue;
		if ( colors[ part.name ] === part.defaultColor ) continue;

		preparedData.textures[ part.texture ] = regenerateTexture( preparedData, part.texture, colors[ part.name ]! );

	}

	const normalTextures = new Set( preparedData.parts.flatMap( ( part ) => part.normalTexture === undefined ? [] : [ part.normalTexture ] ) );
	for ( const [ textureName, texture ] of Object.entries( preparedData.textures ) ) {
		preparedData.textures[ textureName ] = prepareTextureMipmaps(
			texture,
			alphaTestForTexture( preparedData.parts, textureName ),
			normalTextures.has( textureName ),
		);
	}

	const materialColors = preparedData.parts.map( ( part ) => part.colorizesTexture ? [ 1, 1, 1 ] as [ number, number, number ] : linearColors[ part.name ]! );
	const impostorTextures: Record<string, TextureData> = {};
	const impostorViews: Record<string, readonly ImpostorView[]> = {};

	for ( const part of preparedData.parts ) {

		const views = impostorViewsForPart( part );
		if ( part.texture === null || views === undefined || impostorTextures[ part.texture ] !== undefined ) continue;

		impostorViews[ part.texture ] = views;
		let bakedTexture: TextureData | null = null;

		for ( const [ sourceName, sourceTexture ] of Object.entries( impostorTextures ) ) {

			bakedTexture = extractImpostorViews( sourceTexture, impostorViews[ sourceName ]!, views );
			if ( bakedTexture !== null ) break;

		}

		impostorTextures[ part.texture ] = withTextureMipmaps(
			bakedTexture ?? bakeImpostor( preparedData, materialColors, impostorSize, views ),
			alphaTestForTexture( preparedData.parts, part.texture ),
		);

	}

	return { data: preparedData, partColorsHex: colors, partColorsLinear: linearColors, impostorTextures, impostorViews, impostorSize };

}
