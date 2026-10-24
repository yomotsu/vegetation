import { describe, expect, it } from 'vitest';
import { buildBillboard, bakeImpostor, getTreeCrownBounds, hexToLinear, impostorPart } from '../../src/core';
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

function maximumY( positions: Float32Array ): number {

	let maximum = - Infinity;

	for ( let i = 1; i < positions.length; i += 3 ) {

		maximum = Math.max( maximum, positions[ i ]! );

	}

	return maximum;

}

function defaultColors( data: ReturnType<typeof generateTreeData> ): [ number, number, number ][] {

	return data.parts.map( ( part ) => hexToLinear( part.defaultColor ) );

}

function leafBounds( mesh: ReturnType<typeof generateTreeData>[ 'lods' ][ number ] ): [ number, number, number, number, number, number ] {

	const bounds: [ number, number, number, number, number, number ] = [ Infinity, Infinity, Infinity, - Infinity, - Infinity, - Infinity ];

	for ( const group of mesh.groups ) {

		if ( group.partIndex !== 1 ) {

			continue;

		}

		for ( let i = group.start; i < group.start + group.count; i ++ ) {

			const index = mesh.indices[ i ]! * 3;

			for ( let axis = 0; axis < 3; axis ++ ) {

				bounds[ axis ] = Math.min( bounds[ axis ]!, mesh.positions[ index + axis ]! );
				bounds[ axis + 3 ] = Math.max( bounds[ axis + 3 ]!, mesh.positions[ index + axis ]! );

			}

		}

	}

	return bounds;

}

