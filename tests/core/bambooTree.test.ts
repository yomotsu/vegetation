import { describe, expect, it } from 'vitest';
import { generateBambooTreeData, getBambooLeafDirection, getBambooLeafForwardWeight } from '../../src/core/trees/bamboo';
import { areStructurallyByteIdentical } from '../helpers/byteIdentical';
import { validateMeshData } from '../helpers/validateMeshData';

function getCulmRings( positions: Float32Array ): { y: number; radius: number; centerX: number; centerZ: number }[] {

	const rings: { y: number; radius: number; centerX: number; centerZ: number }[] = [];
	for ( let start = 0; start + 7 <= positions.length / 3; start += 7 ) {
		const y = positions[ start * 3 + 1 ]!;
		const ring = Array.from( { length: 7 }, ( _, index ) => start + index );
		if ( ring.some( ( vertex ) => Math.abs( positions[ vertex * 3 + 1 ]! - y ) > 1e-5 ) ) break;
		const centerX = ring.reduce( ( total, vertex ) => total + positions[ vertex * 3 ]!, 0 ) / ring.length;
		const centerZ = ring.reduce( ( total, vertex ) => total + positions[ vertex * 3 + 2 ]!, 0 ) / ring.length;
		const radius = Math.max( ...ring.map( ( vertex ) => Math.hypot( positions[ vertex * 3 ]! - centerX, positions[ vertex * 3 + 2 ]! - centerZ ) ) );
		rings.push( { y, radius, centerX, centerZ } );
	}
	return rings;

}

interface BambooLimbPath {
	base: [ number, number, number ];
	middle: [ number, number, number ];
	tip: [ number, number, number ];
}

function getBambooBranchSummary( data: ReturnType<typeof generateBambooTreeData> ): { tierTurns: number[]; branchCurvatures: number[]; limbs: BambooLimbPath[] } {

	const mesh = data.lods[ 0 ]!;
	const culmRings = getCulmRings( mesh.positions );
	const barkGroup = mesh.groups.find( ( item ) => item.partIndex === 0 )!;
	const barkEnd = Math.max( ...Array.from( mesh.indices.subarray( barkGroup.start, barkGroup.start + barkGroup.count ) ) );
	let vertex = culmRings.length * 7 + 1;
	const primaryByTier = new Map<number, number[]>();
	const branchCurvatures: number[] = [];
	const limbs: BambooLimbPath[] = [];
	while ( vertex + 8 <= barkEnd ) {
		const baseCenter: [ number, number, number ] = [ 0, 0, 0 ];
		const middleCenter: [ number, number, number ] = [ 0, 0, 0 ];
		for ( let side = 0; side < 3; side ++ ) {
			for ( let axis = 0; axis < 3; axis ++ ) {
				baseCenter[ axis ] = baseCenter[ axis ]! + mesh.positions[ ( vertex + side ) * 3 + axis ]! / 3;
				middleCenter[ axis ] = middleCenter[ axis ]! + mesh.positions[ ( vertex + 4 + side ) * 3 + axis ]! / 3;
			}
		}
		const tipOffset = ( vertex + 8 ) * 3;
		const tip: [ number, number, number ] = [ mesh.positions[ tipOffset ]!, mesh.positions[ tipOffset + 1 ]!, mesh.positions[ tipOffset + 2 ]! ];
		const limb = { base: baseCenter, middle: middleCenter, tip };
		limbs.push( limb );
		const length = Math.hypot( tip[ 0 ] - baseCenter[ 0 ], tip[ 2 ] - baseCenter[ 2 ] );
		const nearestRing = culmRings.reduce( ( closest, ring ) => Math.abs( ring.y - baseCenter[ 1 ] ) < Math.abs( closest.y - baseCenter[ 1 ] ) ? ring : closest, culmRings[ 0 ]! );
		const distanceToCulm = Math.hypot( baseCenter[ 0 ] - nearestRing.centerX, baseCenter[ 2 ] - nearestRing.centerZ );
		if ( length > 0.21 && distanceToCulm < nearestRing.radius * 1.5 ) {
			const deltaX = tip[ 0 ] - baseCenter[ 0 ];
			const deltaZ = tip[ 2 ] - baseCenter[ 2 ];
			const middleX = middleCenter[ 0 ] - baseCenter[ 0 ];
			const middleZ = middleCenter[ 2 ] - baseCenter[ 2 ];
			branchCurvatures.push( ( deltaX * middleZ - deltaZ * middleX ) / ( length * length ) );
			const existingTier = [ ...primaryByTier.keys() ].find( ( key ) => Math.abs( key / 1000 - baseCenter[ 1 ] ) < 0.04 );
			const baseY = existingTier ?? Math.round( baseCenter[ 1 ] * 1000 );
			const azimuth = Math.atan2( baseCenter[ 2 ] - nearestRing.centerZ, baseCenter[ 0 ] - nearestRing.centerX );
			const tier = primaryByTier.get( baseY ) ?? [];
			tier.push( azimuth );
			primaryByTier.set( baseY, tier );
		}
		vertex += 9;
	}
	const tierAngles = [ ...primaryByTier.entries() ]
		.sort( ( a, b ) => a[ 0 ] - b[ 0 ] )
		.map( ( [ , angles ] ) => {
			if ( angles.length === 2 ) {
				const delta = Math.atan2( Math.sin( angles[ 1 ]! - angles[ 0 ]! ), Math.cos( angles[ 1 ]! - angles[ 0 ]! ) );
				return angles[ 0 ]! + delta * 0.5;
			}
			return angles[ 0 ]!;
		} );
	const tierTurns = tierAngles.slice( 1 ).map( ( angle, index ) => Math.atan2( Math.sin( angle - tierAngles[ index ]! ), Math.cos( angle - tierAngles[ index ]! ) ) );
	return { tierTurns, branchCurvatures, limbs };

}

