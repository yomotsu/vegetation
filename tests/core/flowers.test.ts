import { describe, expect, it } from 'vitest';
import { generateFlowersData, regenerateFlowersPetalTexture, regenerateFlowersStemTexture } from '../../src/core/generators/flowers';
import { ALLIUM_HEAD_RISE, ALLIUM_HEAD_SIZE, ALLIUM_PLANT_CARD_TEXTURE_WIDTH, FLOWERS_PETAL_TEXTURE_SIZE, FLOWERS_STEM_TEXTURE_HEIGHT, createFlowersPetalTexture } from '../../src/core/flowersTexture';
import { prepareVegetationAsset } from '../../src/core/vegetationAssetPreparation';
import type { MeshData } from '../../src/core/types';
import { areByteIdentical, areStructurallyByteIdentical } from '../helpers/byteIdentical';
import { validateMeshData } from '../helpers/validateMeshData';

const newVarieties = [ 'poppy', 'bluebell', 'calla', 'primrose' ] as const;

function triangleCount( mesh: MeshData ): number {

	return mesh.indices.length / 3;

}

function vertexCount( mesh: MeshData ): number {

	return mesh.positions.length / 3;

}

function maximumY( mesh: MeshData ): number {

	let maximum = - Infinity;
	for ( let index = 1; index < mesh.positions.length; index += 3 ) maximum = Math.max( maximum, mesh.positions[ index ]! );
	return maximum;

}

function vertexWithMaximumY( mesh: MeshData ): number {

	let maximum = - Infinity;
	let index = - 1;
	for ( let vertex = 0; vertex < mesh.positions.length / 3; vertex ++ ) {
		const y = mesh.positions[ vertex * 3 + 1 ]!;
		if ( y > maximum ) {
			maximum = y;
			index = vertex;
		}
	}
	return index;

}

function vertexPosition( mesh: MeshData, vertex: number ): [ number, number, number ] {

	return [ mesh.positions[ vertex * 3 ]!, mesh.positions[ vertex * 3 + 1 ]!, mesh.positions[ vertex * 3 + 2 ]! ];

}

function cardRowCenter( mesh: MeshData, firstVertex: number, row: number ): [ number, number, number ] {

	const first = vertexPosition( mesh, firstVertex + row * 2 );
	const second = vertexPosition( mesh, firstVertex + row * 2 + 1 );
	return [ ( first[ 0 ] + second[ 0 ] ) * 0.5, ( first[ 1 ] + second[ 1 ] ) * 0.5, ( first[ 2 ] + second[ 2 ] ) * 0.5 ];

}

function cardCenterAtY( mesh: MeshData, firstVertex: number, rows: number, targetY: number ): [ number, number, number ] {

	for ( let row = 0; row < rows - 1; row ++ ) {
		const lower = cardRowCenter( mesh, firstVertex, row );
		const upper = cardRowCenter( mesh, firstVertex, row + 1 );
		if ( targetY < lower[ 1 ] || targetY > upper[ 1 ] ) continue;
		const progress = ( targetY - lower[ 1 ] ) / ( upper[ 1 ] - lower[ 1 ] );
		return [
			lower[ 0 ] + ( upper[ 0 ] - lower[ 0 ] ) * progress,
			targetY,
			lower[ 2 ] + ( upper[ 2 ] - lower[ 2 ] ) * progress,
		];
	}

	throw new RangeError( 'Requested height is outside the vertical card' );

}

