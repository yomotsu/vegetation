import { describe, expect, it } from 'vitest';
import { bakeImpostor, buildBillboard, hexToLinear, impostorPart } from '../../src/core';
import { generateTreeData } from '../../src/core';
import type { MeshData } from '../../src/core';
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

function leafGroup( mesh: MeshData ) {

	return mesh.groups.find( ( group ) => group.partIndex === 1 )!;

}

describe( 'conifer tree data', () => {

	it( 'builds five valid, strictly decreasing LOD meshes and reference-matched parts', () => {

		const data = generateTreeData( { seed: 1 } );
		const counts = data.lods.map( triangleCount );

		expect( data.bounds.height ).toBe( 7.5 );
		expect( data.lods ).toHaveLength( 5 );
		expect( data.parts ).toHaveLength( 3 );
		expect( data.parts[ 0 ] ).toEqual( {
			name: 'bark',
			defaultColor: 0xffffff,
			texture: 'bark',
			alphaTest: 0,
			doubleSided: false,
			flatShading: false,
			roughness: 0.85,
		} );
		expect( data.parts[ 1 ] ).toEqual( {
			name: 'leaf',
			defaultColor: 0xd0d8c0,
			texture: 'leaf',
			alphaTest: 0.5,
			doubleSided: false,
			flatShading: false,
			roughness: 0.95,
		} );
		expect( data.parts[ 2 ] ).toEqual( impostorPart() );
		expect( Object.keys( data.textures ).sort() ).toEqual( [ 'bark', 'leaf' ] );

		for ( const lod of data.lods ) validateMeshData( lod );

		expect( counts[ 0 ] ).toBeGreaterThanOrEqual( 600 );
		expect( counts[ 0 ] ).toBeLessThanOrEqual( 1000 );
		expect( counts[ 0 ] ).toBe( 168 + 14 * 6 * 8 );
		expect( counts[ 1 ] ).toBeLessThan( counts[ 0 ]! );
		expect( counts[ 1 ] ).toBeGreaterThanOrEqual( counts[ 0 ]! * 0.45 );
		expect( counts[ 1 ] ).toBeLessThanOrEqual( counts[ 0 ]! * 0.6 );
		expect( counts[ 2 ] ).toBeLessThan( counts[ 1 ]! );
		expect( counts[ 2 ] ).toBeGreaterThanOrEqual( counts[ 0 ]! * 0.2 );
		expect( counts[ 2 ] ).toBeLessThanOrEqual( counts[ 0 ]! * 0.35 );
		expect( counts[ 3 ] ).toBeLessThan( counts[ 2 ]! );
		expect( counts[ 3 ] ).toBeLessThanOrEqual( 40 );
		expect( counts[ 4 ] ).toBeLessThan( counts[ 3 ]! );
		expect( counts[ 4 ] ).toBeLessThanOrEqual( 12 );
		expect( data.lods[ 4 ] ).toEqual( buildBillboard( data.bounds, 2 ) );

	} );

	it( 'is deterministic per seed and changes the conifer silhouette for another seed', () => {

		const first = generateTreeData( { seed: 1 } );
		const repeated = generateTreeData( { seed: 1 } );
		const other = generateTreeData( { seed: 2 } );

		expect( first.lods[ 0 ]!.positions ).toEqual( repeated.lods[ 0 ]!.positions );
		expect( first.lods[ 0 ]!.positions ).not.toEqual( other.lods[ 0 ]!.positions );
		expect( first.textures.leaf!.data ).toEqual( repeated.textures.leaf!.data );
		expect( first.textures.leaf!.data ).not.toEqual( other.textures.leaf!.data );

	} );

	it( 'keeps every LOD above the ground and below its configured height', () => {

		const data = generateTreeData( { seed: 6 } );

		for ( const lod of data.lods ) {

			expect( minimumY( lod.positions ) ).toBeGreaterThanOrEqual( - 0.05 );
			expect( maximumY( lod.positions ) ).toBeLessThanOrEqual( data.bounds.height + 1e-5 );

		}

	} );

	it( 'uses upward stylized leaf normals and separates trunk and frond wind weights', () => {

		const mesh = generateTreeData( { seed: 1 } ).lods[ 0 ]!;
		const leaves = leafGroup( mesh );
		const winds: number[] = [];

		for ( let i = leaves.start; i < leaves.start + leaves.count; i ++ ) {

			const index = mesh.indices[ i ]!;
			const offset = index * 3;

			expect( mesh.normals[ offset ] ).toBeCloseTo( 0 );
			expect( mesh.normals[ offset + 1 ] ).toBeCloseTo( 1 );
			expect( mesh.normals[ offset + 2 ] ).toBeCloseTo( 0 );
			winds.push( mesh.windWeight[ index ]! );

		}

		expect( Math.min( ...winds ) ).toBeGreaterThanOrEqual( 0.5 );
		expect( Math.max( ...winds ) ).toBeLessThanOrEqual( 1 );

		const bark = mesh.groups.find( ( group ) => group.partIndex === 0 )!;
		const barkWinds = Array.from( { length: bark.count }, ( _, i ) => mesh.windWeight[ mesh.indices[ bark.start + i ]! ]! );

		expect( Math.min( ...barkWinds ) ).toBeGreaterThanOrEqual( 0 );
		expect( Math.max( ...barkWinds ) ).toBeLessThanOrEqual( 0.3001 );

	} );

	it( 'keeps both near-horizontal paired frond faces non-degenerate with upward normals', () => {

		const mesh = generateTreeData( { seed: 1 } ).lods[ 0 ]!;
		const leaves = leafGroup( mesh );

		for ( let start = leaves.start; start < leaves.start + leaves.count; start += 24 ) {

			const faceNormals: [ number, number, number ][][] = [ [], [] ];

			for ( let face = 0; face < 2; face ++ ) {

				for ( let triangle = 0; triangle < 4; triangle ++ ) {

					const triangleStart = start + face * 12 + triangle * 3;
					const indices = [ mesh.indices[ triangleStart ]!, mesh.indices[ triangleStart + 1 ]!, mesh.indices[ triangleStart + 2 ]! ];
					const points = indices.map( ( index ) => [ mesh.positions[ index * 3 ]!, mesh.positions[ index * 3 + 1 ]!, mesh.positions[ index * 3 + 2 ]! ] );
					const first = points[ 0 ]!;
					const second = points[ 1 ]!;
					const third = points[ 2 ]!;
					const edgeA = [ second[ 0 ]! - first[ 0 ]!, second[ 1 ]! - first[ 1 ]!, second[ 2 ]! - first[ 2 ]! ];
					const edgeB = [ third[ 0 ]! - first[ 0 ]!, third[ 1 ]! - first[ 1 ]!, third[ 2 ]! - first[ 2 ]! ];
					const normal: [ number, number, number ] = [
						edgeA[ 1 ]! * edgeB[ 2 ]! - edgeA[ 2 ]! * edgeB[ 1 ]!,
						edgeA[ 2 ]! * edgeB[ 0 ]! - edgeA[ 0 ]! * edgeB[ 2 ]!,
						edgeA[ 0 ]! * edgeB[ 1 ]! - edgeA[ 1 ]! * edgeB[ 0 ]!,
					];

					const normalLength = Math.hypot( ...normal );

					expect( normalLength ).toBeGreaterThan( 0 );
					expect( Math.abs( normal[ 1 ]! ) / normalLength ).toBeGreaterThanOrEqual( 0.8 );
					faceNormals[ face ]!.push( normal );

					for ( const index of indices ) {

						expect( mesh.normals[ index * 3 ] ).toBeCloseTo( 0 );
						expect( mesh.normals[ index * 3 + 1 ] ).toBeCloseTo( 1 );
						expect( mesh.normals[ index * 3 + 2 ] ).toBeCloseTo( 0 );

					}

				}

			}

			const frontAlignment = faceNormals[ 0 ]![ 0 ]!.reduce( ( sum, value, axis ) => sum + value * faceNormals[ 0 ]![ 1 ]![ axis ]!, 0 );
			const backAlignment = faceNormals[ 1 ]![ 0 ]!.reduce( ( sum, value, axis ) => sum + value * faceNormals[ 1 ]![ 1 ]![ axis ]!, 0 );
			const faceDot = faceNormals[ 0 ]![ 0 ]!.reduce( ( sum, value, axis ) => sum + value * faceNormals[ 1 ]![ 0 ]![ axis ]!, 0 );

			expect( frontAlignment ).toBeGreaterThan( 0 );
			expect( backAlignment ).toBeGreaterThan( 0 );
			expect( faceDot ).toBeLessThan( 0 );

		}

	} );

	it( 'places frond widths tangentially and length radially', () => {

		const mesh = generateTreeData( { seed: 1 } ).lods[ 0 ]!;
		const leaves = leafGroup( mesh );

		for ( let start = leaves.start; start < leaves.start + leaves.count; start += 24 ) {

			const innerLeft = mesh.positions.subarray( mesh.indices[ start ]! * 3, mesh.indices[ start ]! * 3 + 3 );
			const innerRight = mesh.positions.subarray( mesh.indices[ start + 1 ]! * 3, mesh.indices[ start + 1 ]! * 3 + 3 );
			const middleRight = mesh.positions.subarray( mesh.indices[ start + 2 ]! * 3, mesh.indices[ start + 2 ]! * 3 + 3 );
			const middleLeft = mesh.positions.subarray( mesh.indices[ start + 5 ]! * 3, mesh.indices[ start + 5 ]! * 3 + 3 );
			const width = [ innerRight[ 0 ]! - innerLeft[ 0 ]!, innerRight[ 1 ]! - innerLeft[ 1 ]!, innerRight[ 2 ]! - innerLeft[ 2 ]! ];
			const radial = [ ( middleRight[ 0 ]! + middleLeft[ 0 ]! - innerRight[ 0 ]! - innerLeft[ 0 ]! ) * 0.5, ( middleRight[ 1 ]! + middleLeft[ 1 ]! - innerRight[ 1 ]! - innerLeft[ 1 ]! ) * 0.5, ( middleRight[ 2 ]! + middleLeft[ 2 ]! - innerRight[ 2 ]! - innerLeft[ 2 ]! ) * 0.5 ];
			const widthLength = Math.hypot( ...width );
			const radialLength = Math.hypot( radial[ 0 ]!, radial[ 2 ]! );
			const horizontalDot = width[ 0 ]! * radial[ 0 ]! + width[ 2 ]! * radial[ 2 ]!;

			expect( Math.abs( width[ 1 ]! ) / widthLength ).toBeLessThan( 0.21 );
			expect( Math.abs( horizontalDot ) / ( Math.hypot( width[ 0 ]!, width[ 2 ]! ) * radialLength ) ).toBeLessThan( 0.05 );

		}

	} );

	it( 'uses smooth radial trunk normals in LOD0 through LOD3', () => {

		const data = generateTreeData( { seed: 1 } );

		expect( data.parts[ 0 ]!.flatShading ).toBe( false );

		for ( let lod = 0; lod < 4; lod ++ ) {

			const mesh = data.lods[ lod ]!;
			const bark = mesh.groups.find( ( group ) => group.partIndex === 0 )!;
			const first = mesh.indices[ bark.start ]!;
			const second = mesh.indices[ bark.start + 1 ]!;
			const firstOffset = first * 3;
			const secondOffset = second * 3;
			const firstLength = Math.hypot( mesh.normals[ firstOffset ]!, mesh.normals[ firstOffset + 1 ]!, mesh.normals[ firstOffset + 2 ]! );
			const secondLength = Math.hypot( mesh.normals[ secondOffset ]!, mesh.normals[ secondOffset + 1 ]!, mesh.normals[ secondOffset + 2 ]! );
			const normalDot = mesh.normals[ firstOffset ]! * mesh.normals[ secondOffset ]! + mesh.normals[ firstOffset + 1 ]! * mesh.normals[ secondOffset + 1 ]! + mesh.normals[ firstOffset + 2 ]! * mesh.normals[ secondOffset + 2 ]!;

			expect( firstLength ).toBeCloseTo( 1, 2 );
			expect( secondLength ).toBeCloseTo( 1, 2 );
			expect( normalDot ).toBeLessThan( 0.9 );

		}

	} );

	it( 'uses a trunk UV range suitable for repeating the bark grain', () => {

		const mesh = generateTreeData( { seed: 1 } ).lods[ 0 ]!;
		const bark = mesh.groups.find( ( group ) => group.partIndex === 0 )!;
		let minU = Infinity;
		let maxU = - Infinity;
		let minV = Infinity;
		let maxV = - Infinity;

		for ( let i = bark.start; i < bark.start + bark.count; i ++ ) {

			const vertex = mesh.indices[ i ]!;
			minU = Math.min( minU, mesh.uvs[ vertex * 2 ]! );
			maxU = Math.max( maxU, mesh.uvs[ vertex * 2 ]! );
			minV = Math.min( minV, mesh.uvs[ vertex * 2 + 1 ]! );
			maxV = Math.max( maxV, mesh.uvs[ vertex * 2 + 1 ]! );

		}

		expect( minU ).toBe( 0 );
		expect( maxU ).toBeGreaterThanOrEqual( 0.8 );
		expect( minV ).toBe( 0 );
		expect( maxV ).toBeGreaterThanOrEqual( 2 );

	} );

	it( 'keeps the trunk base near 0.35 m and assigns one whorl per branchCount', () => {

		const fiveTiers = generateTreeData( { seed: 1, branchCount: 5 } );
		const eightTiers = generateTreeData( { seed: 1, branchCount: 8 } );
		const trunk = eightTiers.lods[ 0 ]!;
		const bark = trunk.groups.find( ( group ) => group.partIndex === 0 )!;
		let baseRadius = 0;

		for ( let i = bark.start; i < bark.start + bark.count; i ++ ) {

			const offset = trunk.indices[ i ]! * 3;

			if ( trunk.positions[ offset + 1 ]! < 1e-5 ) {
				baseRadius = Math.max( baseRadius, Math.hypot( trunk.positions[ offset ]!, trunk.positions[ offset + 2 ]! ) );
			}

		}

		expect( baseRadius ).toBeCloseTo( 0.35, 2 );
		expect( triangleCount( fiveTiers.lods[ 0 ]! ) ).toBe( 168 + 5 * 6 * 8 );
		expect( triangleCount( eightTiers.lods[ 0 ]! ) ).toBe( 168 + 8 * 6 * 8 );

	} );

	it( 'matches the crossed-card conical LOD3 silhouette to LOD0 in both impostor views', () => {

		for ( const seed of [ 1, 2, 3 ] ) {

			const data = generateTreeData( { seed } );
			const reference = bakeImpostor( data, defaultColors( data ), 128 );
			const lod3Data = { ...data, lods: [ data.lods[ 3 ]!, ...data.lods.slice( 1 ) ] };
			const candidate = bakeImpostor( lod3Data, defaultColors( data ), 128 );

			for ( let view = 0; view < 2; view ++ ) {

				let intersection = 0;
				let union = 0;

				for ( let y = 0; y < 128; y ++ ) {

					for ( let x = 0; x < 128; x ++ ) {

						const offset = ( y * reference.width + view * 128 + x ) * 4 + 3;
						const referenceOpaque = reference.data[ offset ]! >= 128;
						const candidateOpaque = candidate.data[ offset ]! >= 128;

						if ( referenceOpaque && candidateOpaque ) intersection ++;
						if ( referenceOpaque || candidateOpaque ) union ++;

					}

				}

				expect( intersection / union ).toBeGreaterThanOrEqual( 0.75 );

			}

		}
	} );

	it( 'keeps the trunk collider inside 1.5 times the base radius and reaches 85 percent height', () => {

		const data = generateTreeData( { seed: 1 } );
		const collider = data.collider!;
		const bark = data.lods[ 0 ]!.groups.find( ( group ) => group.partIndex === 0 )!;
		let baseRadius = 0;
		let colliderMaximumY = - Infinity;

		for ( let i = bark.start; i < bark.start + bark.count; i ++ ) {

			const index = data.lods[ 0 ]!.indices[ i ]! * 3;
			const x = data.lods[ 0 ]!.positions[ index ]!;
			const y = data.lods[ 0 ]!.positions[ index + 1 ]!;
			const z = data.lods[ 0 ]!.positions[ index + 2 ]!;

			if ( y < data.bounds.height * 0.01 ) baseRadius = Math.max( baseRadius, Math.hypot( x, z ) );

		}

		for ( let i = 0; i < collider.positions.length; i += 3 ) {

			const x = collider.positions[ i ]!;
			const y = collider.positions[ i + 1 ]!;
			const z = collider.positions[ i + 2 ]!;

			colliderMaximumY = Math.max( colliderMaximumY, y );
			expect( Math.hypot( x, z ) ).toBeLessThanOrEqual( baseRadius * 1.5 );

		}

		expect( triangleCount( { indices: collider.indices } ) ).toBeLessThanOrEqual( 48 );
		expect( colliderMaximumY ).toBeGreaterThanOrEqual( data.bounds.height * 0.84 );
		expect( colliderMaximumY ).toBeLessThanOrEqual( data.bounds.height * 0.86 );

	} );

	it( 'clamps crownSize, honors custom height, and keeps the requested number of whorls', () => {

		const small = generateTreeData( { seed: 1, height: 5, crownSize: 0.5, branchCount: 5 } );
		const wide = generateTreeData( { seed: 1, height: 5, crownSize: 1.5, branchCount: 8 } );
		const clampedLow = generateTreeData( { seed: 1, crownSize: 0.1 } );
		const minSize = generateTreeData( { seed: 1, crownSize: 0.5 } );
		const clampedHigh = generateTreeData( { seed: 1, crownSize: 2 } );
		const maxSize = generateTreeData( { seed: 1, crownSize: 1.5 } );

		expect( small.bounds.height ).toBe( 5 );
		expect( wide.bounds.height ).toBe( 5 );
		expect( wide.bounds.radius ).toBeGreaterThan( small.bounds.radius );
		expect( clampedLow.lods[ 0 ]!.positions ).toEqual( minSize.lods[ 0 ]!.positions );
		expect( clampedHigh.lods[ 0 ]!.positions ).toEqual( maxSize.lods[ 0 ]!.positions );

	} );

	it( 'rejects invalid tree dimensions and tier counts', () => {

		expect( () => generateTreeData( { height: 0 } ) ).toThrow( RangeError );
		expect( () => generateTreeData( { crownSize: Infinity } ) ).toThrow( RangeError );
		expect( () => generateTreeData( { branchCount: 0 } ) ).toThrow( RangeError );

	} );

	it( 'generates and bakes within the 50 ms budget after warm-up', () => {

		const generateAndBake = (): void => {

			const data = generateTreeData( { seed: 1 } );
			bakeImpostor( data, defaultColors( data ), 128 );

		};

		generateAndBake();

		const timings: number[] = [];

		for ( let run = 0; run < 10; run ++ ) {

			const start = performance.now();
			generateAndBake();
			timings.push( performance.now() - start );

		}

		const sorted = [ ...timings ].sort( ( a, b ) => a - b );
		const median = ( sorted[ 4 ]! + sorted[ 5 ]! ) / 2;
		const maximum = sorted[ sorted.length - 1 ]!;

		console.log( `Tree generate+bake warm runs: median ${ median.toFixed( 2 ) } ms, max ${ maximum.toFixed( 2 ) } ms` );
		expect( median ).toBeLessThan( 50 );
		expect( maximum ).toBeLessThan( 50 );

	} );

} );