function getLeafCardCount( data: ReturnType<typeof generateBambooTreeData> ): number {

	const group = data.lods[ 0 ]!.groups.find( ( item ) => item.partIndex === 1 )!;
	return group.count / 6;

}

function getLeafCardHeights( data: ReturnType<typeof generateBambooTreeData> ): number[] {

	const mesh = data.lods[ 0 ]!;
	const group = mesh.groups.find( ( item ) => item.partIndex === 1 )!;
	const heights: number[] = [];
	for ( let index = group.start; index < group.start + group.count; index += 6 ) {
		const vertices = [ mesh.indices[ index ]!, mesh.indices[ index + 1 ]!, mesh.indices[ index + 2 ]!, mesh.indices[ index + 5 ]! ];
		const centerY = vertices.reduce( ( total, vertex ) => total + mesh.positions[ vertex * 3 + 1 ]!, 0 ) / vertices.length;
		heights.push( centerY / data.bounds.height );
	}
	return heights;

}

function getLeafCardPoses( data: ReturnType<typeof generateBambooTreeData> ): { center: [ number, number, number ]; yaw: number }[] {

	const mesh = data.lods[ 0 ]!;
	const group = mesh.groups.find( ( item ) => item.partIndex === 1 )!;
	const poses: { center: [ number, number, number ]; yaw: number }[] = [];
	for ( let index = group.start; index < group.start + group.count; index += 6 ) {
		const first = mesh.indices[ index ]! * 3;
		const second = mesh.indices[ index + 1 ]! * 3;
		const vertices = [ first, second, mesh.indices[ index + 2 ]! * 3, mesh.indices[ index + 5 ]! * 3 ];
		const center: [ number, number, number ] = [ 0, 0, 0 ];
		for ( const vertex of vertices ) {
			center[ 0 ] += mesh.positions[ vertex ]! / vertices.length;
			center[ 1 ] += mesh.positions[ vertex + 1 ]! / vertices.length;
			center[ 2 ] += mesh.positions[ vertex + 2 ]! / vertices.length;
		}
		poses.push( {
			center,
			yaw: Math.atan2( mesh.positions[ second + 2 ]! - mesh.positions[ first + 2 ]!, mesh.positions[ second ]! - mesh.positions[ first ]! ),
		} );
	}
	return poses;

}

