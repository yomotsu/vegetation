import { describe, expect, it } from 'vitest';
import { bakeImpostor, buildBillboard, hexToLinear, impostorPart } from '../../src/core';
import { generateTreeData } from '../../src/core';
import type { MeshData } from '../../src/core';
import { validateMeshData } from '../helpers/validateMeshData';

function triangleCount( mesh: { indices: Uint32Array } ): number {

	return mesh.indices.length / 3;

}

function vertexCount( mesh: { positions: Float32Array } ): number {

	return mesh.positions.length / 3;

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

function frondPoint( mesh: MeshData, group: ReturnType<typeof leafGroup>, frondIndex: number, row: number, column: number, indicesPerFrond = 24 ): [ number, number, number ] {

	const firstIndex = group.start + frondIndex * indicesPerFrond;
	const firstVertex = mesh.indices[ firstIndex ]!;
	const offset = ( firstVertex + row * 3 + column ) * 3;

	return [ mesh.positions[ offset ]!, mesh.positions[ offset + 1 ]!, mesh.positions[ offset + 2 ]! ];

}

function frondCount( mesh: MeshData, trianglesPerFrond: number ): number {

	return leafGroup( mesh ).count / ( trianglesPerFrond * 3 );

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
			defaultColor: 0x00ff00,
			texture: 'leaf',
			alphaTest: 0.5,
			doubleSided: true,
			flatShading: false,
			roughness: 0.95,
		} );
		expect( data.parts[ 2 ] ).toEqual( impostorPart() );
		expect( Object.keys( data.textures ).sort() ).toEqual( [ 'bark', 'leaf' ] );

		for ( const lod of data.lods ) validateMeshData( lod );

		expect( counts[ 0 ] ).toBeGreaterThanOrEqual( 600 );
		expect( counts[ 0 ] ).toBeLessThanOrEqual( 1000 );
		expect( counts[ 0 ] ).toBe( 84 + 76 * 8 );
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

	it( 'keeps LOD vertex counts below the reference and removes hidden trunk rings', () => {

		for ( const seed of [ 1, 2, 3, 4, 5 ] ) {

			const lods = generateTreeData( { seed } ).lods;
			const counts = lods.map( vertexCount );

			expect( counts[ 0 ] ).toBeLessThanOrEqual( 740 );
			expect( counts[ 1 ] ).toBeLessThanOrEqual( 410 );
			expect( counts[ 2 ] ).toBeLessThanOrEqual( 210 );
			expect( counts[ 0 ] ).toBeLessThanOrEqual( 795 );
			expect( counts[ 1 ] ).toBeLessThanOrEqual( 513 );
			expect( counts[ 2 ] ).toBeLessThanOrEqual( 331 );
			expect( counts[ 3 ] ).toBeLessThan( counts[ 2 ]! );
			expect( counts[ 4 ] ).toBeLessThan( counts[ 2 ]! );

		}

	} );

	it( 'keeps a soft green ramp along fronds and a subtle midrib lift', () => {

		const mesh = generateTreeData( { seed: 1 } ).lods[ 0 ]!;
		const leaves = leafGroup( mesh );
		const firstVertex = mesh.indices[ leaves.start ]!;
		const edgeOffset = firstVertex * 3;
		const midribOffset = ( firstVertex + 4 ) * 3;

		expect( mesh.colors[ edgeOffset ] ).toBeCloseTo( 0.35, 5 );
		expect( mesh.colors[ edgeOffset + 1 ] ).toBeGreaterThan( 1.2 );
		expect( mesh.colors[ edgeOffset + 1 ] ).toBeLessThan( 1.23 );
		expect( mesh.colors[ edgeOffset + 2 ] ).toBeCloseTo( 0.2, 5 );
		expect( mesh.colors[ midribOffset ] ).toBeCloseTo( 0.35, 5 );
		expect( mesh.colors[ midribOffset + 1 ] ).toBeGreaterThan( 1.2 );
		expect( mesh.colors[ midribOffset + 1 ] ).toBeLessThan( 1.24 );
		expect( mesh.colors[ midribOffset + 2 ] ).toBeCloseTo( 0.2, 5 );
		expect( mesh.colors[ ( firstVertex + 6 ) * 3 + 1 ] ).toBeGreaterThan( 1.12 );
		expect( mesh.colors[ ( firstVertex + 6 ) * 3 + 1 ] ).toBeLessThan( 1.15 );

	} );

	it( 'lifts lower-tier greens to soften the dark-to-bright tier change', () => {

		const mesh = generateTreeData( { seed: 1 } ).lods[ 0 ]!;
		const leaves = leafGroup( mesh );
		const lastFrondIndex = frondCount( mesh, 8 ) - 1;
		const lowerVertex = mesh.indices[ leaves.start ]!;
		const upperVertex = mesh.indices[ leaves.start + lastFrondIndex * 24 ]!;
		const lowerGreen = mesh.colors[ lowerVertex * 3 + 1 ]!;
		const upperGreen = mesh.colors[ upperVertex * 3 + 1 ]!;

		expect( lowerGreen - upperGreen ).toBeGreaterThan( 0.1 );
		expect( lowerGreen - upperGreen ).toBeLessThan( 0.19 );

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

	it( 'builds folded 3 by 3 frond grids with upward vertex normals and two-sided rendering', () => {

		const mesh = generateTreeData( { seed: 1 } ).lods[ 0 ]!;
		const leaves = leafGroup( mesh );
		const referencedVertices = new Set<number>();

		expect( frondCount( mesh, 8 ) ).toBe( 76 );

		for ( let index = leaves.start; index < leaves.start + leaves.count; index ++ ) {

			referencedVertices.add( mesh.indices[ index ]! );

		}

		expect( referencedVertices.size ).toBe( 76 * 9 );

		for ( let frond = 0; frond < frondCount( mesh, 8 ); frond ++ ) {

			for ( let row = 0; row < 3; row ++ ) {

				for ( let column = 0; column < 3; column ++ ) {

					const firstVertex = mesh.indices[ leaves.start + frond * 24 ]!;
					const vertex = firstVertex + row * 3 + column;
					const offset = vertex * 3;
					const uvOffset = vertex * 2;

					expect( mesh.normals[ offset ] ).toBeCloseTo( 0 );
					expect( mesh.normals[ offset + 1 ] ).toBeCloseTo( 1 );
					expect( mesh.normals[ offset + 2 ] ).toBeCloseTo( 0 );
					expect( mesh.uvs[ uvOffset ]! * 3 ).toBeCloseTo( column * 0.5, 2 );
					expect( mesh.uvs[ uvOffset + 1 ] ).toBeCloseTo( [ 1, 0.6, 0 ][ row ]! );

				}

			}

			const left = frondPoint( mesh, leaves, frond, 1, 0 );
			const midrib = frondPoint( mesh, leaves, frond, 1, 1 );
			const right = frondPoint( mesh, leaves, frond, 1, 2 );
			const width = Math.hypot( right[ 0 ] - left[ 0 ], right[ 2 ] - left[ 2 ] );
			const fold = ( left[ 1 ] + right[ 1 ] ) * 0.5 - midrib[ 1 ];

			expect( fold / width ).toBeGreaterThanOrEqual( 0.2 );
			expect( fold / width ).toBeLessThanOrEqual( 0.34 );

		}

	} );

	it( 'bends each frond tip upward by about 25 degrees and keeps the width tangential', () => {

		const mesh = generateTreeData( { seed: 1 } ).lods[ 0 ]!;
		const leaves = leafGroup( mesh );

		let steepestPitch = - Infinity;

		for ( let frond = 0; frond < frondCount( mesh, 8 ); frond ++ ) {

			const base = frondPoint( mesh, leaves, frond, 0, 1 );
			const mid = frondPoint( mesh, leaves, frond, 1, 1 );
			const tip = frondPoint( mesh, leaves, frond, 2, 1 );
			const firstPitch = Math.atan2( mid[ 1 ] - base[ 1 ], Math.hypot( mid[ 0 ] - base[ 0 ], mid[ 2 ] - base[ 2 ] ) ) * 180 / Math.PI;
			const secondPitch = Math.atan2( tip[ 1 ] - mid[ 1 ], Math.hypot( tip[ 0 ] - mid[ 0 ], tip[ 2 ] - mid[ 2 ] ) ) * 180 / Math.PI;
			const left = frondPoint( mesh, leaves, frond, 1, 0 );
			const right = frondPoint( mesh, leaves, frond, 1, 2 );
			const width: [ number, number ] = [ right[ 0 ] - left[ 0 ], right[ 2 ] - left[ 2 ] ];
			const radial: [ number, number ] = [ tip[ 0 ] - base[ 0 ], tip[ 2 ] - base[ 2 ] ];
			const dot = width[ 0 ] * radial[ 0 ] + width[ 1 ] * radial[ 1 ];

			steepestPitch = Math.max( steepestPitch, secondPitch );
			expect( secondPitch - firstPitch ).toBeGreaterThanOrEqual( 18 );
			expect( secondPitch - firstPitch ).toBeLessThanOrEqual( 32 );
			expect( Math.abs( dot ) / ( Math.hypot( ...width ) * Math.hypot( ...radial ) ) ).toBeLessThan( 0.05 );

		}

		expect( steepestPitch ).toBeGreaterThan( 75 );
		expect( frondPoint( mesh, leaves, frondCount( mesh, 8 ) - 1, 0, 1 )[ 1 ] ).toBeCloseTo( 7.1, 1 );

	} );

	it( 'distributes fifteen regular frond bands below the near-vertical apex leader', () => {

		const mesh = generateTreeData( { seed: 1 } ).lods[ 0 ]!;
		const leaves = leafGroup( mesh );
		const bandHeights = Array.from( { length: 15 }, ( _, index ) => frondPoint( mesh, leaves, index * 5, 0, 1 )[ 1 ] );

		expect( bandHeights[ 0 ] ).toBeGreaterThanOrEqual( 1.85 );
		expect( bandHeights[ 0 ] ).toBeLessThanOrEqual( 1.95 );
		expect( bandHeights[ 14 ] ).toBeGreaterThanOrEqual( 5.95 );
		expect( bandHeights[ 14 ] ).toBeLessThanOrEqual( 6.05 );
		expect( frondPoint( mesh, leaves, 75, 0, 1 )[ 1 ] ).toBeCloseTo( 7.1, 1 );

		for ( let index = 1; index < bandHeights.length; index ++ ) {

			expect( bandHeights[ index ] ).toBeGreaterThan( bandHeights[ index - 1 ]! );

		}

	} );

	it( 'reduces frond counts and grid density across LOD0, LOD1, and LOD2', () => {

		const data = generateTreeData( { seed: 1 } );

		expect( frondCount( data.lods[ 0 ]!, 8 ) ).toBe( 76 );
		expect( frondCount( data.lods[ 1 ]!, 4 ) ).toBe( 61 );
		expect( frondCount( data.lods[ 2 ]!, 4 ) ).toBe( 31 );
		expect( triangleCount( data.lods[ 0 ]! ) ).toBe( 692 );
		expect( triangleCount( data.lods[ 1 ]! ) ).toBe( 314 );
		expect( triangleCount( data.lods[ 2 ]! ) ).toBe( 156 );

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
		expect( triangleCount( fiveTiers.lods[ 0 ]! ) ).toBe( 84 + 26 * 8 );
		expect( triangleCount( eightTiers.lods[ 0 ]! ) ).toBe( 84 + 41 * 8 );

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
