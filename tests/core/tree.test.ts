import { describe, expect, it } from 'vitest';
import { buildBillboard, bakeImpostor, hexToLinear, impostorPart } from '../../src/core';
import { generateTreeData } from '../../src/core';
import type { TreeOptions } from '../../src/core';
import { validateMeshData } from '../helpers/validateMeshData';

function triangleCount( mesh: { indices: Uint32Array } ): number {

	return mesh.indices.length / 3;

}

function minimumY( positions: Float32Array ): number {

	let minimum = Infinity;

	for ( let i = 1; i < positions.length; i += 3 ) {

		minimum = Math.min( minimum, positions[ i ]! );

	}

	return minimum;

}

function defaultColors( data: ReturnType<typeof generateTreeData> ): [ number, number, number ][] {

	return data.parts.map( ( part ) => hexToLinear( part.defaultColor ) );

}

describe( 'stylized broadleaf tree data', () => {

	it( 'builds five valid, strictly decreasing LOD meshes and a billboard as the last LOD', () => {

		const options: TreeOptions = { seed: 1 };
		const data = generateTreeData( options );
		const counts = data.lods.map( triangleCount );

		expect( data.lods ).toHaveLength( 5 );
		expect( data.parts ).toHaveLength( 3 );
		expect( data.parts[ 0 ] ).toEqual( {
			name: 'bark',
			defaultColor: 0x6b4a32,
			texture: null,
			alphaTest: 0,
			doubleSided: false,
			flatShading: true,
		} );
		expect( data.parts[ 1 ] ).toEqual( {
			name: 'leaf',
			defaultColor: 0x5a8f3a,
			texture: 'leaf',
			alphaTest: 0.5,
			doubleSided: true,
			flatShading: false,
		} );
		expect( data.parts[ 2 ] ).toEqual( impostorPart() );

		for ( const lod of data.lods ) validateMeshData( lod );

		expect( counts[ 0 ] ).toBeGreaterThanOrEqual( 600 );
		expect( counts[ 0 ] ).toBeLessThanOrEqual( 1000 );
		expect( counts[ 0 ] ).toBeGreaterThan( counts[ 1 ]! );
		expect( counts[ 1 ] ).toBeGreaterThan( counts[ 2 ]! );
		expect( counts[ 2 ] ).toBeGreaterThan( counts[ 3 ]! );
		expect( counts[ 3 ] ).toBeGreaterThan( counts[ 4 ]! );
		expect( counts[ 4 ] ).toBeLessThanOrEqual( 12 );
		expect( data.lods[ 4 ] ).toEqual( buildBillboard( data.bounds, 2 ) );

	} );

	it( 'is deterministic per seed and changes shape for another seed', () => {

		const first = generateTreeData( { seed: 1 } );
		const repeated = generateTreeData( { seed: 1 } );
		const other = generateTreeData( { seed: 2 } );

		expect( first.lods[ 0 ]!.positions ).toEqual( repeated.lods[ 0 ]!.positions );
		expect( first.lods[ 0 ]!.positions ).not.toEqual( other.lods[ 0 ]!.positions );

	} );

	it( 'keeps every LOD above the ground', () => {

		const data = generateTreeData( { seed: 6 } );

		for ( const lod of data.lods ) {

			expect( minimumY( lod.positions ) ).toBeGreaterThanOrEqual( - 0.05 );

		}

	} );

	it( 'keeps LOD3 between four and six broad cards for custom branch counts', () => {

		for ( const branchCount of [ 4, 8 ] ) {

			const data = generateTreeData( { seed: 1, branchCount } );
			const trunkTriangles = 15;
			const canopyCards = ( triangleCount( data.lods[ 3 ]! ) - trunkTriangles ) / 2;

			expect( canopyCards ).toBeGreaterThanOrEqual( 4 );
			expect( canopyCards ).toBeLessThanOrEqual( 6 );

		}

	} );

	it( 'keeps the trunk collider compact and below the first branch', () => {

		const data = generateTreeData( { seed: 1 } );
		const collider = data.collider!;
		let rootRadius = 0;
		let colliderMaximumY = - Infinity;

		for ( let i = 0; i < data.lods[ 0 ]!.positions.length; i += 3 ) {

			const x = data.lods[ 0 ]!.positions[ i ]!;
			const y = data.lods[ 0 ]!.positions[ i + 1 ]!;
			const z = data.lods[ 0 ]!.positions[ i + 2 ]!;

			if ( y <= data.bounds.height * 0.04 ) rootRadius = Math.max( rootRadius, Math.hypot( x, z ) );

		}

		for ( let i = 0; i < collider.positions.length; i += 3 ) {

			const x = collider.positions[ i ]!;
			const y = collider.positions[ i + 1 ]!;
			const z = collider.positions[ i + 2 ]!;

			colliderMaximumY = Math.max( colliderMaximumY, y );
			expect( Math.hypot( x, z ) ).toBeLessThanOrEqual( rootRadius * 1.5 );

		}

		expect( triangleCount( { indices: collider.indices } ) ).toBeLessThanOrEqual( 48 );
		expect( colliderMaximumY ).toBeLessThanOrEqual( data.bounds.height * 0.6 );

	} );

	it( 'generates all LODs and bakes a 128 pixel impostor in under 50 ms after warm-up', () => {

		const generateAndBake = (): void => {

			const data = generateTreeData( { seed: 1 } );
			bakeImpostor( data, defaultColors( data ), 128 );

		};

		generateAndBake();

		const start = performance.now();
		generateAndBake();
		const elapsed = performance.now() - start;

		expect( elapsed ).toBeLessThan( 50 );

	} );

} );
