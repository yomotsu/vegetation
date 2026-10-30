import { describe, expect, it } from 'vitest';
import { generateFlowersData } from '../../src/core/generators/flowers';
import { generateGrassData } from '../../src/core/generators/grass';
import { generatePebblesData } from '../../src/core/generators/pebbles';
import { generateRockData } from '../../src/core/generators/rock';
import { generateTreeData } from '../../src/core/generators/tree';
import { alphaTestForTexture, isPowerOfTwo } from '../../src/core/textureMipmaps';
import { prepareVegetationAsset } from '../../src/core/vegetationAssetPreparation';
import type { TextureMipLevel, VegetationData } from '../../src/core/types';

function coverage( mip: TextureMipLevel, alphaTest: number ): number {

	let covered = 0;
	for ( let offset = 3; offset < mip.data.length; offset += 4 ) {
		if ( mip.data[ offset ]! / 255 >= alphaTest ) covered ++;
	}
	return covered / ( mip.width * mip.height );

}

function expectCoveragePreserved( texture: { mipmaps?: TextureMipLevel[] }, alphaTest: number ): void {

	const mipmaps = texture.mipmaps!;
	const target = coverage( mipmaps[ 0 ]!, alphaTest );
	for ( const mip of mipmaps ) {
		const tolerance = Math.max( 0.005, 1 / ( mip.width * mip.height ) );
		expect( Math.abs( coverage( mip, alphaTest ) - target ) ).toBeLessThanOrEqual( tolerance );
	}

}

function expectPowerOfTwoTextureSizes( data: VegetationData, skipPlantCard: boolean ): void {

	const prepared = prepareVegetationAsset( data );
	for ( const [ name, texture ] of Object.entries( prepared.data.textures ) ) {
		if ( skipPlantCard && name === 'plantCard' ) continue;
		expect( isPowerOfTwo( texture.width ), `${ data.kind}/${ name } width ${ texture.width }` ).toBe( true );
		expect( isPowerOfTwo( texture.height ), `${ data.kind}/${ name } height ${ texture.height }` ).toBe( true );
		expect( texture.width % 4, `${ data.kind}/${ name } width alignment` ).toBe( 0 );
		expect( texture.height % 4, `${ data.kind}/${ name } height alignment` ).toBe( 0 );
	}
	for ( const [ name, texture ] of Object.entries( prepared.impostorTextures ) ) {
		expect( isPowerOfTwo( texture.width ), `${ data.kind}/${ name } width ${ texture.width }` ).toBe( true );
		expect( isPowerOfTwo( texture.height ), `${ data.kind}/${ name } height ${ texture.height }` ).toBe( true );
		expect( texture.width % 4, `${ data.kind}/${ name } width alignment` ).toBe( 0 );
		expect( texture.height % 4, `${ data.kind}/${ name } height alignment` ).toBe( 0 );
	}

}

describe( 'generated texture mipmaps', () => {

	it( 'preserves level-zero alpha coverage on flower plant cards, tree leaves, and grass blades', () => {

		const flower = prepareVegetationAsset( generateFlowersData( { seed: 3, variety: 'allium' } ) );
		const tree = prepareVegetationAsset( generateTreeData( { seed: 3 } ) );
		const grass = prepareVegetationAsset( generateGrassData( { seed: 3 } ) );
		const fixtures = [
			{ data: flower.data, texture: 'plantCard' },
			{ data: tree.data, texture: 'leaf' },
			{ data: grass.data, texture: 'blade' },
		];

		for ( const fixture of fixtures ) {
			const texture = fixture.data.textures[ fixture.texture ]!;
			const alphaTest = alphaTestForTexture( fixture.data.parts, fixture.texture );
			expect( texture.mipmaps ).toBeDefined();
			expect( texture.mipmaps![ texture.mipmaps!.length - 1 ] ).toMatchObject( { width: 1, height: 1 } );
			expectCoveragePreserved( texture, alphaTest );
		}

	} );

	it( 'keeps generated texture and impostor dimensions power-of-two, except pending flower plant cards', () => {

		const generated = [
			generateTreeData( { seed: 11 } ),
			generateGrassData( { seed: 11 } ),
			generateRockData( { seed: 11 } ),
			generatePebblesData( { seed: 11 } ),
			...([ 'allium', 'daisy', 'tulip', 'poppy', 'bluebell', 'calla', 'primrose' ] as const).map( ( variety ) => generateFlowersData( { seed: 11, variety } ) ),
		];

		for ( const data of generated ) expectPowerOfTwoTextureSizes( data, data.textureGenerators?.plantCard !== undefined );

	} );

} );