function getLeafCardRoots( data: ReturnType<typeof generateBambooTreeData> ): [ number, number, number ][] {

	const mesh = data.lods[ 0 ]!;
	const leafGroup = mesh.groups.find( ( item ) => item.partIndex === 1 )!;
	const rootU = 24 / 256;
	const rootV = 160 / 256;
	const roots: [ number, number, number ][] = [];
	for ( let index = leafGroup.start; index < leafGroup.start + leafGroup.count; index += 6 ) {
		const first = mesh.indices[ index ]! * 3;
		const second = mesh.indices[ index + 1 ]! * 3;
		const fourth = mesh.indices[ index + 5 ]! * 3;
		const root = [ 0, 0, 0 ];
		for ( let axis = 0; axis < 3; axis ++ ) {
			const corner = axis === 0 ? first : first + axis;
			root[ axis ] = mesh.positions[ corner ]! + rootU * ( mesh.positions[ second + axis ]! - mesh.positions[ corner ]! ) + rootV * ( mesh.positions[ fourth + axis ]! - mesh.positions[ corner ]! );
		}
		roots.push( [ root[ 0 ]!, root[ 1 ]!, root[ 2 ]! ] );
	}
	return roots;

}

function getLeafCardRootDistancesToParentBranches( data: ReturnType<typeof generateBambooTreeData> ): number[] {

	const roots = getLeafCardRoots( data );
	const parentBranches = getBambooBranchSummary( data ).limbs;
	const pointSegmentDistance = ( point: [ number, number, number ], start: [ number, number, number ], end: [ number, number, number ] ): number => {
		const delta: [ number, number, number ] = [ end[ 0 ] - start[ 0 ], end[ 1 ] - start[ 1 ], end[ 2 ] - start[ 2 ] ];
		const denominator = delta[ 0 ] ** 2 + delta[ 1 ] ** 2 + delta[ 2 ] ** 2;
		const projection = denominator > 0 ? Math.max( 0, Math.min( 1, ( ( point[ 0 ] - start[ 0 ] ) * delta[ 0 ] + ( point[ 1 ] - start[ 1 ] ) * delta[ 1 ] + ( point[ 2 ] - start[ 2 ] ) * delta[ 2 ] ) / denominator ) ) : 0;
		return Math.hypot( point[ 0 ] - start[ 0 ] - delta[ 0 ] * projection, point[ 1 ] - start[ 1 ] - delta[ 1 ] * projection, point[ 2 ] - start[ 2 ] - delta[ 2 ] * projection );
	};

	return roots.map( ( root ) => Math.min( ...parentBranches.map( ( branch ) => Math.min(
		pointSegmentDistance( root, branch.base, branch.middle ),
		pointSegmentDistance( root, branch.middle, branch.tip ),
	) ) ) );

}

function getAverageLeafCardWidth( data: ReturnType<typeof generateBambooTreeData> ): number {

	const mesh = data.lods[ 0 ]!;
	const group = mesh.groups.find( ( item ) => item.partIndex === 1 )!;
	let total = 0;
	let count = 0;
	for ( let index = group.start; index < group.start + group.count; index += 6 ) {
		const first = mesh.indices[ index ]! * 3;
		const second = mesh.indices[ index + 1 ]! * 3;
		total += Math.hypot(
			mesh.positions[ first ]! - mesh.positions[ second ]!,
			mesh.positions[ first + 1 ]! - mesh.positions[ second + 1 ]!,
			mesh.positions[ first + 2 ]! - mesh.positions[ second + 2 ]!,
		);
		count ++;
	}
	return total / count;

}

function getLeafCardNormalYComponents( data: ReturnType<typeof generateBambooTreeData> ): number[] {

	const mesh = data.lods[ 0 ]!;
	const group = mesh.groups.find( ( item ) => item.partIndex === 1 )!;
	const normalYComponents: number[] = [];
	for ( let index = group.start; index < group.start + group.count; index += 6 ) {
		const first = mesh.indices[ index ]! * 3;
		const second = mesh.indices[ index + 1 ]! * 3;
		const fourth = mesh.indices[ index + 5 ]! * 3;
		const ax = mesh.positions[ second ]! - mesh.positions[ first ]!;
		const ay = mesh.positions[ second + 1 ]! - mesh.positions[ first + 1 ]!;
		const az = mesh.positions[ second + 2 ]! - mesh.positions[ first + 2 ]!;
		const bx = mesh.positions[ fourth ]! - mesh.positions[ first ]!;
		const by = mesh.positions[ fourth + 1 ]! - mesh.positions[ first + 1 ]!;
		const bz = mesh.positions[ fourth + 2 ]! - mesh.positions[ first + 2 ]!;
		const normal: [ number, number, number ] = [ ay * bz - az * by, az * bx - ax * bz, ax * by - ay * bx ];
		const length = Math.hypot( ...normal );
		expect( length ).toBeGreaterThan( 0.25 );
		normalYComponents.push( normal[ 1 ] / length );
	}
	return normalYComponents;

}