describe( 'flowers core generator', () => {

	for ( const variety of [ 'allium', 'daisy' ] as const ) {

		it( `creates deterministic valid ${ variety } LODs within the reference caps`, () => {

			const first = generateFlowersData( { seed: 31, variety } );
			const second = generateFlowersData( { seed: 31, variety } );
			const caps = variety === 'allium' ? [ [ 144, 96 ], [ 96, 48 ] ] : [ [ 150, 120 ], [ 78, 48 ] ];

			expect( first.kind ).toBe( 'flowers' );
			expect( first.collider ).toBeNull();
			expect( first.lods ).toHaveLength( 5 );
			expect( first.parts.map( ( part ) => part.name ) ).toEqual( variety === 'allium' ? [ 'petal', 'stem', 'plantCard', 'impostor-lod3', 'impostor' ] : [ 'petal', 'stem', 'impostor-lod3', 'impostor' ] );

			for ( let lod = 0; lod < 5; lod ++ ) {

				validateMeshData( first.lods[ lod ]! );
				expect( areStructurallyByteIdentical( first.lods[ lod ]!, second.lods[ lod ]! ) ).toBe( true );
				if ( lod < 2 ) {
					expect( vertexCount( first.lods[ lod ]! ) ).toBeLessThanOrEqual( caps[ lod ]![ 0 ]! );
					expect( triangleCount( first.lods[ lod ]! ) ).toBeLessThanOrEqual( caps[ lod ]![ 1 ]! );
				}

			}

			expect( first.lods.slice( 1 ).every( ( mesh, index ) => triangleCount( mesh ) < triangleCount( first.lods[ index ]! ) ) ).toBe( true );
			if ( variety === 'allium' ) expect( first.lods.map( triangleCount ) ).toEqual( [ 72, 48, 24, 4, 2 ] );

		} );

	}

	it( 'keeps allium and daisy seed-1 geometry and textures byte-identical', async () => {

		const hash = async ( bytes: ArrayBufferView ) => {
			const source = new Uint8Array( bytes.buffer, bytes.byteOffset, bytes.byteLength );
			const digest = await globalThis.crypto.subtle.digest( 'SHA-256', Uint8Array.from( source ) );
			return Array.from( new Uint8Array( digest ), ( value ) => value.toString( 16 ).padStart( 2, '0' ) ).join( '' );
		};
		const expected = {
			allium: {
				positions: '8f1942c59997e9fc8a6e48476a5e937490c4f8bbae0c61489a60d8b25860791a',
				indices: '682653da689bd491c23ae430b4f13ddb06afe9b77d9309e7b0e03cf89c51f71f',
				plantCard: '465747905ce5c83a47934b38ac89a151d5b14f05fe574936dc2fe7253d617532',
			},
			daisy: {
				positions: '428c601204a4316a80ca6ff6b3455a33c962cd2076277d695faab564f2140fa8',
				indices: 'bab8dcf8a445986d4199cc1f71c281d6e9a1338132bca9004bb38c1dbe45bfa8',
				petal: '222a9e2a0bb425d388c14a29da4801971dc58b9be6226094d9125333a30c9c1d',
				stem: 'ea67baca2f1e5707db9ed676c70efb101bd22204733ea5910ab6da569b9354c6',
			},
		};

		for ( const variety of [ 'allium', 'daisy' ] as const ) {
			const data = generateFlowersData( { seed: 1, variety } );
			const actual = {
				positions: await hash( data.lods[ 0 ]!.positions ),
				indices: await hash( data.lods[ 0 ]!.indices ),
				...( variety === 'allium' ? { plantCard: await hash( data.textures.plantCard!.data ) } : {
					petal: await hash( data.textures.petal!.data ),
					stem: await hash( data.textures.stem!.data ),
				} ),
			};
			expect( actual ).toEqual( expected[ variety ] );
		}

	} );

	it( 'uses crossed allium plant cards with three, two, then one segment', () => {

		const data = generateFlowersData( { seed: 7, variety: 'allium' } );
		const lods = data.lods.slice( 0, 3 );
		const plantCardTexture = data.textures.plantCard!;

		expect( lods.map( triangleCount ) ).toEqual( [ 72, 48, 24 ] );
		expect( lods.map( ( mesh ) => mesh.groups.map( ( group ) => group.partIndex ) ) ).toEqual( [ [ 2 ], [ 2 ], [ 2 ] ] );
		expect( data.parts[ 2 ]!.name ).toBe( 'plantCard' );
		expect( data.parts[ 0 ]!.name ).toBe( 'petal' );
		expect( data.parts[ 1 ]!.name ).toBe( 'stem' );
		expect( data.parts[ 0 ]!.texture ).toBeNull();
		expect( data.parts[ 1 ]!.texture ).toBeNull();
		expect( data.textures.plantCard!.width ).toBe( ALLIUM_PLANT_CARD_TEXTURE_WIDTH );
		// 幅は花房の元テクスチャと同じ 128 px。茎の横方向は約 16 px に縮む（拡大しても細部は増えないため）。
		expect( plantCardTexture.width ).toBe( FLOWERS_PETAL_TEXTURE_SIZE );
		const texturePixelsPerMeter = plantCardTexture.height / data.bounds.height;
		expect( ALLIUM_HEAD_SIZE * texturePixelsPerMeter ).toBeGreaterThanOrEqual( FLOWERS_PETAL_TEXTURE_SIZE );
		expect( ( data.bounds.height - ALLIUM_HEAD_RISE - ALLIUM_HEAD_SIZE * 0.5 ) * texturePixelsPerMeter ).toBeGreaterThanOrEqual( FLOWERS_STEM_TEXTURE_HEIGHT );

		for ( let plant = 0; plant < 6; plant ++ ) {
			for ( let card = 0; card < 2; card ++ ) {
				const lod0FirstVertex = plant * 16 + card * 8;
				const lod0Base = cardRowCenter( lods[ 0 ]!, lod0FirstVertex, 0 );
				const lod0Row = cardRowCenter( lods[ 0 ]!, lod0FirstVertex, 1 );
				const lod0Top = cardRowCenter( lods[ 0 ]!, lod0FirstVertex, 3 );
				const tipY = lod0Top[ 1 ] - ALLIUM_HEAD_RISE - ALLIUM_HEAD_SIZE * 0.5;
				const lod0Progress = lod0Row[ 1 ] / tipY;
				const inferredTipX = lod0Base[ 0 ] + ( lod0Row[ 0 ] - lod0Base[ 0 ] ) / lod0Progress ** 2.4;
				const inferredTipZ = lod0Base[ 2 ] + ( lod0Row[ 2 ] - lod0Base[ 2 ] ) / lod0Progress ** 2.4;

				for ( let lod = 0; lod < lods.length; lod ++ ) {
					const mesh = lods[ lod ]!;
					const segments = 3 - lod;
					const rows = segments + 1;
					const verticesPerCard = rows * 2;
					const verticesPerPlant = verticesPerCard * 2;
					const firstVertex = plant * verticesPerPlant + card * verticesPerCard;
					const cardTop = cardRowCenter( mesh, firstVertex, segments )[ 1 ];
					const headCenterY = cardTop - ALLIUM_HEAD_SIZE * 0.5;
					const headCenter = cardCenterAtY( mesh, firstVertex, rows, headCenterY );
					const widthStart = vertexPosition( mesh, firstVertex );
					const widthEnd = vertexPosition( mesh, firstVertex + 1 );

					expect( cardTop - ALLIUM_HEAD_RISE - ALLIUM_HEAD_SIZE * 0.5 ).toBeCloseTo( tipY, 6 );
					expect( headCenter[ 1 ] - tipY ).toBeCloseTo( ALLIUM_HEAD_RISE, 6 );
					expect( headCenter[ 0 ] ).toBeCloseTo( inferredTipX, 6 );
					expect( headCenter[ 2 ] ).toBeCloseTo( inferredTipZ, 6 );
					expect( Math.hypot( widthEnd[ 0 ] - widthStart[ 0 ], widthEnd[ 2 ] - widthStart[ 2 ] ) ).toBeCloseTo( ALLIUM_HEAD_SIZE, 6 );
					expect( mesh.windWeight[ firstVertex ] ).toBe( 0 );
					expect( mesh.windWeight[ firstVertex + verticesPerCard - 2 ] ).toBe( 1 );

					if ( lod < 2 ) {
						const base = cardRowCenter( mesh, firstVertex, 0 );
						for ( let row = 1; row < segments; row ++ ) {
							const point = cardRowCenter( mesh, firstVertex, row );
							const progress = point[ 1 ] / tipY;
							expect( point[ 0 ] ).toBeCloseTo( base[ 0 ] + ( inferredTipX - base[ 0 ] ) * progress ** 2.4, 6 );
							expect( point[ 2 ] ).toBeCloseTo( base[ 2 ] + ( inferredTipZ - base[ 2 ] ) * progress ** 2.4, 6 );
						}
					}
				}
		}
		}

	} );

	it( 'preserves adopted flower geometry and textures across seeds 1, 2, and 7', async () => {

		const hash = async ( bytes: ArrayBufferView ) => {
			const source = new Uint8Array( bytes.buffer, bytes.byteOffset, bytes.byteLength );
			const digest = await globalThis.crypto.subtle.digest( 'SHA-256', Uint8Array.from( source ) );
			return Array.from( new Uint8Array( digest ), ( value ) => value.toString( 16 ).padStart( 2, '0' ) ).join( '' );
		};
		const expected = [
			[ 'allium', 1, [ '8f1942c59997e9fc8a6e48476a5e937490c4f8bbae0c61489a60d8b25860791a', '682653da689bd491c23ae430b4f13ddb06afe9b77d9309e7b0e03cf89c51f71f', '72c75ceaf1f2316c9ee766440be177939daa26da6af5d4b23bc31a5ea9965b2a', '465747905ce5c83a47934b38ac89a151d5b14f05fe574936dc2fe7253d617532' ] ],
			[ 'allium', 2, [ '564759aa846c87aef2287f5ffc9e0c84f957dd09584da121d142a2dbe79d3b5a', '682653da689bd491c23ae430b4f13ddb06afe9b77d9309e7b0e03cf89c51f71f', '4c9bb25185197b2256ad189dd50a84e44dcce87d7396fdd0f0f90a76cd534380', 'c3459e00a0a23e1bb8f7e19077a8afe7da15a268b104526fe69626e154ecdecd' ] ],
			[ 'allium', 7, [ '5bb34d281ac5bd04cfab1b7a60dfdcebb35437bbe57238635787fb91cd829d9b', '682653da689bd491c23ae430b4f13ddb06afe9b77d9309e7b0e03cf89c51f71f', '43aadacfa2a84c1bf34ac29bed80f138c14e7656490c0ac8c9dd785bdd9ffe6f', '33808a8b181301bec9cabdc235308ca8be14c62fa1a05a15f95749c132f9d320' ] ],
			[ 'daisy', 1, [ '428c601204a4316a80ca6ff6b3455a33c962cd2076277d695faab564f2140fa8', 'bab8dcf8a445986d4199cc1f71c281d6e9a1338132bca9004bb38c1dbe45bfa8', '57fbdacbfda8e1942248579fd85df15cb28798790db0ef7e90fadfe9c992def4', '222a9e2a0bb425d388c14a29da4801971dc58b9be6226094d9125333a30c9c1d', 'ea67baca2f1e5707db9ed676c70efb101bd22204733ea5910ab6da569b9354c6' ] ],
			[ 'daisy', 2, [ '42c32016ce3597322586bb69ca00a75530ae21aaedadd2fb02ee20cc349c7d0a', 'bab8dcf8a445986d4199cc1f71c281d6e9a1338132bca9004bb38c1dbe45bfa8', 'fd68a392fb79a5deab3b4570aac244ead053af7eb41ab3b3e7ebb85680553416', '43ea4c6d2c7ef3ab7df96158ab76ec9da5e3a1cad49ee105145aaf9de286adea', '5033481f927f85805d9b44abd7a244a6a117325c388393f54b4d57ed21a2c1fa' ] ],
			[ 'daisy', 7, [ '0ddbb7c47de8fa01e4e3235785228288d8d9178cd18be5de49fe3eae06646a76', 'bab8dcf8a445986d4199cc1f71c281d6e9a1338132bca9004bb38c1dbe45bfa8', '346e626c596260439e050e9cbff38e62feba0f71d16a40ea71cbdf4b2fbf6c29', '694a01b81576c102e399d0525fbf9105b8090ab0edb2e6366020aa9bbdc4dc2d', '234137286cb32df7ded25af49300ad9e61eeed760d2fae41fbb15a19b5b254b5' ] ],
			[ 'tulip', 1, [ 'd96f7c3225af3fbe225eec3add62b03fe2b3b9328a421d2c83db0a588d4e6adf', '4ad30ebb99732e36b471e4ccfb31d522ff4200697df4b84eed352f920d6ce64d', '1fd9dc88b778a838469f30ce6101151dae6a79b0b9533929abe5996847af7681', 'a661cfd69e67197768e729e92f10fe551df93db40bcf59c854d2b715f6588546', 'd141ae5b8a496d248704f8408b653bb40914f5160f0670cb197506c6fc315ac3' ] ],
			[ 'tulip', 2, [ '1dd74fbdd94a35e5369e0cbcfcdf343bcbba7d99bcc2fe812b60b5d1fea24c27', '4ad30ebb99732e36b471e4ccfb31d522ff4200697df4b84eed352f920d6ce64d', '1fd9dc88b778a838469f30ce6101151dae6a79b0b9533929abe5996847af7681', 'a661cfd69e67197768e729e92f10fe551df93db40bcf59c854d2b715f6588546', 'd141ae5b8a496d248704f8408b653bb40914f5160f0670cb197506c6fc315ac3' ] ],
			[ 'tulip', 7, [ '7341bd5bad605d5a87321523f0166cbac4ef5ff445d0acb1234c96f75cedb2da', '4ad30ebb99732e36b471e4ccfb31d522ff4200697df4b84eed352f920d6ce64d', '1fd9dc88b778a838469f30ce6101151dae6a79b0b9533929abe5996847af7681', 'a661cfd69e67197768e729e92f10fe551df93db40bcf59c854d2b715f6588546', 'd141ae5b8a496d248704f8408b653bb40914f5160f0670cb197506c6fc315ac3' ] ],
		];

		for ( const [ variety, seed, values ] of expected ) {
			const data = generateFlowersData( { variety: variety as 'allium' | 'daisy' | 'tulip', seed: seed as number } );
			const actual = [
				await hash( data.lods[ 0 ]!.positions ),
				await hash( data.lods[ 0 ]!.indices ),
				await hash( data.lods[ 0 ]!.uvs ),
				...( variety === 'allium' ? [ await hash( data.textures.plantCard!.data ) ] : [ await hash( data.textures.petal!.data ), await hash( data.textures.stem!.data ) ] ),
			];
			expect( actual ).toEqual( values );
		}

	} );

	for ( const variety of newVarieties ) {

		it( `creates deterministic valid ${ variety } LODs within the flower budgets`, () => {

			const first = generateFlowersData( { seed: 31, variety } );
			const second = generateFlowersData( { seed: 31, variety } );
			const triangles = first.lods.map( triangleCount );
			expect( first.kind ).toBe( 'flowers' );
			expect( first.lods ).toHaveLength( 5 );
			expect( first.parts.slice( 0, 2 ).map( ( part ) => part.name ) ).toEqual( [ 'petal', 'stem' ] );
			for ( let lod = 0; lod < 5; lod ++ ) {
				validateMeshData( first.lods[ lod ]! );
				expect( areStructurallyByteIdentical( first.lods[ lod ]!, second.lods[ lod ]! ) ).toBe( true );
				if ( lod === 0 ) expect( vertexCount( first.lods[ lod ]! ) ).toBeLessThanOrEqual( 150 );
				if ( lod === 1 ) expect( vertexCount( first.lods[ lod ]! ) ).toBeLessThanOrEqual( 78 );
			}
			expect( triangles.slice( 1 ).every( ( value, index ) => value < triangles[ index ]! ) ).toBe( true );
			expect( areByteIdentical( first.textures.petal!.data, second.textures.petal!.data ) ).toBe( true );
			expect( areByteIdentical( first.textures.stem!.data, second.textures.stem!.data ) ).toBe( true );

		} );

	}

	it( 'keeps new flower normals upward and wind weights between the ground and flower tips', () => {

		for ( const variety of newVarieties ) {
			const mesh = generateFlowersData( { seed: 7, variety } ).lods[ 0 ]!;
			for ( let offset = 0; offset < mesh.normals.length; offset += 3 ) expect( [ mesh.normals[ offset ], mesh.normals[ offset + 1 ], mesh.normals[ offset + 2 ] ] ).toEqual( [ 0, 1, 0 ] );
			for ( const weight of mesh.windWeight ) expect( weight ).toBeGreaterThanOrEqual( 0 );
			for ( const weight of mesh.windWeight ) expect( weight ).toBeLessThanOrEqual( 1 );
			let hasRoot = false;
			for ( let vertex = 0; vertex < mesh.windWeight.length; vertex ++ ) if ( mesh.positions[ vertex * 3 + 1 ] === 0 && mesh.windWeight[ vertex ] === 0 ) hasRoot = true;
			expect( hasRoot ).toBe( true );
			const top = vertexWithMaximumY( mesh );
			expect( mesh.windWeight[ top ] ).toBe( 1 );
		}

	} );

	it( 'keeps new flower textures under the pixel limit and regenerates colors without touching geometry', () => {

		for ( const variety of newVarieties ) {
			const options = { seed: 19, variety };
			const data = generateFlowersData( options );
			const geometry = data.lods.map( ( mesh ) => ( { ...mesh } ) );
			const pixels = Object.values( data.textures ).reduce( ( sum, texture ) => sum + texture.width * texture.height, 0 );
			const petalColor = 0xa98bd6;
			const stemColor = 0x81603d;
			expect( pixels ).toBeLessThanOrEqual( 256 * 256 );
			regenerateFlowersPetalTexture( data, petalColor );
			regenerateFlowersStemTexture( data, stemColor );
			const fresh = generateFlowersData( { ...options, petalColor, stemColor } );
			expect( areByteIdentical( data.textures.petal!.data, fresh.textures.petal!.data ) ).toBe( true );
			expect( areByteIdentical( data.textures.stem!.data, fresh.textures.stem!.data ) ).toBe( true );
			for ( let lod = 0; lod < 5; lod ++ ) expect( areStructurallyByteIdentical( data.lods[ lod ]!, geometry[ lod ]! ) ).toBe( true );
		}

	} );

	it( 'draws the tulip silhouette', () => {

		const tulip = generateFlowersData( { seed: 3, variety: 'tulip' } ).lods[ 0 ]!;
		const stemTip = [ 0, 0, 0 ];
		// 花びらは 1 枚 6 頂点（3 段）× 3 枚 × 4 株。その後に茎カード（2 段 = 6 頂点）が続く。
		const tulipStemOffset = 18 * 4;
		for ( const vertex of [ tulipStemOffset + 4, tulipStemOffset + 5 ] ) for ( let axis = 0; axis < 3; axis ++ ) stemTip[ axis ]! += tulip.positions[ vertex * 3 + axis ]! / 2;
		const angles: number[] = [];
		const topOffsets: number[] = [];
		for ( let petal = 0; petal < 3; petal ++ ) {
			const offset = petal * 6;
			const topX = ( tulip.positions[ ( offset + 4 ) * 3 ]! + tulip.positions[ ( offset + 5 ) * 3 ]! ) * 0.5 - stemTip[ 0 ]!;
			const topZ = ( tulip.positions[ ( offset + 4 ) * 3 + 2 ]! + tulip.positions[ ( offset + 5 ) * 3 + 2 ]! ) * 0.5 - stemTip[ 2 ]!;
			angles.push( Math.atan2( topZ, topX ) );
			topOffsets.push( Math.hypot( topX, topZ ) );
		}
		angles.sort( ( a, b ) => a - b );
		const gaps = [ angles[ 1 ]! - angles[ 0 ]!, angles[ 2 ]! - angles[ 1 ]!, Math.PI * 2 - angles[ 2 ]! + angles[ 0 ]! ];
		for ( const gap of gaps ) expect( gap ).toBeCloseTo( Math.PI * 2 / 3, 1 );
		expect( topOffsets.every( ( offset ) => offset > 0.01 ) ).toBe( true );

		// 花の下部はふっくら: 高さ 40% の段が、付け根の段より外へ張り出す。
		for ( let petal = 0; petal < 3; petal ++ ) {
			const offset = petal * 6;
			const radius = ( first: number ) => Math.hypot(
				( tulip.positions[ first * 3 ]! + tulip.positions[ ( first + 1 ) * 3 ]! ) * 0.5 - stemTip[ 0 ]!,
				( tulip.positions[ first * 3 + 2 ]! + tulip.positions[ ( first + 1 ) * 3 + 2 ]! ) * 0.5 - stemTip[ 2 ]!,
			);
			expect( radius( offset + 2 ) ).toBeGreaterThan( radius( offset ) + 0.012 );
			expect( radius( offset + 2 ) ).toBeGreaterThan( radius( offset + 4 ) );
		}

	} );

	it( 'keeps both crossed tulip stem cards on one curve', () => {

		// 段数や形の違う茎を重ねると、茎が 2 本に見える。
		const cases = [
			{ variety: 'tulip' as const, stemOffset: 18 * 4, plants: 4 },
		];
		for ( const { variety, stemOffset } of cases ) {
			const mesh = generateFlowersData( { seed: 5, variety } ).lods[ 0 ]!;
			for ( let row = 0; row < 3; row ++ ) {
				const first = [ 0, 1, 2 ].map( ( axis ) => ( mesh.positions[ ( stemOffset + row * 2 ) * 3 + axis ]! + mesh.positions[ ( stemOffset + row * 2 + 1 ) * 3 + axis ]! ) * 0.5 );
				const second = [ 0, 1, 2 ].map( ( axis ) => ( mesh.positions[ ( stemOffset + 6 + row * 2 ) * 3 + axis ]! + mesh.positions[ ( stemOffset + 6 + row * 2 + 1 ) * 3 + axis ]! ) * 0.5 );
				expect( Math.hypot( first[ 0 ]! - second[ 0 ]!, first[ 1 ]! - second[ 1 ]!, first[ 2 ]! - second[ 2 ]! ) ).toBeLessThan( 1e-6 );
			}
		}

	} );

	it( 'keeps crossed trial stem cards on one shared spine', () => {

		const cases = [
			{ variety: 'poppy' as const, segments: 3 },
			{ variety: 'bluebell' as const, segments: 3 },
			{ variety: 'calla' as const, segments: 1 },
			{ variety: 'primrose' as const, segments: 1 },
		];
		for ( const { variety, segments } of cases ) {
			const mesh = generateFlowersData( { seed: 5, variety } ).lods[ 0]!;
			const petalGroup = mesh.groups[ 0]!;
			const petalIndices = mesh.indices.slice( petalGroup.start, petalGroup.start + petalGroup.count );
			const stemGroup = mesh.groups[ 1]!;
			const stemIndices = mesh.indices.slice( stemGroup.start, stemGroup.start + stemGroup.count );
			const firstStemVertex = Math.min( ...stemIndices );
			const petalVertexCount = Math.max( ...petalIndices ) + 1;
			expect( firstStemVertex ).toBe( petalVertexCount );
			for ( let row = 0; row <= segments; row ++ ) {
				const first = cardRowCenter( mesh, firstStemVertex, row );
				const second = cardRowCenter( mesh, firstStemVertex + 2 * ( segments + 1 ), row );
				expect( Math.hypot( first[ 0 ] - second[ 0 ], first[ 1 ] - second[ 1 ], first[ 2 ] - second[ 2 ] ) ).toBeLessThan( 1e-6 );
			}
		}

	} );

	it( 'draws the trial flower silhouettes and fixed centers', () => {

		const poppy = generateFlowersData( { seed: 3, variety: 'poppy' } ).lods[ 0]!;
		const poppyPetal = poppy.groups[ 0]!;
		const poppyCenterY = poppy.positions[ 1 ]!;
		const poppyCornerHeights = [ 1, 2, 3, 4 ].map( ( vertex ) => poppy.positions[ vertex * 3 + 1 ]! );
		expect( poppyCornerHeights.reduce( ( sum, value ) => sum + value, 0 ) / 4 ).toBeGreaterThan( poppyCenterY + 0.012 );
		// つぼみは緑の茎テクスチャの右端（u > 0.8、v 0.4〜0.6）を使う茎のパーツ。
		const poppyStem = poppy.groups[ 1 ]!;
		let hasBudCard = false;
		for ( const vertex of poppy.indices.slice( poppyStem.start, poppyStem.start + poppyStem.count ) ) {
			if ( poppy.uvs[ vertex * 2 ]! > 0.8 && poppy.uvs[ vertex * 2 + 1 ]! > 0.4 && poppy.uvs[ vertex * 2 + 1 ]! < 0.6 ) hasBudCard = true;
		}
		expect( poppyPetal.count ).toBeGreaterThan( 0 );
		expect( hasBudCard ).toBe( true );
		const poppyTexture = generateFlowersData( { seed: 3, variety: 'poppy' } ).textures.petal!;
		let darkPixels = 0;
		for ( let index = 0; index < poppyTexture.data.length; index += 4 ) {
			if ( poppyTexture.data[ index ]! < 55 && poppyTexture.data[ index + 1 ]! < 55 && poppyTexture.data[ index + 2 ]! < 55 && poppyTexture.data[ index + 3 ]! > 128 ) darkPixels ++;
		}
		expect( darkPixels ).toBeGreaterThan( 20 );

		const bluebell = generateFlowersData( { seed: 3, variety: 'bluebell' } ).lods[ 0]!;
		const bluebellPetal = bluebell.groups[ 0]!;
		const bluebellStem = bluebell.groups[ 1]!;
		const highestBell = Math.max( ...Array.from( bluebell.indices.slice( bluebellPetal.start, bluebellPetal.start + bluebellPetal.count ), ( vertex ) => bluebell.positions[ vertex * 3 + 1 ]! ) );
		const highestSpine = Math.max( ...Array.from( bluebell.indices.slice( bluebellStem.start, bluebellStem.start + bluebellStem.count ), ( vertex ) => bluebell.positions[ vertex * 3 + 1 ]! ) );
		// 釣り鐘は茎から下へ垂れる。最後の釣り鐘は茎の先端に付く（茎だけで終わらない）。
		expect( highestBell ).toBeLessThanOrEqual( highestSpine + 1e-6 );
		const petalVertices = Array.from( new Set( Array.from( bluebell.indices.slice( bluebellPetal.start, bluebellPetal.start + bluebellPetal.count ) ) ) ).sort( ( a, b ) => a - b );
		for ( let bell = 0; bell + 3 < petalVertices.length; bell += 4 ) {
			const top = bluebell.positions[ petalVertices[ bell ]! * 3 + 1 ]!;
			const bottom = bluebell.positions[ petalVertices[ bell + 2 ]! * 3 + 1 ]!;
			expect( bottom ).toBeLessThan( top - 0.03 );
		}

		const calla = generateFlowersData( { seed: 3, variety: 'calla', count: 1 } );
		const callaMesh = calla.lods[ 0]!;
		const callaPetal = callaMesh.groups[ 0]!;
		const callaVertices = callaMesh.indices.slice( callaPetal.start, callaPetal.start + callaPetal.count );
		const callaPositions = Array.from( callaVertices, ( vertex ) => vertexPosition( callaMesh, vertex ) );
		const flowerHeight = Math.max( ...callaPositions.map( ( point ) => point[ 1 ] ) ) - Math.min( ...callaPositions.map( ( point ) => point[ 1 ] ) );
		const flowerWidth = Math.max( ...callaPositions.map( ( point ) => point[ 0 ] ) ) - Math.min( ...callaPositions.map( ( point ) => point[ 0 ] ) );
		expect( flowerHeight ).toBeGreaterThan( flowerWidth );
		const callaCenter = generateFlowersData( { seed: 3, variety: 'calla', centerColor: 0xff00ff } ).textures.petal!;
		expect( areByteIdentical( calla.textures.petal!.data, callaCenter.data ) ).toBe( false );

		const primrose = generateFlowersData( { seed: 3, variety: 'primrose' } );
		expect( primrose.bounds.height ).toBeLessThanOrEqual( 0.16 );
		// 花はお椀形: 中心が四隅より低い。
		const primroseMesh = primrose.lods[ 0 ]!;
		const primroseCenterY = primroseMesh.positions[ 1 ]!;
		const primroseRimY = [ 1, 2, 3, 4 ].reduce( ( sum, vertex ) => sum + primroseMesh.positions[ vertex * 3 + 1 ]!, 0 ) / 4;
		expect( primroseRimY ).toBeGreaterThan( primroseCenterY + 0.008 );

	} );

	it( 'keeps every face up-normal and weights roots 0 through flower tips 1', () => {

		for ( const variety of [ 'allium', 'daisy', 'tulip', ...newVarieties ] as const ) {

			const lods = generateFlowersData( { seed: 7, variety } ).lods;
			for ( const mesh of lods ) expect( [ ...mesh.normals ].every( ( value, index ) => index % 3 === 1 ? value === 1 : value === 0 ) ).toBe( true );
			const mesh = lods[ 0 ]!;

			let hasGroundRoot = false;
			for ( let vertex = 0; vertex < mesh.windWeight.length; vertex ++ ) {
				if ( mesh.positions[ vertex * 3 + 1 ] === 0 && mesh.windWeight[ vertex ] === 0 ) hasGroundRoot = true;
			}
			expect( hasGroundRoot ).toBe( true );
			expect( mesh.positions[ vertexWithMaximumY( mesh ) * 3 + 1 ] ).toBe( maximumY( mesh ) );
			expect( mesh.windWeight[ vertexWithMaximumY( mesh ) ] ).toBe( 1 );
			expect( Math.max( ...mesh.windWeight ) ).toBe( 1 );
		}

	} );

	it( 'keeps the original flower textures within the reference atlas and preserves allium card density', () => {

		for ( const variety of [ 'allium', 'daisy', 'tulip', ...newVarieties ] as const ) {
			const data = generateFlowersData( { seed: 3, variety } );
			const pixels = Object.entries( data.textures ).filter( ( [ name ] ) => name !== 'plantCard' ).reduce( ( sum, [ , texture ] ) => sum + texture.width * texture.height, 0 );
			expect( pixels ).toBeLessThanOrEqual( 256 * 256 );
			if ( variety === 'allium' ) {
				const plantCard = data.textures.plantCard!;
				const pixelsPerMeter = plantCard.height / data.bounds.height;
				expect( plantCard.width ).toBe( ALLIUM_PLANT_CARD_TEXTURE_WIDTH );
				expect( ALLIUM_HEAD_SIZE * pixelsPerMeter ).toBeGreaterThanOrEqual( FLOWERS_PETAL_TEXTURE_SIZE );
				expect( ( data.bounds.height - ALLIUM_HEAD_RISE - ALLIUM_HEAD_SIZE * 0.5 ) * pixelsPerMeter ).toBeGreaterThanOrEqual( FLOWERS_STEM_TEXTURE_HEIGHT );
			}
		}

	} );

	it( 'keeps the compact allium umbel in the high-resolution plant-card head region', () => {

		const data = generateFlowersData( { seed: 7, variety: 'allium' } );
		const petalTexture = createFlowersPetalTexture( 7, 'allium', 0xffffff, 0xffffff );
		let minX = petalTexture.width;
		let minY = petalTexture.height;
		let maxX = - 1;
		let maxY = - 1;

		for ( let y = 0; y < petalTexture.height; y ++ ) {
			for ( let x = 0; x < petalTexture.width; x ++ ) {
				if ( petalTexture.data[ ( y * petalTexture.width + x ) * 4 + 3 ] === 0 ) continue;
				minX = Math.min( minX, x );
				minY = Math.min( minY, y );
				maxX = Math.max( maxX, x );
				maxY = Math.max( maxY, y );
			}
		}

		// 花房のカードは 0.24 m。参考の花房は幅約 9〜12 cm。
		expect( ( maxX - minX + 1 ) / petalTexture.width ).toBeGreaterThanOrEqual( 0.375 );
		expect( ( maxX - minX + 1 ) / petalTexture.width ).toBeLessThanOrEqual( 0.5 );
		expect( ( maxY - minY + 1 ) / petalTexture.height ).toBeGreaterThanOrEqual( 0.33 );
		expect( ( maxY - minY + 1 ) / petalTexture.height ).toBeLessThanOrEqual( 0.5 );

		const plantCardTexture = data.textures.plantCard!;
		const headTop = plantCardTexture.height - Math.round( ALLIUM_HEAD_SIZE * plantCardTexture.height / data.bounds.height );
		let headCoverage = 0;
		for ( let pixel = headTop * plantCardTexture.width; pixel < plantCardTexture.width * plantCardTexture.height; pixel ++ ) {
			if ( plantCardTexture.data[ pixel * 4 + 3 ]! > 0 ) headCoverage ++;
		}
		expect( headCoverage ).toBeGreaterThan( 0 );

	} );

	it( 'builds a deterministic allium plant-card texture and recolors both layers', () => {

		const first = generateFlowersData( { seed: 19, variety: 'allium' } );
		const second = generateFlowersData( { seed: 19, variety: 'allium' } );
		const original = first.textures.plantCard!.data.slice();
		const petalColor = 0xa98bd6;
		const stemColor = 0x81603d;

		expect( areByteIdentical( first.textures.plantCard!.data, second.textures.plantCard!.data ) ).toBe( true );
		regenerateFlowersPetalTexture( first, petalColor );
		expect( areByteIdentical( first.textures.plantCard!.data, original ) ).toBe( false );
		regenerateFlowersStemTexture( first, stemColor );
		const fresh = generateFlowersData( { seed: 19, variety: 'allium', petalColor, stemColor } );
		expect( areByteIdentical( first.textures.plantCard!.data, fresh.textures.plantCard!.data ) ).toBe( true );
		const differentCenter = generateFlowersData( { seed: 19, variety: 'allium', centerColor: 0xff00ff } );
		expect( areByteIdentical( differentCenter.textures.plantCard!.data, second.textures.plantCard!.data ) ).toBe( false );

	} );

	it( 'uses two vertical cards in allium LOD3 and one full-tile vertical card in LOD4', () => {

		const data = generateFlowersData( { seed: 5, variety: 'allium' } );
		const lod3 = data.lods[ 3 ]!;
		const lod4 = data.lods[ 4 ]!;

		expect( triangleCount( lod3 ) ).toBe( 4 );
		expect( [ ...lod3.impostorCard ].every( ( card ) => card === 0 ) ).toBe( true );
		expect( triangleCount( lod4 ) ).toBe( 2 );
		expect( [ ...lod4.impostorCard ].every( ( card ) => card === 0 ) ).toBe( true );
		expect( Math.min( ...lod3.uvs.filter( ( _, index ) => index % 2 === 0 ) ) ).toBe( 0 );
		expect( Math.max( ...lod3.uvs.filter( ( _, index ) => index % 2 === 0 ) ) ).toBe( 1 );
		expect( Math.min( ...lod4.uvs.filter( ( _, index ) => index % 2 === 0 ) ) ).toBe( 0 );
		expect( Math.max( ...lod4.uvs.filter( ( _, index ) => index % 2 === 0 ) ) ).toBe( 1 );
		expect( data.parts[ 3 ]!.impostorFade ).toBe( false );
		expect( data.parts[ 3 ]!.impostorViews ).toHaveLength( 2 );
		expect( data.parts[ 3 ]!.upNormalCards ).toBe( true );
		expect( data.parts[ 4 ]!.impostorFade ).toBe( false );
		expect( data.parts[ 4 ]!.impostorViews ).toHaveLength( 1 );

		const prepared = prepareVegetationAsset( data, {}, 128 );
		for ( const [ textureName, viewCount ] of [ [ 'impostor-lod3', 2 ], [ 'impostor', 1 ] ] as const ) {
			const texture = prepared.impostorTextures[ textureName ]!;
			const tileWidth = texture.width / viewCount;
			for ( let view = 0; view < viewCount; view ++ ) {
				let covered = 0;
				let lower = 0;
				let upper = 0;
				for ( let y = 0; y < texture.height; y ++ ) {
					for ( let x = view * tileWidth; x < ( view + 1 ) * tileWidth; x ++ ) {
						if ( texture.data[ ( y * texture.width + x ) * 4 + 3 ]! < 128 ) continue;
						covered ++;
						if ( y < texture.height / 4 ) lower ++;
						if ( y >= texture.height * 3 / 4 ) upper ++;
					}
				}
				expect( covered ).toBeGreaterThan( 100 );
				expect( lower ).toBeGreaterThan( 0 );
				expect( upper ).toBeGreaterThan( 0 );
			}
		}

	} );

	it( 'tilts daisy heads 15 to 35 degrees while keeping each head on its curved stem tip', () => {

		const data = generateFlowersData( { seed: 17, variety: 'daisy' } );
		const mesh = data.lods[ 0 ]!;
		const stemFirstVertex = 30;
		let maximumStemTip = - Infinity;

		for ( let plant = 0; plant < 6; plant ++ ) {
			const headVertex = plant * 5;
			const center = vertexPosition( mesh, headVertex );
			const corners = [ 1, 2, 3, 4 ].map( ( corner ) => vertexPosition( mesh, headVertex + corner ) );
			// 傾きは四隅の面で測る。中心は四隅より低い（お椀形）。
			const firstEdge = corners[ 1 ]!.map( ( value, axis ) => value - corners[ 0 ]![ axis ]! );
			const secondEdge = corners[ 2 ]!.map( ( value, axis ) => value - corners[ 0 ]![ axis ]! );
			const cornerHeight = corners.reduce( ( sum, corner ) => sum + corner[ 1 ]!, 0 ) / 4;
			expect( cornerHeight - center[ 1 ] ).toBeGreaterThan( 0.03 );
			const normal = [
				firstEdge[ 1 ]! * secondEdge[ 2 ]! - firstEdge[ 2 ]! * secondEdge[ 1 ]!,
				firstEdge[ 2 ]! * secondEdge[ 0 ]! - firstEdge[ 0 ]! * secondEdge[ 2 ]!,
				firstEdge[ 0 ]! * secondEdge[ 1 ]! - firstEdge[ 1 ]! * secondEdge[ 0 ]!,
			];
			const tilt = Math.atan2( Math.hypot( normal[ 0 ]!, normal[ 2 ]! ), Math.abs( normal[ 1 ]! ) ) * 180 / Math.PI;
			expect( tilt ).toBeGreaterThanOrEqual( 14.8 );
			expect( tilt ).toBeLessThanOrEqual( 35.2 );

			const stemOffset = stemFirstVertex + plant * 20;
			const stemTip = cardRowCenter( mesh, stemOffset, 4 );
			maximumStemTip = Math.max( maximumStemTip, stemTip[ 1 ] );
			expect( Math.hypot( center[ 0 ] - stemTip[ 0 ], center[ 1 ] - stemTip[ 1 ], center[ 2 ] - stemTip[ 2 ] ) ).toBeLessThan( 1e-6 );

			const base = cardRowCenter( mesh, stemOffset, 0 );
			const middle = cardRowCenter( mesh, stemOffset, 2 );
			const tip = stemTip;
			const curve = Math.hypot( middle[ 0 ] - ( base[ 0 ] + tip[ 0 ] ) * 0.5, middle[ 2 ] - ( base[ 2 ] + tip[ 2 ] ) * 0.5 );
			expect( curve ).toBeGreaterThan( 0.002 );
		}
		expect( data.bounds.height ).toBeGreaterThan( maximumStemTip );

	} );

	it( 'regenerates petal and stem colors from cached shade data without changing geometry', () => {

		const options = { seed: 19, variety: 'daisy' as const };
		const data = generateFlowersData( options );
		const geometry = data.lods.map( ( mesh ) => mesh.positions.slice() );
		const petalColor = 0xa98bd6;
		const stemColor = 0x81603d;

		regenerateFlowersPetalTexture( data, petalColor );
		regenerateFlowersStemTexture( data, stemColor );
		const fresh = generateFlowersData( { ...options, petalColor, stemColor } );

		expect( areByteIdentical( data.textures.petal!.data, fresh.textures.petal!.data ) ).toBe( true );
		expect( areByteIdentical( data.textures.stem!.data, fresh.textures.stem!.data ) ).toBe( true );
		for ( let lod = 0; lod < geometry.length; lod ++ ) expect( areByteIdentical( data.lods[ lod ]!.positions, geometry[ lod ]! ) ).toBe( true );

	} );

	it( 'bakes the center color into the petal texture and keeps analytic alpha antialiasing', () => {

		for ( const variety of [ 'allium', 'daisy', 'tulip', ...newVarieties ] as const ) {

			const textureKey = variety === 'allium' ? 'plantCard' : 'petal';
			const first = generateFlowersData( { seed: 5, variety } ).textures[ textureKey ]!;
			const changed = generateFlowersData( { seed: 5, variety, centerColor: 0xff00ff } ).textures[ textureKey ]!;
			const alpha = new Set<number>();
			for ( let index = 3; index < first.data.length; index += 4 ) alpha.add( first.data[ index ]! );

			// tulip だけ centerColor を使わない（bluebell は花柄の色に使う）。
			expect( areByteIdentical( first.data, changed.data ) ).toBe( variety === 'tulip' );
			if ( variety !== 'tulip' ) expect( [ ...alpha ].some( ( value ) => value > 0 && value < 255 ) ).toBe( true );
			if ( variety === 'allium' ) expect( first.width ).toBe( ALLIUM_PLANT_CARD_TEXTURE_WIDTH );
			else {
				expect( first.colorFactors ).toHaveLength( first.width * first.height );
				expect( first.colorPixelIndices!.length ).toBeGreaterThan( 0 );
			}

		}

	} );

	it( 'keeps generation and impostor baking under 50 ms', () => {

		for ( const variety of [ 'allium', 'daisy', 'tulip', ...newVarieties ] as const ) {

			const start = performance.now();
			generateFlowersData( { seed: 1, variety } );
			const elapsed = performance.now() - start;
			console.log( `generateFlowersData ${ variety }: ${ elapsed.toFixed( 2 ) } ms` );
			expect( elapsed ).toBeLessThan( 50 );

		}

	} );

} );
