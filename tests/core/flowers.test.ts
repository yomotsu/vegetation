import { describe, expect, it } from 'vitest';
import { generateFlowersData, regenerateFlowersPetalTexture, regenerateFlowersStemTexture } from '../../src/core/generators/flowers';
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

function quadCenter( mesh: MeshData, firstVertex: number ): [ number, number, number ] {

	const center: [ number, number, number ] = [ 0, 0, 0 ];
	for ( let vertex = 0; vertex < 4; vertex ++ ) {
		const position = vertexPosition( mesh, firstVertex + vertex );
		for ( let axis = 0; axis < 3; axis ++ ) center[ axis ] = center[ axis ]! + position[ axis ]! / 4;
	}
	return center;

}

describe( 'flowers core generator', () => {

	for ( const variety of [ 'allium', 'daisy' ] as const ) {

		it( `creates deterministic valid ${ variety } LODs within the reference caps`, () => {

			const first = generateFlowersData( { seed: 31, variety } );
			const second = generateFlowersData( { seed: 31, variety } );
			const caps = variety === 'allium' ? [ [ 144, 96 ], [ 48, 24 ] ] : [ [ 150, 120 ], [ 78, 48 ] ];

			expect( first.kind ).toBe( 'flowers' );
			expect( first.collider ).toBeNull();
			expect( first.lods ).toHaveLength( 5 );
			expect( first.parts.map( ( part ) => part.name ) ).toEqual( [ 'petal', 'stem', 'impostor-lod3', 'impostor' ] );

			for ( let lod = 0; lod < 5; lod ++ ) {

				validateMeshData( first.lods[ lod ]! );
				expect( areStructurallyByteIdentical( first.lods[ lod ]!, second.lods[ lod ]! ) ).toBe( true );
				if ( lod < 2 ) {
					expect( vertexCount( first.lods[ lod ]! ) ).toBeLessThanOrEqual( caps[ lod ]![ 0 ]! );
					expect( triangleCount( first.lods[ lod ]! ) ).toBeLessThanOrEqual( caps[ lod ]![ 1 ]! );
				}

			}

			expect( first.lods.map( triangleCount ) ).toEqual( [ ...first.lods.map( triangleCount ) ].sort( ( a, b ) => b - a ) );
			expect( first.lods.slice( 1 ).every( ( mesh, index ) => triangleCount( mesh ) < triangleCount( first.lods[ index ]! ) ) ).toBe( true );

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
				positions: '9c5d46efeb123860749707463cac4c26aaf9cc3945132927909149a4387a44cc',
				indices: '6e0df0d9cd4098f2706f499a0cb240a0aa6b31b6549f8b7099e8b0316f2aa6aa',
				petal: '8df3b2b3af006018a551685114158cc58d8770c120db35859bc4a63a3b5d33ae',
				stem: '8a1c0ca9271f2fb5e1877d7d6f57ea5c19449a9eeaddb03a999f96c8ae1a96ed',
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
			expect( {
				positions: await hash( data.lods[ 0 ]!.positions ),
				indices: await hash( data.lods[ 0 ]!.indices ),
				petal: await hash( data.textures.petal!.data ),
				stem: await hash( data.textures.stem!.data ),
			} ).toEqual( expected[ variety ] );
		}

	} );

	it( 'preserves adopted flower geometry and textures across seeds 1, 2, and 7', async () => {

		const hash = async ( bytes: ArrayBufferView ) => {
			const source = new Uint8Array( bytes.buffer, bytes.byteOffset, bytes.byteLength );
			const digest = await globalThis.crypto.subtle.digest( 'SHA-256', Uint8Array.from( source ) );
			return Array.from( new Uint8Array( digest ), ( value ) => value.toString( 16 ).padStart( 2, '0' ) ).join( '' );
		};
		const expected = [
			[ 'allium', 1, [ '9c5d46efeb123860749707463cac4c26aaf9cc3945132927909149a4387a44cc', '6e0df0d9cd4098f2706f499a0cb240a0aa6b31b6549f8b7099e8b0316f2aa6aa', '47e367f845c96bc8e582b8eae92aed760682fc63e67a6b382cf93ef67780a7f1', '8df3b2b3af006018a551685114158cc58d8770c120db35859bc4a63a3b5d33ae', '8a1c0ca9271f2fb5e1877d7d6f57ea5c19449a9eeaddb03a999f96c8ae1a96ed' ] ],
			[ 'allium', 2, [ 'c11372d485623a0bd3df5951bb35a1435a4067c89f24afb9fdbf8bc70376c48f', '6e0df0d9cd4098f2706f499a0cb240a0aa6b31b6549f8b7099e8b0316f2aa6aa', '17a738c3e836ebc6dfc6939c1a8c879749aa61c3437fc7b996a573f48480bbd2', '9b3b0252a1f6991ddbb7f02c0fc9acb032e900283438b5ffa047c5fe6894ab45', 'db19c9797e1b44a526ca29a7df9d40ecd9e989c1624a76489e3c63c4dfe29079' ] ],
			[ 'allium', 7, [ '03f97aeb3ee9321493e2e6a05d36b325ed31d245ac802dda565d8678137a92e0', '6e0df0d9cd4098f2706f499a0cb240a0aa6b31b6549f8b7099e8b0316f2aa6aa', 'f98f407038486a020820f796fffd3191d0bc74cefa8ffb504c66628a60c70fe6', '82538e595c7518986262214e753b99b5a7af3d548a46a44969e626849b46b98d', '1e1b4eddca692b5d3abf632110e6609ea3bb6d8a85b80262f724e14f512f3c9f' ] ],
			[ 'daisy', 1, [ '428c601204a4316a80ca6ff6b3455a33c962cd2076277d695faab564f2140fa8', 'bab8dcf8a445986d4199cc1f71c281d6e9a1338132bca9004bb38c1dbe45bfa8', '57fbdacbfda8e1942248579fd85df15cb28798790db0ef7e90fadfe9c992def4', '222a9e2a0bb425d388c14a29da4801971dc58b9be6226094d9125333a30c9c1d', 'ea67baca2f1e5707db9ed676c70efb101bd22204733ea5910ab6da569b9354c6' ] ],
			[ 'daisy', 2, [ '42c32016ce3597322586bb69ca00a75530ae21aaedadd2fb02ee20cc349c7d0a', 'bab8dcf8a445986d4199cc1f71c281d6e9a1338132bca9004bb38c1dbe45bfa8', 'fd68a392fb79a5deab3b4570aac244ead053af7eb41ab3b3e7ebb85680553416', '43ea4c6d2c7ef3ab7df96158ab76ec9da5e3a1cad49ee105145aaf9de286adea', '5033481f927f85805d9b44abd7a244a6a117325c388393f54b4d57ed21a2c1fa' ] ],
			[ 'daisy', 7, [ '0ddbb7c47de8fa01e4e3235785228288d8d9178cd18be5de49fe3eae06646a76', 'bab8dcf8a445986d4199cc1f71c281d6e9a1338132bca9004bb38c1dbe45bfa8', '346e626c596260439e050e9cbff38e62feba0f71d16a40ea71cbdf4b2fbf6c29', '694a01b81576c102e399d0525fbf9105b8090ab0edb2e6366020aa9bbdc4dc2d', '234137286cb32df7ded25af49300ad9e61eeed760d2fae41fbb15a19b5b254b5' ] ],
			[ 'tulip', 1, [ 'd96f7c3225af3fbe225eec3add62b03fe2b3b9328a421d2c83db0a588d4e6adf', '4ad30ebb99732e36b471e4ccfb31d522ff4200697df4b84eed352f920d6ce64d', '1fd9dc88b778a838469f30ce6101151dae6a79b0b9533929abe5996847af7681', 'a661cfd69e67197768e729e92f10fe551df93db40bcf59c854d2b715f6588546', 'd141ae5b8a496d248704f8408b653bb40914f5160f0670cb197506c6fc315ac3' ] ],
			[ 'tulip', 2, [ '1dd74fbdd94a35e5369e0cbcfcdf343bcbba7d99bcc2fe812b60b5d1fea24c27', '4ad30ebb99732e36b471e4ccfb31d522ff4200697df4b84eed352f920d6ce64d', '1fd9dc88b778a838469f30ce6101151dae6a79b0b9533929abe5996847af7681', 'a661cfd69e67197768e729e92f10fe551df93db40bcf59c854d2b715f6588546', 'd141ae5b8a496d248704f8408b653bb40914f5160f0670cb197506c6fc315ac3' ] ],
			[ 'tulip', 7, [ '7341bd5bad605d5a87321523f0166cbac4ef5ff445d0acb1234c96f75cedb2da', '4ad30ebb99732e36b471e4ccfb31d522ff4200697df4b84eed352f920d6ce64d', '1fd9dc88b778a838469f30ce6101151dae6a79b0b9533929abe5996847af7681', 'a661cfd69e67197768e729e92f10fe551df93db40bcf59c854d2b715f6588546', 'd141ae5b8a496d248704f8408b653bb40914f5160f0670cb197506c6fc315ac3' ] ],
		];

		for ( const [ variety, seed, values ] of expected ) {
			const data = generateFlowersData( { variety: variety as 'allium' | 'daisy' | 'tulip', seed: seed as number } );
			expect( [
				await hash( data.lods[ 0 ]!.positions ),
				await hash( data.lods[ 0 ]!.indices ),
				await hash( data.lods[ 0 ]!.uvs ),
				await hash( data.textures.petal!.data ),
				await hash( data.textures.stem!.data ),
			] ).toEqual( values );
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
			{ variety: 'calla' as const, segments: 2 },
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

	it( 'keeps the textures within the reference 256 x 256 atlas', () => {

		// 参考 glTF は花 1 種につき 256×256 のアトラス 1 枚。花と茎の合計がそれを超えないこと。
		for ( const variety of [ 'allium', 'daisy', 'tulip', ...newVarieties ] as const ) {
			const data = generateFlowersData( { seed: 3, variety } );
			const pixels = Object.values( data.textures ).reduce( ( sum, texture ) => sum + texture.width * texture.height, 0 );
			expect( pixels ).toBeLessThanOrEqual( 256 * 256 );
		}

	} );

	it( 'centers the compact allium umbel on a curved stem tip', () => {

		const data = generateFlowersData( { seed: 7, variety: 'allium' } );
		const mesh = data.lods[ 0 ]!;
		const petalTexture = data.textures.petal!;
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

		for ( const lod of [ mesh, data.lods[ 1 ]! ] ) {
			const isLod0 = lod === mesh;
			const petalsPerPlant = isLod0 ? 8 : 4;
			const petalVertices = isLod0 ? 48 : 24;
			const stemVerticesPerPlant = isLod0 ? 16 : 4;
			const stemSegments = isLod0 ? 3 : 1;
			for ( let plant = 0; plant < 6; plant ++ ) {
				const petalCenterVertex = plant * petalsPerPlant;
				const headCenter = quadCenter( lod, petalCenterVertex );
				const stemOffset = petalVertices + plant * stemVerticesPerPlant;
				const stemTip = cardRowCenter( lod, stemOffset, stemSegments );
				// 花房は茎の先より 3.5 cm 上に中心を置き、茎の先が房の下寄りに入る。
				const distance = Math.hypot( headCenter[ 0 ] - stemTip[ 0 ], headCenter[ 1 ] - stemTip[ 1 ] - 0.035, headCenter[ 2 ] - stemTip[ 2 ] );
				expect( distance ).toBeLessThan( 1e-6 );
			}
		}

		let maximumStemTip = - Infinity;
		for ( let plant = 0; plant < 6; plant ++ ) {
			const stemOffset = 48 + plant * 16;
			const base = cardRowCenter( mesh, stemOffset, 0 );
			const middle = cardRowCenter( mesh, stemOffset, 2 );
			const tip = cardRowCenter( mesh, stemOffset, 3 );
			maximumStemTip = Math.max( maximumStemTip, tip[ 1 ] );
			const curve = Math.hypot( middle[ 0 ] - ( base[ 0 ] + tip[ 0 ] ) * 0.5, middle[ 2 ] - ( base[ 2 ] + tip[ 2 ] ) * 0.5 );
			expect( curve ).toBeGreaterThan( 0.003 );
		}
		expect( data.bounds.height ).toBeGreaterThan( maximumStemTip );

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

			const first = generateFlowersData( { seed: 5, variety } ).textures.petal!;
			const changed = generateFlowersData( { seed: 5, variety, centerColor: 0xff00ff } ).textures.petal!;
			const alpha = new Set<number>();
			for ( let index = 3; index < first.data.length; index += 4 ) alpha.add( first.data[ index ]! );

			// tulip だけ centerColor を使わない（bluebell は花柄の色に使う）。
			expect( areByteIdentical( first.data, changed.data ) ).toBe( variety === 'tulip' );
			if ( variety !== 'tulip' ) expect( [ ...alpha ].some( ( value ) => value > 0 && value < 255 ) ).toBe( true );
			expect( first.colorFactors ).toHaveLength( first.width * first.height );
			expect( first.colorPixelIndices!.length ).toBeGreaterThan( 0 );

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