function getCulmRingColorStats( data: ReturnType<typeof generateBambooTreeData> ): { y: number; mean: number; greenRedRatio: number }[] {

	const mesh = data.lods[ 0 ]!;
	const rings: { y: number; mean: number; greenRedRatio: number }[] = [];
	for ( let start = 0; start + 7 <= mesh.positions.length / 3; start += 7 ) {
		const y = mesh.positions[ start * 3 + 1 ]!;
		const ring = Array.from( { length: 7 }, ( _, index ) => start + index );
		if ( ring.some( ( vertex ) => Math.abs( mesh.positions[ vertex * 3 + 1 ]! - y ) > 1e-5 ) ) break;
		const red = ring.reduce( ( total, vertex ) => total + mesh.colors[ vertex * 3 ]!, 0 ) / ring.length;
		const green = ring.reduce( ( total, vertex ) => total + mesh.colors[ vertex * 3 + 1 ]!, 0 ) / ring.length;
		const mean = ring.reduce( ( total, vertex ) => total + mesh.colors[ vertex * 3 ]! + mesh.colors[ vertex * 3 + 1 ]! + mesh.colors[ vertex * 3 + 2 ]!, 0 ) / ( ring.length * 3 );
		rings.push( { y, mean, greenRedRatio: green / red } );
	}
	return rings;

}

function getRadiusNearY( rings: { y: number; radius: number }[], y: number ): number {

	const nearby = rings.filter( ( ring ) => Math.abs( ring.y - y ) <= 0.31 );
	return Math.max( ...nearby.map( ( ring ) => ring.radius ) );

}