function boundsRadius( mesh: ReturnType<typeof generateTreeData>[ 'lods' ][ number ] ): number {

	let radius = 0;

	for ( let i = 0; i < mesh.positions.length; i += 3 ) {

		radius = Math.max( radius, Math.hypot( mesh.positions[ i ]!, mesh.positions[ i + 2 ]! ) );

	}

	return radius;

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

	it( 'keeps the crown inside the tree height so impostor views do not clip', () => {

		const data = generateTreeData( { seed: 1 } );

		for ( const lod of data.lods ) {
			expect( maximumY( lod.positions ) ).toBeLessThanOrEqual( data.bounds.height + 1e-5 );
		}

	} );

	it( 'winds every LOD0 leaf triangle toward its spherical vertex normals', () => {

		const mesh = generateTreeData( { seed: 1 } ).lods[ 0 ]!;

		for ( const group of mesh.groups ) {

			if ( group.partIndex !== 1 ) {
				continue;
			}

			for ( let i = group.start; i < group.start + group.count; i += 3 ) {

				const indices = [ mesh.indices[ i ]!, mesh.indices[ i + 1 ]!, mesh.indices[ i + 2 ]! ];
				const points = indices.map( ( index ) => [ mesh.positions[ index * 3 ]!, mesh.positions[ index * 3 + 1 ]!, mesh.positions[ index * 3 + 2 ]! ] );
				const first = points[ 0 ]!;
				const second = points[ 1 ]!;
				const third = points[ 2 ]!;
				const edgeA = [ second[ 0 ]! - first[ 0 ]!, second[ 1 ]! - first[ 1 ]!, second[ 2 ]! - first[ 2 ]! ];
				const edgeB = [ third[ 0 ]! - first[ 0 ]!, third[ 1 ]! - first[ 1 ]!, third[ 2 ]! - first[ 2 ]! ];
				const geometricNormal = [
					edgeA[ 1 ]! * edgeB[ 2 ]! - edgeA[ 2 ]! * edgeB[ 1 ]!,
					edgeA[ 2 ]! * edgeB[ 0 ]! - edgeA[ 0 ]! * edgeB[ 2 ]!,
					edgeA[ 0 ]! * edgeB[ 1 ]! - edgeA[ 1 ]! * edgeB[ 0 ]!,
				];
				const vertexNormal = [ 0, 1, 2 ].map( ( axis ) => indices.reduce( ( sum, index ) => sum + mesh.normals[ index * 3 + axis ]!, 0 ) );
				const dot = geometricNormal.reduce( ( sum, value, axis ) => sum + value * vertexNormal[ axis ]!, 0 );

				expect( dot ).toBeGreaterThanOrEqual( - 1e-5 );

			}

		}

	} );

	it( 'keeps every leaf clump in the LOD0–LOD2 canopy bounds', () => {

		const data = generateTreeData( { seed: 1 } );
		const reference = leafBounds( data.lods[ 0 ]! );
		const tolerance = Math.max( ...[ 0, 1, 2 ].map( ( axis ) => reference[ axis + 3 ]! - reference[ axis ]! ) ) * 0.1;

		for ( const lod of data.lods.slice( 1, 3 ) ) {

			const candidate = leafBounds( lod );

			for ( let axis = 0; axis < 6; axis ++ ) {

				expect( Math.abs( candidate[ axis ]! - reference[ axis ]! ) ).toBeLessThanOrEqual( tolerance );

			}

		}

	} );

	it( 'keeps the LOD3 leaf silhouette within fifteen percent of LOD0', () => {

		for ( const seed of [ 1, 2, 3 ] ) {

			const data = generateTreeData( { seed } );
			const reference = leafBounds( data.lods[ 0 ]! );
			const candidate = leafBounds( data.lods[ 3 ]! );

			for ( let axis = 0; axis < 6; axis ++ ) {

				const extent = reference[ axis % 3 + 3 ]! - reference[ axis % 3 ]!;
				expect( Math.abs( candidate[ axis ]! - reference[ axis ]! ) ).toBeLessThanOrEqual( extent * 0.15 );

			}

		}

	} );

	it( 'bakes an opaque canopy across at least eighty percent of its inscribed +Z crown ellipse', () => {

		const data = generateTreeData( { seed: 1 } );
		const image = bakeImpostor( data, defaultColors( data ), 128 );
		const crown = getTreeCrownBounds( { seed: 1 } );
		const centerX = ( crown.minX + crown.maxX ) * 0.5;
		const centerY = ( crown.minY + crown.maxY ) * 0.5;
		const radiusX = ( crown.maxX - crown.minX ) * 0.5;
		const radiusY = ( crown.maxY - crown.minY ) * 0.5;
		let covered = 0;
		let pixels = 0;

		for ( let y = 0; y < 128; y ++ ) {

			for ( let x = 0; x < 128; x ++ ) {

				const worldX = ( ( x + 0.5 ) / 128 * 2 - 1 ) * data.bounds.radius;
				const worldY = ( y + 0.5 ) / 128 * data.bounds.height;
				const ellipse = ( ( worldX - centerX ) / radiusX ) ** 2 + ( ( worldY - centerY ) / radiusY ) ** 2;

				if ( ellipse > 1 ) {

					continue;

				}

				pixels ++;

				if ( image.data[ ( y * image.width + x ) * 4 + 3 ] === 255 ) {

					covered ++;

				}

			}
		}

		expect( covered / pixels ).toBeGreaterThanOrEqual( 0.8 );

	} );

	it( 'includes the LOD3 crown extent in bounds and clamps crownSize to the supported range', () => {

		const data = generateTreeData( { seed: 1 } );

		for ( const lod of data.lods.slice( 0, 4 ) ) {

			expect( data.bounds.radius ).toBeGreaterThanOrEqual( boundsRadius( lod ) );

		}

		expect( generateTreeData( { seed: 1, crownSize: 0.1 } ).lods[ 0 ]!.positions ).toEqual( generateTreeData( { seed: 1, crownSize: 0.5 } ).lods[ 0 ]!.positions );
		expect( generateTreeData( { seed: 1, crownSize: 2 } ).lods[ 0 ]!.positions ).toEqual( generateTreeData( { seed: 1, crownSize: 1.5 } ).lods[ 0 ]!.positions );

	} );

	it( 'flares the trunk base to about 1.6 times its unflared radius', () => {

		const data = generateTreeData( { seed: 1 } );
		const mesh = data.lods[ 0 ]!;
		const bark = mesh.groups.find( ( group ) => group.partIndex === 0 )!;
		let baseRadius = 0;
		let upperRadius = 0;

		for ( let i = bark.start; i < bark.start + bark.count; i ++ ) {

			const index = mesh.indices[ i ]! * 3;
			const y = mesh.positions[ index + 1 ]!;
			const radius = Math.hypot( mesh.positions[ index ]!, mesh.positions[ index + 2 ]! );

			if ( y <= data.bounds.height * 0.01 ) {

				baseRadius = Math.max( baseRadius, radius );

			}

			if ( y >= data.bounds.height * 0.085 && y <= data.bounds.height * 0.095 ) {

				upperRadius = Math.max( upperRadius, radius );

			}

		}

		expect( baseRadius / upperRadius ).toBeGreaterThan( 1.5 );

	} );

	it( 'builds LOD3 from exactly three broad cards for custom branch counts', () => {

		for ( const branchCount of [ 4, 8 ] ) {

			const data = generateTreeData( { seed: 1, branchCount } );
			const trunkTriangles = 15;
			const canopyCards = ( triangleCount( data.lods[ 3 ]! ) - trunkTriangles ) / 2;

			expect( canopyCards ).toBe( 3 );

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
