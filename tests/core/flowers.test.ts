import { describe, expect, it } from 'vitest';
import { generateFlowersData, regenerateFlowersPetalTexture, regenerateFlowersStemTexture } from '../../src/core/generators/flowers';
import type { MeshData } from '../../src/core/types';
import { areByteIdentical, areStructurallyByteIdentical } from '../helpers/byteIdentical';
import { validateMeshData } from '../helpers/validateMeshData';

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
			const caps = variety === 'allium' ? [ [ 120, 96 ], [ 48, 24 ] ] : [ [ 150, 120 ], [ 78, 48 ] ];

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

	it( 'keeps every face up-normal and weights roots 0 through flower tips 1', () => {

		for ( const variety of [ 'allium', 'daisy' ] as const ) {

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

		expect( maxX - minX + 1 ).toBeGreaterThanOrEqual( 82 );
		expect( maxX - minX + 1 ).toBeLessThanOrEqual( 104 );
		expect( maxY - minY + 1 ).toBeGreaterThanOrEqual( 82 );
		expect( maxY - minY + 1 ).toBeLessThanOrEqual( 104 );

		for ( const lod of [ mesh, data.lods[ 1 ]! ] ) {
			const isLod0 = lod === mesh;
			const petalsPerPlant = isLod0 ? 8 : 4;
			const petalVertices = isLod0 ? 48 : 24;
			const stemVerticesPerPlant = isLod0 ? 12 : 4;
			const stemSegments = isLod0 ? 2 : 1;
			for ( let plant = 0; plant < 6; plant ++ ) {
				const petalCenterVertex = plant * petalsPerPlant;
				const headCenter = quadCenter( lod, petalCenterVertex );
				const stemOffset = petalVertices + plant * stemVerticesPerPlant;
				const stemTip = cardRowCenter( lod, stemOffset, stemSegments );
				const distance = Math.hypot( headCenter[ 0 ] - stemTip[ 0 ], headCenter[ 1 ] - stemTip[ 1 ], headCenter[ 2 ] - stemTip[ 2 ] );
				expect( distance ).toBeLessThan( 1e-6 );
			}
		}

		let maximumStemTip = - Infinity;
		for ( let plant = 0; plant < 6; plant ++ ) {
			const stemOffset = 48 + plant * 12;
			const base = cardRowCenter( mesh, stemOffset, 0 );
			const middle = cardRowCenter( mesh, stemOffset, 1 );
			const tip = cardRowCenter( mesh, stemOffset, 2 );
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
			const firstCorner = vertexPosition( mesh, headVertex + 1 );
			const secondCorner = vertexPosition( mesh, headVertex + 2 );
			const firstEdge = firstCorner.map( ( value, axis ) => value - center[ axis ]! );
			const secondEdge = secondCorner.map( ( value, axis ) => value - center[ axis ]! );
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

		for ( const variety of [ 'allium', 'daisy' ] as const ) {

			const first = generateFlowersData( { seed: 5, variety } ).textures.petal!;
			const changed = generateFlowersData( { seed: 5, variety, centerColor: 0xff00ff } ).textures.petal!;
			const alpha = new Set<number>();
			for ( let index = 3; index < first.data.length; index += 4 ) alpha.add( first.data[ index ]! );

			expect( areByteIdentical( first.data, changed.data ) ).toBe( false );
			expect( [ ...alpha ].some( ( value ) => value > 0 && value < 255 ) ).toBe( true );
			expect( first.colorFactors ).toHaveLength( first.width * first.height );
			expect( first.colorPixelIndices!.length ).toBeGreaterThan( 0 );

		}

	} );

	it( 'keeps generation and impostor baking under 50 ms', () => {

		for ( const variety of [ 'allium', 'daisy' ] as const ) {

			const start = performance.now();
			generateFlowersData( { seed: 1, variety } );
			const elapsed = performance.now() - start;
			console.log( `generateFlowersData ${ variety }: ${ elapsed.toFixed( 2 ) } ms` );
			expect( elapsed ).toBeLessThan( 50 );

		}

	} );

} );