describe( 'bamboo tree LOD0', () => {

	it( 'generates a deterministic segmented culm with textured leaf sprays and a closed collider', () => {

		const data = generateBambooTreeData( { seed: 8 } );
		const sameSeed = generateBambooTreeData( { seed: 8 } );
		const mesh = data.lods[ 0 ]!;
		validateMeshData( mesh );

		expect( areStructurallyByteIdentical( data, sameSeed ) ).toBe( true );
		expect( data.kind ).toBe( 'bamboo-tree' );
		expect( data.bounds.height ).toBe( 8 );
		expect( data.parts.map( ( part ) => part.name ) ).toEqual( [ 'bark', 'leaf', 'impostor-lod3', 'impostor' ] );
		expect( data.parts[ 1 ] ).toMatchObject( { texture: 'leaf', alphaTest: 0.5, upNormalCards: true } );
		expect( data.textures.leaf?.width ).toBe( 512 );
		expect( data.textures.leaf?.height ).toBe( 512 );
		expect( data.textures.leaf!.data.some( ( value, index ) => index % 4 === 3 && value > 0 ) ).toBe( true );
		expect( mesh.positions.length / 3 ).toBeLessThan( 2600 );
		expect( Math.min( ...mesh.positions.filter( ( _, index ) => index % 3 === 1 ) ) ).toBeLessThan( 0 );
		expect( Math.max( ...mesh.positions.filter( ( _, index ) => index % 3 === 1 ) ) ).toBeCloseTo( 8, 3 );
		expect( data.collider ).not.toBeNull();
		expect( data.collider!.indices.length ).toBe( 144 );
		expect( data.lods ).toHaveLength( 5 );
		expect( data.lods.slice( 1 ).every( ( lod ) => lod !== mesh ) ).toBe( true );

	} );

	it( 'adds foliage tiers with height while preserving culm and leaf dimensions', () => {

		const short = generateBambooTreeData( { seed: 8, height: 5 } );
		const tall = generateBambooTreeData( { seed: 8, height: 8 } );
		const shortRings = getCulmRings( short.lods[ 0 ]!.positions );
		const tallRings = getCulmRings( tall.lods[ 0 ]!.positions );
		const shortBaseRadius = shortRings[ 0 ]!.radius;
		const tallBaseRadius = tallRings[ 0 ]!.radius;

		expect( getLeafCardCount( tall ) ).toBeGreaterThan( getLeafCardCount( short ) );
		expect( Math.abs( tallBaseRadius - shortBaseRadius ) ).toBeLessThan( 0.004 );
		expect( getAverageLeafCardWidth( tall ) ).toBeGreaterThan( 0.94 );
		expect( Math.abs( getAverageLeafCardWidth( tall ) - getAverageLeafCardWidth( short ) ) ).toBeLessThan( 0.06 );
		expect( tall.textures.leaf!.width ).toBe( short.textures.leaf!.width );
		expect( tall.textures.leaf!.height ).toBe( short.textures.leaf!.height );

	} );

	it( 'tapers the culm steadily across the upper half to a fine terminal shoot', () => {

		const data = generateBambooTreeData( { seed: 8 } );
		const rings = getCulmRings( data.lods[ 0 ]!.positions );
		const upperRings = rings.filter( ( ring ) => ring.y >= 4 );
		const opaqueTexels = data.textures.leaf!.data.reduce( ( total, value, index ) => total + ( index % 4 === 3 && value > 0 ? 1 : 0 ), 0 );
		const texture = data.textures.leaf!;
		const radiiAcrossLeader = [ 4, 4.7, 5.4, 6.1, 6.9 ].map( ( y ) => getRadiusNearY( rings, y ) );
		const tipToBaseRatio = rings[ rings.length - 1 ]!.radius / rings[ 0 ]!.radius;
		const leafHeights = getLeafCardHeights( data );
		const countInBand = ( lower: number, upper: number ) => leafHeights.filter( ( value ) => value >= lower && value < upper ).length;
		let edgeAlphaTexels = 0;
		let upperSideBladeTexels = 0;
		for ( let tileY = 0; tileY < 2; tileY ++ ) {
			for ( let tileX = 0; tileX < 2; tileX ++ ) {
				for ( let localY = 0; localY < 256; localY ++ ) {
					for ( let localX = 0; localX < 256; localX ++ ) {
						const x = tileX * 256 + localX;
						const y = tileY * 256 + localY;
						if ( texture.data[ ( y * texture.width + x ) * 4 + 3 ]! > 0 ) {
							if ( localY < 134 ) upperSideBladeTexels ++;
						}
						if ( localX >= 4 && localX < 252 && localY >= 4 && localY < 252 ) continue;
						if ( texture.data[ ( y * texture.width + x ) * 4 + 3 ]! > 0 ) edgeAlphaTexels ++;
					}
				}
			}
		}

		expect( upperRings.length ).toBeGreaterThanOrEqual( 7 );
		for ( let index = 1; index < radiiAcrossLeader.length; index ++ ) {
			expect( radiiAcrossLeader[ index ] ).toBeLessThan( radiiAcrossLeader[ index - 1 ]! );
		}
		expect( tipToBaseRatio ).toBeGreaterThan( 0.01 );
		expect( tipToBaseRatio ).toBeLessThan( 0.035 );
		const lowerFoliage = countInBand( 0.44, 0.6 );
		const firstClump = countInBand( 0.6, 0.7 );
		const gap = countInBand( 0.7, 0.8 );
		const secondClump = countInBand( 0.8, 0.9 );
		const terminalCrown = countInBand( 0.9, 1.01 );
		const foliageBands = [ lowerFoliage, firstClump, gap, secondClump, terminalCrown ];
		expect( firstClump + secondClump ).toBeGreaterThan( 0 );
		expect( foliageBands.some( ( count, index ) => index > 0 && count > foliageBands[ index - 1 ]! ) ).toBe( true );
		expect( foliageBands.some( ( count, index ) => index > 0 && count < foliageBands[ index - 1 ]! ) ).toBe( true );
		expect( terminalCrown ).toBeGreaterThan( 0 );
		expect( terminalCrown ).toBeLessThan( secondClump );
		expect( getLeafCardCount( data ) ).toBeGreaterThan( 100 );
		expect( getLeafCardCount( data ) ).toBeLessThan( 300 );
		const branchPaths = getBambooBranchSummary( data ).limbs;
		expect( branchPaths.length ).toBeGreaterThanOrEqual( 8 );
		const shortBranches = branchPaths.filter( ( branch ) => Math.hypot( branch.tip[ 0 ] - branch.base[ 0 ], branch.tip[ 2 ] - branch.base[ 2 ] ) <= 0.21 );
		expect( shortBranches ).toHaveLength( 1 );
		expect( shortBranches[ 0 ]!.base[ 1 ] ).toBeGreaterThan( data.bounds.height * 0.9 );
		const rootDistances = getLeafCardRootDistancesToParentBranches( data );
		expect( rootDistances.every( ( distance ) => distance < 0.002 ) ).toBe( true );
		const cardPoses = getLeafCardPoses( data );
		let nearbyFanPairs = 0;
		for ( let index = 1; index < cardPoses.length; index ++ ) {
			const previous = cardPoses[ index - 1 ]!;
			const current = cardPoses[ index ]!;
			const horizontalDistance = Math.hypot( current.center[ 0 ] - previous.center[ 0 ], current.center[ 2 ] - previous.center[ 2 ] );
			const yawDifference = Math.abs( Math.atan2( Math.sin( current.yaw - previous.yaw ), Math.cos( current.yaw - previous.yaw ) ) );
			if ( horizontalDistance < 0.8 && Math.abs( current.center[ 1 ] - previous.center[ 1 ] ) < 0.18 && yawDifference > 0.1 ) nearbyFanPairs ++;
		}
		expect( nearbyFanPairs ).toBeGreaterThan( 5 );
		expect( opaqueTexels ).toBeGreaterThan( 5000 );
		expect( opaqueTexels ).toBeLessThan( 30000 );
		expect( edgeAlphaTexels ).toBe( 0 );
		expect( upperSideBladeTexels ).toBeGreaterThan( opaqueTexels * 0.28 );
		expect( upperSideBladeTexels ).toBeLessThan( opaqueTexels * 0.72 );
		expect( data.parts[ 1 ]!.defaultColor ).toBe( 0x70a94b );
		const barkTexture = data.textures.bark!;
		expect( data.parts[ 0 ]!.texture ).toBe( 'bark' );
		expect( barkTexture.wrapT ).toBe( 'repeat' );
		expect( barkTexture.height ).toBe( 128 );
		const centerPixel = ( 64 * barkTexture.width + 8 ) * 4;
		const edgePixel = ( 61 * barkTexture.width + 8 ) * 4;
		expect( barkTexture.data[ centerPixel ] ).toBe( 255 );
		expect( barkTexture.data[ centerPixel + 1 ] ).toBeLessThan( 255 );
		expect( barkTexture.data[ centerPixel + 2 ] ).toBeLessThan( barkTexture.data[ centerPixel + 1 ]! );
		expect( barkTexture.data[ edgePixel ] ).toBeLessThan( barkTexture.data[ centerPixel ]! );
		expect( barkTexture.data[ edgePixel + 1 ] ).toBeLessThan( barkTexture.data[ centerPixel + 1 ]! );
		const culmColorRings = getCulmRingColorStats( data );
		expect( culmColorRings.length ).toBeGreaterThan( 14 );
		expect( culmColorRings.some( ( ring ) => ring.greenRedRatio > 1 && ring.greenRedRatio < 1.1 ) ).toBe( true );
		const cardNormalAngles = getLeafCardNormalYComponents( data ).map( ( normalY ) => Math.acos( Math.min( 1, Math.abs( normalY ) ) ) * 180 / Math.PI );
		expect( cardNormalAngles.every( ( angle ) => angle > 23 && angle < 40 ) ).toBe( true );
	} );

	it( 'aims later leaves toward the twig tip while preserving left and right sides', () => {

		const proximalWeight = getBambooLeafForwardWeight( 0.1, 0.08, 0.94 );
		const midpointWeight = getBambooLeafForwardWeight( 0.5, 0.08, 0.94 );
		const terminalWeight = getBambooLeafForwardWeight( 0.9, 0.08, 0.94 );
		expect( proximalWeight ).toBeGreaterThanOrEqual( 0.37 );
		expect( proximalWeight ).toBeLessThanOrEqual( 0.4 );
		expect( midpointWeight ).toBeGreaterThanOrEqual( 0.95 );
		expect( midpointWeight ).toBeLessThanOrEqual( 1.02 );
		expect( terminalWeight ).toBeGreaterThanOrEqual( 1.55 );
		expect( terminalWeight ).toBeLessThanOrEqual( 1.62 );
		expect( getBambooLeafForwardWeight( 0.1 ) ).toBeCloseTo( getBambooLeafForwardWeight( 0.45, 0.4, 0.9 ), 8 );
		expect( getBambooLeafForwardWeight( 0.9 ) ).toBeCloseTo( getBambooLeafForwardWeight( 0.85, 0.4, 0.9 ), 8 );
		for ( const tangent of [ [ 1, 0 ], [ 1, - 0.48 ], [ 1, 0.48 ], [ 0.36, 1 ] ] as const ) {
			const length = Math.hypot( ...tangent );
			const sideAxis: [ number, number ] = [ - tangent[ 1 ] / length, tangent[ 0 ] / length ];
			const tangentAxis: [ number, number ] = [ tangent[ 0 ] / length, tangent[ 1 ] / length ];
			const proximalPositive = getBambooLeafDirection( tangent[ 0 ], tangent[ 1 ], 1, proximalWeight, 0.02 );
			const terminalPositive = getBambooLeafDirection( tangent[ 0 ], tangent[ 1 ], 1, terminalWeight, 0.02 );
			const proximalNegative = getBambooLeafDirection( tangent[ 0 ], tangent[ 1 ], - 1, proximalWeight, 0.02 );
			const terminalNegative = getBambooLeafDirection( tangent[ 0 ], tangent[ 1 ], - 1, terminalWeight, 0.02 );
			const sideProjection = ( direction: [ number, number ] ) => direction[ 0 ] * sideAxis[ 0 ] + direction[ 1 ] * sideAxis[ 1 ];
			const tangentProjection = ( direction: [ number, number ] ) => direction[ 0 ] * tangentAxis[ 0 ] + direction[ 1 ] * tangentAxis[ 1 ];
			expect( tangentProjection( proximalPositive ) ).toBeGreaterThan( 0.25 );
			expect( tangentProjection( proximalNegative ) ).toBeGreaterThan( 0.25 );
			expect( tangentProjection( terminalPositive ) ).toBeGreaterThan( 0.8 );
			expect( tangentProjection( terminalNegative ) ).toBeGreaterThan( 0.8 );
			expect( sideProjection( proximalPositive ) ).toBeGreaterThan( 0 );
			expect( sideProjection( terminalPositive ) ).toBeGreaterThan( 0 );
			expect( sideProjection( proximalNegative ) ).toBeLessThan( 0 );
			expect( sideProjection( terminalNegative ) ).toBeLessThan( 0 );
			expect( tangentProjection( terminalPositive ) ).toBeGreaterThan( tangentProjection( proximalPositive ) + 0.1 );
			expect( tangentProjection( terminalNegative ) ).toBeGreaterThan( tangentProjection( proximalNegative ) + 0.1 );
		}

	} );

	it( 'uses paired upper-node buds with near-opposite azimuths while varying branch curves', () => {

		for ( const seed of [ 1, 2, 3, 4, 5, 6, 7, 8 ] ) {
			const { branchCurvatures, tierTurns } = getBambooBranchSummary( generateBambooTreeData( { seed } ) );
			expect( branchCurvatures.some( ( curve ) => curve > 0.012 ), `seed ${ seed } has a clockwise curve` ).toBe( true );
			expect( branchCurvatures.some( ( curve ) => curve < - 0.012 ), `seed ${ seed } has a counterclockwise curve` ).toBe( true );
			expect( branchCurvatures.some( ( curve ) => Math.abs( curve ) < 0.01 ), `seed ${ seed } has a nearly straight branch` ).toBe( true );
			expect( tierTurns.length ).toBeGreaterThan( 0 );
			expect( tierTurns.every( ( turn ) => Math.abs( Math.abs( turn ) - Math.PI ) < 0.55 ) ).toBe( true );
		}

	} );

	it( 'rejects a non-positive or non-finite height', () => {
		expect( () => generateBambooTreeData( { height: 0 } ) ).toThrowError( 'Bamboo tree height must be a positive finite number' );
	} );

} );
