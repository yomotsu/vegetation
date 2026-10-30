import { describe, expect, it } from 'vitest';
import { hexToLinear, linearToSrgbByte } from '../../src/core/color';
import { bakeImpostor, buildBillboard, impostorPart, LOD3_IMPOSTOR_YAW_ANGLES, LOD3_IMPOSTOR_VIEWS, LOD4_IMPOSTOR_VIEWS } from '../../src/core/impostor';
import { prepareVegetationAsset } from '../../src/core/vegetationAssetPreparation';
import { generateTreeData } from '../../src/core/generators/tree';
import type { MeshData } from '../../src/core/types';
import { validateMeshData } from '../helpers/validateMeshData';
import { topCardCoverageIou } from '../helpers/topCardCoverage';

const BARK_PART_INDEX = 0;
const LEAF_PART_INDEX = 1;
const LOD3_IMPOSTOR_PART_INDEX = 2;
const IMPOSTOR_PART_INDEX = 3;
const LEAF_RING_PART_INDEX = 4;

function triangleCount( mesh: { indices: Uint32Array } ): number {

	return mesh.indices.length / 3;

}

async function hashArrayBytes( ...arrays: ArrayBufferView[] ): Promise<string> {

	const byteLength = arrays.reduce( ( total, array ) => total + array.byteLength, 0 );
	const bytes = new Uint8Array( byteLength );
	let offset = 0;

	for ( const array of arrays ) {
		bytes.set( new Uint8Array( array.buffer, array.byteOffset, array.byteLength ), offset );
		offset += array.byteLength;
	}

	const digest = await globalThis.crypto.subtle.digest( 'SHA-256', bytes );

	return Array.from( new Uint8Array( digest ), ( byte ) => byte.toString( 16 ).padStart( 2, '0' ) ).join( '' );

}

function vertexCount( mesh: { positions: Float32Array } ): number {

	return mesh.positions.length / 3;

}

function groupVertexIndices( mesh: MeshData, group: { start: number; count: number } ): number[] {

	return [ ...new Set( mesh.indices.slice( group.start, group.start + group.count ) ) ].sort( ( first, second ) => first - second );

}

function meshGroupBytes( mesh: MeshData, partIndex: number ): ArrayBufferView[] {

	const group = mesh.groups.find( ( value ) => value.partIndex === partIndex )!;
	const vertices = [ ...new Set( mesh.indices.slice( group.start, group.start + group.count ) ) ].sort( ( first, second ) => first - second );

	return [
		Float32Array.from( vertices.flatMap( ( vertex ) => Array.from( mesh.positions.slice( vertex * 3, vertex * 3 + 3 ) ) ) ),
		Float32Array.from( vertices.flatMap( ( vertex ) => Array.from( mesh.normals.slice( vertex * 3, vertex * 3 + 3 ) ) ) ),
		Float32Array.from( vertices.flatMap( ( vertex ) => Array.from( mesh.uvs.slice( vertex * 2, vertex * 2 + 2 ) ) ) ),
		Float32Array.from( vertices.flatMap( ( vertex ) => Array.from( mesh.colors.slice( vertex * 3, vertex * 3 + 3 ) ) ) ),
		Float32Array.from( vertices.map( ( vertex ) => mesh.windWeight[ vertex ]! ) ),
		Float32Array.from( vertices.map( ( vertex ) => mesh.impostorCard[ vertex ]! ) ),
		mesh.indices.slice( group.start, group.start + group.count ),
	];

}

function billboardPlane( mesh: MeshData, planeIndex: number, partIndex: number ): MeshData {

	const vertexStart = planeIndex * 4;
	const indexStart = planeIndex * 6;

	return {
		positions: mesh.positions.slice( vertexStart * 3, ( vertexStart + 4 ) * 3 ),
		normals: mesh.normals.slice( vertexStart * 3, ( vertexStart + 4 ) * 3 ),
		uvs: mesh.uvs.slice( vertexStart * 2, ( vertexStart + 4 ) * 2 ),
		colors: mesh.colors.slice( vertexStart * 3, ( vertexStart + 4 ) * 3 ),
		windWeight: mesh.windWeight.slice( vertexStart, vertexStart + 4 ),
		impostorCard: mesh.impostorCard.slice( vertexStart, vertexStart + 4 ),
		indices: Uint32Array.from( mesh.indices.slice( indexStart, indexStart + 6 ), ( index ) => index - vertexStart ),
		groups: [ { start: 0, count: 6, partIndex } ],
	};

}

function minimumY( positions: Float32Array ): number {

	let minimum = Infinity;

	for ( let i = 1; i < positions.length; i += 3 ) {

		minimum = Math.min( minimum, positions[ i ]! );

	}

	return minimum;

}

function minimumYInGroup( mesh: MeshData, group: { start: number; count: number } ): number {

	let minimum = Infinity;

	for ( let i = group.start; i < group.start + group.count; i ++ ) {

		const vertex = mesh.indices[ i ]!;
		minimum = Math.min( minimum, mesh.positions[ vertex * 3 + 1 ]! );

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

function distance3( a: [ number, number, number ], b: [ number, number, number ] ): number {

	return Math.hypot( a[ 0 ] - b[ 0 ], a[ 1 ] - b[ 1 ], a[ 2 ] - b[ 2 ] );

}

function boundaryEdges( mesh: MeshData, group: { start: number; count: number } ): [ number, number ][] {

	const counts = new Map<string, { edge: [ number, number ]; count: number }>();
	const vertexKeys = new Map<number, string>();

	for ( let vertex = 0; vertex < mesh.positions.length / 3; vertex ++ ) {

		const offset = vertex * 3;
		vertexKeys.set( vertex, `${ mesh.positions[ offset ]!.toFixed( 6 ) }:${ mesh.positions[ offset + 1 ]!.toFixed( 6 ) }:${ mesh.positions[ offset + 2 ]!.toFixed( 6 ) }` );

	}

	for ( let index = group.start; index < group.start + group.count; index += 3 ) {

		const triangle = [ mesh.indices[ index ]!, mesh.indices[ index + 1 ]!, mesh.indices[ index + 2 ]! ];

		for ( let edgeIndex = 0; edgeIndex < 3; edgeIndex ++ ) {

			const first = triangle[ edgeIndex ]!;
			const second = triangle[ ( edgeIndex + 1 ) % 3 ]!;
			const firstKey = vertexKeys.get( first )!;
			const secondKey = vertexKeys.get( second )!;
			const edge: [ number, number ] = firstKey < secondKey ? [ first, second ] : [ second, first ];
			const key = firstKey < secondKey ? `${ firstKey }:${ secondKey }` : `${ secondKey }:${ firstKey }`;
			const existing = counts.get( key );

			if ( existing === undefined ) {

				counts.set( key, { edge, count: 1 } );

			}
			else {

				existing.count ++;

			}

		}

	}

	return [ ...counts.values() ].filter( ( value ) => value.count === 1 ).map( ( value ) => value.edge );

}

function defaultColors( data: ReturnType<typeof generateTreeData> ): [ number, number, number ][] {

	return data.parts.map( ( part ) => hexToLinear( part.defaultColor ) );

}

function leafGroup( mesh: MeshData ) {

	return mesh.groups.find( ( group ) => group.partIndex === LEAF_PART_INDEX )!;

}

function leafRingGroup( mesh: MeshData ) {

	return mesh.groups.find( ( group ) => group.partIndex === LEAF_RING_PART_INDEX )!;

}

function lodFrondRoot( mesh: MeshData, lod: number, frondIndex: number ): [ number, number, number ] {

	const leaves = leafGroup( mesh );
	const indicesPerFrond = lod === 0 ? 24 : lod === 1 ? 12 : 6;
	const first = mesh.indices[ leaves.start + frondIndex * indicesPerFrond ]!;
	const rootOffset = ( first + 1 ) * 3;
	const root = lod !== 0
		? [ 0, 1, 2 ].map( ( axis ) => ( mesh.positions[ first * 3 + axis ]! + mesh.positions[ ( first + 1 ) * 3 + axis ]! ) * 0.5 )
		: [ mesh.positions[ rootOffset ]!, mesh.positions[ rootOffset + 1 ]!, mesh.positions[ rootOffset + 2 ]! ];

	return root as [ number, number, number ];

}

function lodFrondTip( mesh: MeshData, lod: number, frondIndex: number ): [ number, number, number ] {

	const leaves = leafGroup( mesh );
	const indicesPerFrond = lod === 0 ? 24 : lod === 1 ? 12 : 6;
	const first = mesh.indices[ leaves.start + frondIndex * indicesPerFrond ]!;
	const firstTipVertex = first + ( lod === 0 ? 7 : lod === 1 ? 4 : 2 );

	const offset = firstTipVertex * 3;
	const tip = lod !== 0
		? [ 0, 1, 2 ].map( ( axis ) => ( mesh.positions[ offset + axis ]! + mesh.positions[ offset + 3 + axis ]! ) * 0.5 )
		: [ mesh.positions[ offset ]!, mesh.positions[ offset + 1 ]!, mesh.positions[ offset + 2 ]! ];

	return tip as [ number, number, number ];

}

function bakeLod( data: ReturnType<typeof generateTreeData>, lod: number, topDown = false, solidLeafCoverage = false ) {

	const source = data.lods[ lod ]!;
	const mesh = topDown
		? {
			...source,
			positions: Float32Array.from( source.positions, ( value, index ) => index % 3 === 1 ? source.positions[ index + 2 ]! + data.bounds.radius : index % 3 === 2 ? source.positions[ index - 1 ]! : value ),
			normals: Float32Array.from( source.normals, ( value, index ) => index % 3 === 1 ? source.normals[ index + 2 ]! : index % 3 === 2 ? source.normals[ index - 1 ]! : value ),
		}
		: source;
	const renderData = {
		...data,
		lods: [ mesh ],
		textures: solidLeafCoverage ? {
			...data.textures,
			leaf: {
				...data.textures.leaf!,
				// 葉の穴を除いて、樹冠の面積を比較します。
				data: Uint8Array.from( data.textures.leaf!.data, ( value, index ) => index % 4 === 3 ? 255 : value ),
			},
		} : data.textures,
		bounds: topDown ? { radius: data.bounds.radius, height: data.bounds.radius * 2 } : data.bounds,
	};

	return bakeImpostor( renderData, defaultColors( data ), 128, topDown ? [ 0 ] : [ 0, Math.PI / 4, Math.PI / 2 ] );

}

function coverageIou( first: { width: number; data: Uint8Array }, second: { width: number; data: Uint8Array }, tile: number, tileSize: number, tolerance = 0 ): number {

	let intersection = 0;
	let union = 0;

	for ( let y = 0; y < tileSize; y ++ ) {

		for ( let x = 0; x < tileSize; x ++ ) {

			let firstOpaque = false;
			let secondOpaque = false;

			for ( let dy = - tolerance; dy <= tolerance; dy ++ ) {

				for ( let dx = - tolerance; dx <= tolerance; dx ++ ) {

					const sampleX = x + dx;
					const sampleY = y + dy;

					if ( sampleX < 0 || sampleX >= tileSize || sampleY < 0 || sampleY >= tileSize ) {

						continue;

					}

					const firstOffset = ( sampleY * first.width + tile * tileSize + sampleX ) * 4 + 3;
					const secondOffset = ( sampleY * second.width + tile * tileSize + sampleX ) * 4 + 3;
					if ( first.data[ firstOffset ] === 255 ) {

						firstOpaque = true;

					}
					if ( second.data[ secondOffset ] === 255 ) {

						secondOpaque = true;

					}

				}

			}

			if ( firstOpaque && secondOpaque ) {

				intersection ++;

			}
			if ( firstOpaque || secondOpaque ) {

				union ++;

			}

		}

	}

	return intersection / union;

}

function meanOpaqueColorDifference( first: { width: number; data: Uint8Array }, second: { width: number; data: Uint8Array }, firstTile: number, secondTile: number, tileSize: number ): [ number, number, number ] {

	const firstTotals = [ 0, 0, 0 ];
	const secondTotals = [ 0, 0, 0 ];
	let firstCount = 0;
	let secondCount = 0;

	for ( let y = 0; y < tileSize; y ++ ) {

		for ( let x = 0; x < tileSize; x ++ ) {

			const firstOffset = ( y * first.width + firstTile * tileSize + x ) * 4;
			const secondOffset = ( y * second.width + secondTile * tileSize + x ) * 4;

			if ( first.data[ firstOffset + 3 ] === 255 ) {

				for ( let channel = 0; channel < 3; channel ++ ) firstTotals[ channel ]! += first.data[ firstOffset + channel ]!;
				firstCount ++;

			}

			if ( second.data[ secondOffset + 3 ] === 255 ) {

				for ( let channel = 0; channel < 3; channel ++ ) secondTotals[ channel ]! += second.data[ secondOffset + channel ]!;
				secondCount ++;

			}

		}

	}

	return firstTotals.map( ( total, channel ) => Math.abs( total / firstCount - secondTotals[ channel ]! / secondCount ) ) as [ number, number, number ];

}

function brownStemWidthAtRow( texture: { width: number; height: number; data: Uint8Array }, y: number ): number {

	const center = texture.width / 2;
	let width = 0;

	for ( let x = Math.floor( center ) - 8; x <= Math.ceil( center ) + 8; x ++ ) {

		const offset = ( y * texture.width + x ) * 4;
		const red = texture.data[ offset ]!;
		const green = texture.data[ offset + 1 ]!;
		const blue = texture.data[ offset + 2 ]!;

		if ( texture.data[ offset + 3 ]! >= 128 && red > green + 2 && green > blue * 1.5 ) {

			width ++;

		}

	}

	return width;

}

function sampleFrondLuminance( texture: { width: number; height: number; data: Uint8Array }, v: number, greenTint: number ): number {

	const centerY = Math.round( v * ( texture.height - 1 ) );
	let total = 0;
	let count = 0;

	for ( let y = Math.max( 0, centerY - 1 ); y <= Math.min( texture.height - 1, centerY + 1 ); y ++ ) {

		for ( let x = 0; x < texture.width; x ++ ) {

			const offset = ( y * texture.width + x ) * 4;
			const red = texture.data[ offset ]!;
			const green = texture.data[ offset + 1 ]!;
			const blue = texture.data[ offset + 2 ]!;

			if ( texture.data[ offset + 3 ]! < 128 || green <= red || green <= blue ) {

				continue;

			}

			const normalizedGreen = green / 255;
			const linearGreen = normalizedGreen <= 0.04045
				? normalizedGreen / 12.92
				: ( ( normalizedGreen + 0.055 ) / 1.055 ) ** 2.4;
			const renderedGreen = linearToSrgbByte( linearGreen * greenTint );

			total += 0.2126 * red + 0.7152 * renderedGreen + 0.0722 * blue;
			count ++;

		}

	}

	return total / count;

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

function bakeSideCoverage( data: ReturnType<typeof generateTreeData>, lod: number, yawAngles: number[] ) {

	const leafTexture = data.textures.leaf!;
	const renderData = {
		...data,
		lods: [ data.lods[ lod ]! ],
		textures: {
			...data.textures,
			leaf: {
				...leafTexture,
				data: Uint8Array.from( leafTexture.data, ( value, index ) => index % 4 === 3 ? 255 : value ),
			},
		},
	};

	return bakeImpostor( renderData, defaultColors( data ), 128, yawAngles );

}

function bakeElevatedLod( data: ReturnType<typeof generateTreeData>, lod: number, elevation: number ) {

	const source = data.lods[ lod ]!;
	const cosine = Math.cos( elevation );
	const sine = Math.sin( elevation );
	const viewHeight = data.bounds.height * cosine + data.bounds.radius * 2 * sine;
	const mesh = {
		...source,
		positions: Float32Array.from( source.positions, ( value, index ) => {

			if ( index % 3 === 1 ) {

				return ( value - data.bounds.height * 0.5 ) * cosine - source.positions[ index + 1 ]! * sine + viewHeight * 0.5;

			}
			if ( index % 3 === 2 ) {

				return ( source.positions[ index - 1 ]! - data.bounds.height * 0.5 ) * sine + value * cosine;

			}

			return value;

		} ),
	};
	const renderData = {
		...data,
		lods: [ mesh ],
		bounds: { radius: data.bounds.radius, height: viewHeight },
	};

	return bakeImpostor( renderData, defaultColors( data ), 128, [ 0 ] );

}

function geometricNormalY( mesh: MeshData, index: number ): number {

	const first = mesh.indices[ index ]! * 3;
	const second = mesh.indices[ index + 1 ]! * 3;
	const third = mesh.indices[ index + 2 ]! * 3;
	const firstX = mesh.positions[ first ]!;
	const firstY = mesh.positions[ first + 1 ]!;
	const firstZ = mesh.positions[ first + 2 ]!;
	const secondX = mesh.positions[ second ]! - firstX;
	const secondY = mesh.positions[ second + 1 ]! - firstY;
	const secondZ = mesh.positions[ second + 2 ]! - firstZ;
	const thirdX = mesh.positions[ third ]! - firstX;
	const thirdY = mesh.positions[ third + 1 ]! - firstY;
	const thirdZ = mesh.positions[ third + 2 ]! - firstZ;

	return secondZ * thirdX - secondX * thirdZ;

}

function opaquePixelCount( texture: { width: number; data: Uint8Array }, tile: number, tileSize: number ): number {

	let count = 0;

	for ( let y = 0; y < tileSize; y ++ ) {

		for ( let x = 0; x < tileSize; x ++ ) {

			const offset = ( y * texture.width + tile * tileSize + x ) * 4 + 3;
			if ( texture.data[ offset ] === 255 ) {

				count ++;

			}

		}

	}

	return count;

}

function trunkAxisAndRadiusAt( mesh: MeshData, sides: number, ringSegments: number, y: number ): { center: [ number, number ]; radius: number } {

	const bark = mesh.groups.find( ( group ) => group.partIndex === BARK_PART_INDEX )!;
	const rootOffset = minimumYInGroup( mesh, bark ) < - 0.01 ? 1 : 0;
	const ringCount = ringSegments + rootOffset;
	const ringStride = sides + 1;
	const rings: { center: [ number, number ]; y: number; radius: number }[] = [];

	for ( let ring = 0; ring <= ringCount; ring ++ ) {

		let centerX = 0;
		let centerZ = 0;
		let centerY = 0;

		for ( let side = 0; side < sides; side ++ ) {

			const vertex = ring === ringCount ? ring * ringStride : ring * ringStride + side;
			const offset = vertex * 3;
			centerX += mesh.positions[ offset ]! / sides;
			centerY += mesh.positions[ offset + 1 ]! / sides;
			centerZ += mesh.positions[ offset + 2 ]! / sides;

		}

		let radius = 0;

		for ( let side = 0; side < sides; side ++ ) {

			const vertex = ring === ringCount ? ring * ringStride : ring * ringStride + side;
			const offset = vertex * 3;
			radius += Math.hypot( mesh.positions[ offset ]! - centerX, mesh.positions[ offset + 2 ]! - centerZ ) / sides;

		}

		rings.push( { center: [ centerX, centerZ ], y: centerY, radius } );

	}

	for ( let ring = 1; ring < rings.length; ring ++ ) {

		const lower = rings[ ring - 1 ]!;
		const upper = rings[ ring ]!;

		if ( y <= upper.y || ring === rings.length - 1 ) {

			const amount = ( y - lower.y ) / ( upper.y - lower.y );

			return {
				center: [ lower.center[ 0 ] + ( upper.center[ 0 ] - lower.center[ 0 ] ) * amount, lower.center[ 1 ] + ( upper.center[ 1 ] - lower.center[ 1 ] ) * amount ],
				radius: lower.radius + ( upper.radius - lower.radius ) * amount,
			};

		}

	}

	throw new RangeError( 'Frond root is outside the trunk rings' );

}

function frondPitches( mesh: MeshData, frondIndex: number ): [ number, number ] {

	const leaves = leafGroup( mesh );
	const base = frondPoint( mesh, leaves, frondIndex, 0, 1 );
	const mid = frondPoint( mesh, leaves, frondIndex, 1, 1 );
	const tip = frondPoint( mesh, leaves, frondIndex, 2, 1 );
	const firstPitch = Math.atan2( mid[ 1 ] - base[ 1 ], Math.hypot( mid[ 0 ] - base[ 0 ], mid[ 2 ] - base[ 2 ] ) ) * 180 / Math.PI;
	const secondPitch = Math.atan2( tip[ 1 ] - mid[ 1 ], Math.hypot( tip[ 0 ] - mid[ 0 ], tip[ 2 ] - mid[ 2 ] ) ) * 180 / Math.PI;

	return [ firstPitch, secondPitch ];

}

function meanFrondLengthAtTier( mesh: MeshData, tierIndex: number ): number {

	const leaves = leafGroup( mesh );
	let total = 0;

	for ( let frond = tierIndex * 5; frond < tierIndex * 5 + 5; frond ++ ) {

		const base = frondPoint( mesh, leaves, frond, 0, 1 );
		const mid = frondPoint( mesh, leaves, frond, 1, 1 );
		const tip = frondPoint( mesh, leaves, frond, 2, 1 );

		total += distance3( base, mid ) + distance3( mid, tip );

	}

	return total / 5;

}

describe( 'conifer tree data', () => {

	it( 'stores the leaf sprig in one square 256-pixel texture', () => {

		const texture = generateTreeData( { seed: 1 } ).textures.leaf!;

		expect( texture.width ).toBe( 256 );
		expect( texture.height ).toBe( 256 );
		expect( texture.data.length ).toBe( 256 * 256 * 4 );

	} );

	it( 'bakes one transparent 128-pixel leafRing cell for each tier', () => {

		const texture = generateTreeData( { seed: 1 } ).textures.leafRing!;
		const tileSize = texture.height;

		expect( texture.width ).toBe( 10 * 128 );
		expect( texture.height ).toBe( 128 );
		expect( texture.data.length ).toBe( texture.width * texture.height * 4 );

		for ( let tier = 0; tier < 10; tier ++ ) {
			const tileX = tier * tileSize;
			const tileY = 0;

			let opaquePixels = 0;
			let transparentPixels = 0;

			for ( let y = 0; y < tileSize; y ++ ) {

				for ( let x = 0; x < tileSize; x ++ ) {

					const alpha = texture.data[ ( ( tileY + y ) * texture.width + tileX + x ) * 4 + 3 ]!;
					if ( alpha > 0 ) opaquePixels ++;
					else transparentPixels ++;

				}

			}

			expect( opaquePixels ).toBeGreaterThan( 0 );
			expect( transparentPixels ).toBeGreaterThan( 0 );

		}

		const shrunk = generateTreeData( { seed: 1, branchCount: 33 } ).textures.leafRing!;
		expect( shrunk.width ).toBe( 33 * 64 );
		expect( shrunk.height ).toBe( 64 );
		expect( shrunk.width ).toBeLessThanOrEqual( 4096 );

	} );

	it( 'keeps LOD0, LOD3, LOD4, collider, and impostor bake bytes at their HEAD values', async () => {

		const baselines = {
			1: {
				lod0: 'ff29667e27e6481d4b64c33ed27619608e41e22bd4b38f5b80a43befcf483d79',
				lod3: '15798aa00cc9ad28e55617570c26ea321c256eabf69a79af2855ebfae7421d93',
				lod4: '0204618ff594cc70bd0a14bebaffcb7ee511da6e5a9bf8e4c10b48f9294b6c25',
				collider: '78a4f7b0e153d7f23ab25c3d822d42976c4a0aa5611bdec2e7cf16338aaf34f0',
				impostorLod3: '7ebee077075e8b2b7bc8325a1d132d778447d4bec0b58d42c93be7f85ad4dc69',
				impostor: '5d06ca88834c6ab2bfb6e292e1f760a69c682d8dcff4083dd249ad52558f676e',
				lod1Trunk: '4bd89243607c76683d1072f168ba4b89e1c5789f4ac0e5b53338549ac3bc9b90',
				lod2Trunk: '4b69c6ae9ee6314ed92fe5afff9a680f2a8c5c6da1526e158ad2798154f7911c',
			},
			3: {
				lod0: '13bf9cf4d5a495348dd2413afac40ca9794c477a9e401cf41b59f535f58794fd',
				lod3: 'a52cdad68dfe796e0ee6c4ef1f9a42f51810a24f36af5fa1a8ce68465c10d881',
				lod4: '81fdec2cd36b5c0371d4196ed3d521b44d3ba742175175e6f8849e25605188bb',
				collider: '38d04880cebd491f1ee77bb81b10b9914bf80aaf18f065e722ab2676fdf7b1e1',
				impostorLod3: '197a1a181620485e00e84046841235e353dec13a5426c3ba5d47ac9cd8ed9eaa',
				impostor: '2afaa8043f91a4932bad15c36574b43dae8c38f73048be4a2714b034c1ed3c38',
				lod1Trunk: '4e00d38a03ef40e4279c50393ab1c0a34932dfb156bfc7b88531fe274be942a2',
				lod2Trunk: '16624011eb88652eb6f20c7fe8d3c32dd0a29640112a15411221d38cae46a038',
			},
		} as const;

		for ( const seed of [ 1, 3 ] as const ) {

			const data = generateTreeData( { seed } );
			const prepared = prepareVegetationAsset( data );
			const baseline = baselines[ seed ];

			expect( await hashArrayBytes( data.lods[ 0 ]!.positions, data.lods[ 0 ]!.indices ) ).toBe( baseline.lod0 );
			expect( await hashArrayBytes( data.lods[ 3 ]!.positions, data.lods[ 3 ]!.indices ) ).toBe( baseline.lod3 );
			expect( await hashArrayBytes( data.lods[ 4 ]!.positions, data.lods[ 4 ]!.indices ) ).toBe( baseline.lod4 );
			expect( await hashArrayBytes( data.collider!.positions, data.collider!.indices ) ).toBe( baseline.collider );
			expect( await hashArrayBytes( ...meshGroupBytes( data.lods[ 1 ]!, BARK_PART_INDEX ) ) ).toBe( baseline.lod1Trunk );
			expect( await hashArrayBytes( ...meshGroupBytes( data.lods[ 2 ]!, BARK_PART_INDEX ) ) ).toBe( baseline.lod2Trunk );
			expect( await hashArrayBytes( prepared.impostorTextures[ 'impostor-lod3' ]!.data ) ).toBe( baseline.impostorLod3 );
			expect( await hashArrayBytes( prepared.impostorTextures.impostor!.data ) ).toBe( baseline.impostor );

		}

	} );

	it( 'uses a gray-ish bark map multiplied by the brown default color', () => {

		const data = generateTreeData( { seed: 1 } );
		const barkPart = data.parts.find( ( part ) => part.name === 'bark' )!;
		const texture = data.textures[ barkPart.texture! ]!;
		const means = [ 0, 0, 0 ];

		for ( let offset = 0; offset < texture.data.length; offset += 4 ) {

			for ( let channel = 0; channel < 3; channel ++ ) means[ channel ]! += texture.data[ offset + channel ]!;

		}

		for ( let channel = 0; channel < 3; channel ++ ) means[ channel ]! /= texture.width * texture.height;

		expect( barkPart.defaultColor ).toBe( 0x6b4c32 );
		expect( Math.max( ...means ) - Math.min( ...means ) ).toBeLessThan( 30 );

	} );

	it( 'defaults to ten branch whorls', () => {

		const defaultTree = generateTreeData( { seed: 1 } );
		const tenWhorls = generateTreeData( { seed: 1, branchCount: 10 } );

		expect( triangleCount( defaultTree.lods[ 0 ]! ) ).toBe( triangleCount( tenWhorls.lods[ 0 ]! ) );
		expect( triangleCount( defaultTree.lods[ 0 ]! ) ).toBeGreaterThan( frondCount( defaultTree.lods[ 0 ]!, 8 ) * 8 );

	} );

	it( 'builds five valid, strictly decreasing LOD meshes and reference-matched parts', () => {

		const data = generateTreeData( { seed: 1 } );
		const counts = data.lods.map( triangleCount );

		expect( data.bounds.height ).toBe( 7.5 );
		expect( data.lods ).toHaveLength( 5 );
		expect( data.parts ).toHaveLength( 5 );
		expect( data.parts[ 0 ] ).toEqual( {
			name: 'bark',
			defaultColor: 0x6b4c32,
			texture: 'bark',
			alphaTest: 0,
			doubleSided: false,
			flatShading: false,
			roughness: 0.85,
			specularIntensity: 0.014872,
			ior: 1.05,
		} );
		expect( data.parts[ 1 ] ).toEqual( {
			name: 'leaf',
			defaultColor: 0x2f7d1f,
			texture: 'leaf',
			colorizesTexture: true,
			alphaTest: 0.5,
			doubleSided: true,
			flatShading: false,
			roughness: 0.95,
			emissive: 0x000000,
			emissiveIntensity: 0,
			specularIntensity: 0.014872,
			ior: 1.05,
		} );
		expect( data.parts[ 2 ] ).toEqual( {
			name: 'impostor-lod3',
			defaultColor: 0xffffff,
			texture: 'impostor-lod3',
			impostorViews: LOD3_IMPOSTOR_VIEWS,
			impostorFade: false,
			alphaTest: 0.5,
			doubleSided: true,
			flatShading: false,
		} );
		expect( data.parts[ 3 ] ).toEqual( { ...impostorPart(), impostorFade: false } );
		expect( data.parts[ 4 ] ).toEqual( {
			name: 'leafRing',
			defaultColor: 0x2f7d1f,
			texture: 'leafRing',
			colorizesTexture: true,
			alphaTest: 0.5,
			doubleSided: true,
			flatShading: false,
			roughness: 0.95,
			emissive: 0x000000,
			emissiveIntensity: 0,
			specularIntensity: 0.014872,
			ior: 1.05,
		} );
		expect( Object.keys( data.textures ).sort() ).toEqual( [ 'bark', 'leaf', 'leafRing' ] );

		for ( const lod of data.lods ) validateMeshData( lod );

		expect( counts[ 0 ] ).toBeGreaterThanOrEqual( 400 );
		expect( counts[ 0 ] ).toBeLessThanOrEqual( 1000 );
		expect( counts[ 0 ] ).toBeGreaterThan( frondCount( data.lods[ 0 ]!, 8 ) * 8 );
		expect( counts[ 1 ] ).toBeLessThan( counts[ 0 ]! );
		expect( counts[ 1 ] ).toBeGreaterThanOrEqual( counts[ 0 ]! * 0.45 );
		expect( counts[ 1 ] ).toBeLessThanOrEqual( counts[ 0 ]! * 0.55 );
		expect( counts[ 2 ] ).toBeLessThan( counts[ 1 ]! );
		expect( counts[ 2 ] ).toBeGreaterThanOrEqual( counts[ 0 ]! * 0.2 );
		expect( counts[ 2 ] ).toBeLessThanOrEqual( counts[ 0 ]! * 0.3 );
		expect( counts[ 3 ] ).toBeLessThan( counts[ 2 ]! );
		expect( counts[ 4 ] ).toBeLessThan( counts[ 3 ]! );
		expect( data.lods[ 3 ]!.groups ).toEqual( [ { start: 0, count: 42, partIndex: LOD3_IMPOSTOR_PART_INDEX } ] );
		expect( data.lods[ 4 ] ).toEqual( buildBillboard( data.bounds, IMPOSTOR_PART_INDEX, data.lods[ 0 ]!, data.bounds.height * 0.25 ) );

	} );

	it( 'keeps LOD vertex counts below the reference and removes hidden trunk rings', () => {

		for ( const seed of [ 1, 2, 3, 4, 5 ] ) {

			const lods = generateTreeData( { seed } ).lods;
			const counts = lods.map( vertexCount );
			const triangles = lods.map( triangleCount );

			expect( counts[ 0 ] ).toBeLessThanOrEqual( 740 );
			expect( counts[ 1 ] ).toBeLessThanOrEqual( 410 );
			expect( counts[ 2 ] ).toBeLessThanOrEqual( 331 );
			expect( counts[ 0 ] ).toBeLessThanOrEqual( 795 );
			expect( counts[ 1 ] ).toBeLessThanOrEqual( 513 );
			expect( triangles[ 3 ] ).toBeLessThanOrEqual( 40 );
			expect( triangles[ 4 ] ).toBeLessThanOrEqual( 12 );
			expect( counts[ 3 ] ).toBe( 28 );
			expect( counts[ 4 ] ).toBe( 8 );
			expect( counts[ 3 ] ).toBeLessThan( counts[ 2 ]! );
			expect( counts[ 4 ] ).toBeLessThan( counts[ 2 ]! );

		}

	} );

	it( 'uses neutral leaf vertex colors for the texture-driven ramp', () => {

		const mesh = generateTreeData( { seed: 1 } ).lods[ 0 ]!;
		const leaves = leafGroup( mesh );
		const firstVertex = mesh.indices[ leaves.start ]!;
		const edgeOffset = firstVertex * 3;
		const midribOffset = ( firstVertex + 4 ) * 3;

		expect( mesh.colors[ edgeOffset ] ).toBeCloseTo( 0.74244, 5 );
		expect( mesh.colors[ edgeOffset + 1 ] ).toBeCloseTo( 0.74244, 5 );
		expect( mesh.colors[ edgeOffset + 2 ] ).toBeCloseTo( 0.74244, 5 );
		expect( mesh.colors[ midribOffset ] ).toBeCloseTo( 1, 5 );
		expect( mesh.colors[ midribOffset + 1 ] ).toBeCloseTo( 1, 5 );
		expect( mesh.colors[ midribOffset + 2 ] ).toBeCloseTo( 1, 5 );
		expect( mesh.colors[ ( firstVertex + 6 ) * 3 + 1 ] ).toBeCloseTo( mesh.colors[ edgeOffset + 1 ]!, 5 );

	} );

	it( 'keeps the frond vertex tint constant from base to tip', () => {

		const settings = [
			{ lod: 0, trianglesPerFrond: 8, indicesPerFrond: 24, centerOffsets: [ 1, 4, 7 ] },
			{ lod: 1, trianglesPerFrond: 4, indicesPerFrond: 12, centerOffsets: [ 0, 1, 2, 3, 4, 5 ] },
		];

		for ( const setting of settings ) {

			const mesh = generateTreeData( { seed: 1 } ).lods[ setting.lod ]!;
			const leaves = leafGroup( mesh );

			for ( let frond = 0; frond < frondCount( mesh, setting.trianglesPerFrond ); frond ++ ) {

				const firstVertex = mesh.indices[ leaves.start + frond * setting.indicesPerFrond ]!;
				const centerGreen = mesh.colors[ ( firstVertex + setting.centerOffsets[ 0 ]! ) * 3 + 1 ]!;

				for ( let index = 1; index < setting.centerOffsets.length; index ++ ) {

					expect( mesh.colors[ ( firstVertex + setting.centerOffsets[ index ]! ) * 3 + 1 ] ).toBeCloseTo( centerGreen, 5 );

				}

			}

		}

		const mesh = generateTreeData( { seed: 1 } ).lods[ 2 ]!;
		const leaves = leafGroup( mesh );

		for ( let frond = 0; frond < frondCount( mesh, 2 ); frond ++ ) {

			const firstVertex = mesh.indices[ leaves.start + frond * 6 ]!;
			const firstGreen = mesh.colors[ firstVertex * 3 + 1 ]!;

			for ( let vertex = 1; vertex < 4; vertex ++ ) {

				expect( mesh.colors[ ( firstVertex + vertex ) * 3 + 1 ] ).toBeCloseTo( firstGreen, 5 );

			}

		}

	} );

	it( 'keeps the rendered CPU frond proxy profile smooth from base to tip', () => {

		const data = generateTreeData( { seed: 1 } );
		const mesh = data.lods[ 0 ]!;
		const leaves = leafGroup( mesh );
		const firstVertex = mesh.indices[ leaves.start ]!;
		const greenTint = mesh.colors[ firstVertex * 3 + 1 ]!;
		const measured = Array.from( { length: 15 }, ( _, index ) => sampleFrondLuminance( data.textures.leaf!, ( index + 1 ) / 16, greenTint ) );

		for ( let index = 1; index < measured.length; index ++ ) {

			const step = measured[ index ]! - measured[ index - 1 ]!;

			expect( step ).toBeGreaterThan( 0 );
			expect( step ).toBeLessThan( 25 );

		}

	} );

	it( 'uses neutral vertex colors and blended normals for the LOD3 atlas planes', () => {

		const data = generateTreeData( { seed: 1 } );
		const mesh = data.lods[ 3 ]!;
		const part = mesh.groups[ 0 ]!.partIndex;

		expect( data.parts[ part ]!.texture ).toBe( 'impostor-lod3' );

		for ( let index = 0; index < mesh.positions.length / 3; index ++ ) {

			expect( mesh.colors[ index * 3 ] ).toBe( 1 );
			expect( mesh.colors[ index * 3 + 1 ] ).toBe( 1 );
			expect( mesh.colors[ index * 3 + 2 ] ).toBe( 1 );
			expect( Math.hypot( mesh.normals[ index * 3 ]!, mesh.normals[ index * 3 + 1 ]!, mesh.normals[ index * 3 + 2 ]! ) ).toBeCloseTo( 1 );

		}

	} );

	it( 'keeps the leaf texture limited to the square sprig', () => {

		const texture = generateTreeData( { seed: 1 } ).textures.leaf!;

		expect( texture.width ).toBe( texture.height );
		expect( texture.width ).toBe( 256 );
		expect( texture.data.length ).toBe( texture.width * texture.height * 4 );

	} );

	it( 'keeps the centerline untinted so the brown texture stem stays brown', () => {

		const mesh = generateTreeData( { seed: 1 } ).lods[ 0 ]!;
		const leaves = leafGroup( mesh );

		for ( let frond = 0; frond < 5; frond ++ ) {

			const firstVertex = mesh.indices[ leaves.start + frond * 24 ]!;

			for ( let row = 0; row < 3; row ++ ) {

				const offset = ( firstVertex + row * 3 + 1 ) * 3;

				expect( mesh.colors[ offset ] ).toBeCloseTo( 1, 5 );
				expect( mesh.colors[ offset + 1 ] ).toBeCloseTo( 1, 5 );
				expect( mesh.colors[ offset + 2 ] ).toBeCloseTo( 1, 5 );

			}

		}

	} );

	it( 'maps each LOD0 frond root to the wide end of the leaf texture stem', () => {

		const data = generateTreeData( { seed: 1 } );
		const mesh = data.lods[ 0 ]!;
		const leaves = leafGroup( mesh );
		const texture = data.textures.leaf!;

		for ( let frond = 0; frond < frondCount( mesh, 8 ); frond ++ ) {

			const firstVertex = mesh.indices[ leaves.start + frond * 24 ]!;
			const rootVertex = firstVertex + 1;
			const rootV = mesh.uvs[ rootVertex * 2 + 1 ]!;
			const rootRow = Math.round( rootV * ( texture.height - 1 ) );
			const middleRow = Math.round( ( rootV + 0.5 ) * 0.5 * ( texture.height - 1 ) );
			const oppositeRow = Math.round( ( 1 - rootV ) * ( texture.height - 1 ) );

			expect( rootV ).toBeCloseTo( 0, 5 );
			expect( brownStemWidthAtRow( texture, rootRow ) ).toBeGreaterThan( brownStemWidthAtRow( texture, middleRow ) );
			expect( brownStemWidthAtRow( texture, oppositeRow ) ).toBe( 0 );

		}

	} );

	it( 'lifts lower-tier greens to soften the dark-to-bright tier change', () => {

		const mesh = generateTreeData( { seed: 1 } ).lods[ 0 ]!;
		const leaves = leafGroup( mesh );
		const lastFrondIndex = frondCount( mesh, 8 ) - 1;
		const lowerVertex = mesh.indices[ leaves.start ]!;
		const upperVertex = mesh.indices[ leaves.start + lastFrondIndex * 24 ]!;
		const lowerGreen = mesh.colors[ lowerVertex * 3 + 1 ]!;
		const upperGreen = mesh.colors[ upperVertex * 3 + 1 ]!;

		expect( lowerGreen - upperGreen ).toBeGreaterThan( 0.015 );
		expect( lowerGreen - upperGreen ).toBeLessThan( 0.04 );

	} );

	it( 'softens color variation at the frond edges and between tiers', () => {

		const mesh = generateTreeData( { seed: 1 } ).lods[ 0 ]!;
		const leaves = leafGroup( mesh );
		const firstVertex = mesh.indices[ leaves.start ]!;
		const edgeGreen = mesh.colors[ firstVertex * 3 + 1 ]!;
		const tipGreen = mesh.colors[ ( firstVertex + 6 ) * 3 + 1 ]!;
		const lastFrondIndex = frondCount( mesh, 8 ) - 1;
		const upperVertex = mesh.indices[ leaves.start + lastFrondIndex * 24 ]!;
		const upperGreen = mesh.colors[ upperVertex * 3 + 1 ]!;

		expect( mesh.colors[ ( firstVertex + 4 ) * 3 + 1 ] ).toBeCloseTo( 1, 5 );
		expect( edgeGreen - tipGreen ).toBeLessThanOrEqual( 0.05 );
		expect( edgeGreen - upperGreen ).toBeLessThanOrEqual( 0.1 );

	} );

	it( 'is deterministic per seed and changes the conifer silhouette for another seed', () => {

		const first = generateTreeData( { seed: 1 } );
		const repeated = generateTreeData( { seed: 1 } );
		const other = generateTreeData( { seed: 2 } );

		for ( let lod = 0; lod < first.lods.length; lod ++ ) {

			expect( first.lods[ lod ]!.positions ).toEqual( repeated.lods[ lod ]!.positions );
			expect( first.lods[ lod ]!.indices ).toEqual( repeated.lods[ lod ]!.indices );

		}

		expect( first.lods[ 0 ]!.positions ).not.toEqual( other.lods[ 0 ]!.positions );
		expect( first.textures.leaf!.data ).toEqual( repeated.textures.leaf!.data );
		expect( first.textures.leaf!.data ).not.toEqual( other.textures.leaf!.data );

	} );

	it( 'extends only LOD0 through LOD2 trunks below ground and keeps bounds height above ground', () => {

		const data = generateTreeData( { seed: 6, height: 7.5 } );
		const rootDepth = 0.3 * ( data.bounds.height / 7.55 );

		for ( let index = 0; index < 3; index ++ ) {

			const lod = data.lods[ index ]!;
			const trunk = lod.groups.find( ( group ) => group.partIndex === BARK_PART_INDEX )!;
			const leaves = lod.groups.find( ( group ) => group.partIndex === LEAF_PART_INDEX )!;

			expect( Math.abs( minimumYInGroup( lod, trunk ) + rootDepth ) ).toBeLessThanOrEqual( 1e-3 );
			expect( minimumYInGroup( lod, leaves ) ).toBeGreaterThanOrEqual( - 0.05 );
			expect( maximumY( lod.positions ) ).toBeLessThanOrEqual( data.bounds.height + 1e-5 );

		}

		expect( data.bounds.height ).toBe( 7.5 );
		const taller = generateTreeData( { seed: 6, height: 15 } );
		const tallerTrunk = taller.lods[ 0 ]!.groups.find( ( group ) => group.partIndex === BARK_PART_INDEX )!;
		expect( Math.abs( minimumYInGroup( taller.lods[ 0 ]!, tallerTrunk ) + 0.3 * ( taller.bounds.height / 7.55 ) ) ).toBeLessThanOrEqual( 1e-3 );

		for ( const lod of data.lods.slice( 3 ) ) {

			expect( minimumY( lod.positions ) ).toBeGreaterThanOrEqual( - 0.05 );

		}

	} );

	it( 'uses upward stylized leaf normals and separates trunk and frond wind weights', () => {

		const data = generateTreeData( { seed: 1 } );
		const mesh = data.lods[ 0 ]!;
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

		const bark = mesh.groups.find( ( group ) => group.partIndex === BARK_PART_INDEX )!;
		const barkWinds = Array.from( { length: bark.count }, ( _, i ) => mesh.windWeight[ mesh.indices[ bark.start + i ]! ]! );

		expect( Math.min( ...barkWinds ) ).toBeGreaterThanOrEqual( 0 );
		expect( Math.max( ...barkWinds ) ).toBeLessThanOrEqual( 0.3001 );

		for ( let lod = 0; lod < 3; lod ++ ) {

			const trunkMesh = data.lods[ lod ]!;
			const trunk = trunkMesh.groups.find( ( group ) => group.partIndex === BARK_PART_INDEX )!;

			for ( let i = trunk.start; i < trunk.start + trunk.count; i ++ ) {

				const vertex = trunkMesh.indices[ i ]!;

				if ( trunkMesh.positions[ vertex * 3 + 1 ]! < 0.01 ) {
					expect( trunkMesh.windWeight[ vertex ] ).toBe( 0 );
				}

			}

		}

	} );

	it( 'builds folded 3 by 3 frond grids with upward vertex normals and two-sided rendering', () => {

		const mesh = generateTreeData( { seed: 1, branchCount: 15 } ).lods[ 0 ]!;
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
				expect( mesh.uvs[ uvOffset ]! ).toBeCloseTo( column * 0.5, 2 );
					expect( mesh.uvs[ uvOffset + 1 ] ).toBeCloseTo( [ 0, 0.4, 1 ][ row ]! );

				}

			}

			const left = frondPoint( mesh, leaves, frond, 1, 0 );
			const midrib = frondPoint( mesh, leaves, frond, 1, 1 );
			const right = frondPoint( mesh, leaves, frond, 1, 2 );
			const width = Math.hypot( right[ 0 ] - left[ 0 ], right[ 2 ] - left[ 2 ] );
			const fold = ( left[ 1 ] + right[ 1 ] ) * 0.5 - midrib[ 1 ];

			expect( fold / width ).toBeGreaterThanOrEqual( 0.096 );
			expect( fold / width ).toBeLessThanOrEqual( 0.144 );

		}

	} );

	it( 'roots the leader frond close to the trunk center', () => {

		const mesh = generateTreeData( { seed: 1 } ).lods[ 0 ]!;
		const leaves = leafGroup( mesh );
		const leaderBase = frondPoint( mesh, leaves, frondCount( mesh, 8 ) - 1, 0, 1 );
		const sides = 7;
		const trunk = trunkAxisAndRadiusAt( mesh, sides, 6, leaderBase[ 1 ] );

		expect( Math.hypot( leaderBase[ 0 ] - trunk.center[ 0 ], leaderBase[ 2 ] - trunk.center[ 1 ] ) ).toBeLessThanOrEqual( 0.01 );

	} );

	it( 'roots each frond midrib at or inside the trunk surface in LOD0 through LOD2', () => {

		const data = generateTreeData( { seed: 1 } );
		const lodSettings = [
			{ lod: 0, sides: 7, ringSegments: 6, trianglesPerFrond: 8 },
			{ lod: 1, sides: 6, ringSegments: 5, trianglesPerFrond: 4 },
			{ lod: 2, sides: 4, ringSegments: 4, trianglesPerFrond: 2 },
		];

		for ( const setting of lodSettings ) {

			const mesh = data.lods[ setting.lod ]!;

			for ( let frond = 0; frond < frondCount( mesh, setting.trianglesPerFrond ); frond ++ ) {

				const root = lodFrondRoot( mesh, setting.lod, frond );
				const trunk = trunkAxisAndRadiusAt( mesh, setting.sides, setting.ringSegments, root[ 1 ] );
				const distance = Math.hypot( root[ 0 ] - trunk.center[ 0 ], root[ 2 ] - trunk.center[ 1 ] );

				expect( distance ).toBeLessThanOrEqual( trunk.radius + 0.005 );

			}

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
		expect( frondPoint( mesh, leaves, frondCount( mesh, 8 ) - 1, 0, 1 )[ 1 ] ).toBeCloseTo( 6.6 * 7.5 / 7.55, 1 );

	} );

	it( 'follows Tree01 frond pitch as the attachment height rises', () => {

		const mesh = generateTreeData( { seed: 1, branchCount: 15 } ).lods[ 0 ]!;
		const referenceBands = [
			{ tier: 0, baseMid: - 17, midTip: 9 },
			{ tier: 3, baseMid: - 13, midTip: 13 },
			{ tier: 6, baseMid: - 6, midTip: 20 },
			{ tier: 9, baseMid: 10, midTip: 36 },
			{ tier: 12, baseMid: 22, midTip: 48 },
			{ tier: 14, baseMid: 39, midTip: 64 },
		];
		const measured: [ number, number ][] = [];

		for ( const band of referenceBands ) {

			const pitches = Array.from( { length: 5 }, ( _, index ) => frondPitches( mesh, band.tier * 5 + index ) );
			const mean = ( segment: 0 | 1 ): number => pitches.reduce( ( total, pitch ) => total + pitch[ segment ], 0 ) / pitches.length;
			const baseMid = mean( 0 );
			const midTip = mean( 1 );

			expect( Math.abs( baseMid - band.baseMid ) ).toBeLessThanOrEqual( 4 );
			expect( Math.abs( midTip - band.midTip ) ).toBeLessThanOrEqual( 4 );
			measured.push( [ baseMid, midTip ] );

		}

		for ( let index = 1; index < measured.length; index ++ ) {

			expect( measured[ index ]![ 0 ] ).toBeGreaterThan( measured[ index - 1 ]![ 0 ] );
			expect( measured[ index ]![ 1 ] ).toBeGreaterThan( measured[ index - 1 ]![ 1 ] );

		}

	} );

	it( 'distributes fifteen regular frond bands below the near-vertical apex leader', () => {

		const mesh = generateTreeData( { seed: 1, branchCount: 15 } ).lods[ 0 ]!;
		const leaves = leafGroup( mesh );
		const bandHeights = Array.from( { length: 15 }, ( _, index ) => frondPoint( mesh, leaves, index * 5, 0, 1 )[ 1 ] );

		expect( bandHeights[ 0 ] ).toBeGreaterThanOrEqual( 1.75 );
		expect( bandHeights[ 0 ] ).toBeLessThanOrEqual( 1.85 );
		expect( bandHeights[ 14 ] ).toBeCloseTo( 6.2 * 7.5 / 7.55, 1 );
		expect( frondPoint( mesh, leaves, 75, 0, 1 )[ 1 ] ).toBeCloseTo( 6.6 * 7.5 / 7.55, 1 );

		for ( let index = 1; index < bandHeights.length; index ++ ) {

			expect( bandHeights[ index ] ).toBeGreaterThan( bandHeights[ index - 1 ]! );

		}

	} );

	it( 'reduces reference frond lengths toward the apex', () => {

		const mesh = generateTreeData( { seed: 1, branchCount: 15 } ).lods[ 0 ]!;
		const tierLengths = Array.from( { length: 15 }, ( _, index ) => meanFrondLengthAtTier( mesh, index ) );
		const referenceScale = 7.5 / 7.55;

		expect( tierLengths[ 2 ] ).toBeGreaterThan( tierLengths[ 0 ]! );
		expect( tierLengths[ 2 ] ).toBeCloseTo( 2.6 * referenceScale, 1 );
		expect( tierLengths[ 14 ] ).toBeCloseTo( 1.2 * referenceScale, 1 );

		for ( let index = 2; index < tierLengths.length - 1; index ++ ) {

			expect( tierLengths[ index + 1 ] ).toBeLessThanOrEqual( tierLengths[ index ]! + 0.06 );

		}

	} );

	it( 'builds one bowl per tier and keeps the leader frond in the leaf part', () => {

		for ( const seed of [ 1, 3 ] ) {

			const data = generateTreeData( { seed } );
			expect( frondCount( data.lods[ 0 ]!, 8 ) ).toBe( 51 );

			for ( const lod of [ 1, 2 ] ) {

				const mesh = data.lods[ lod ]!;
				const bowl = leafRingGroup( mesh );
				const leader = leafGroup( mesh );
				const tierVertices = groupVertexIndices( mesh, bowl );
				const expectedVerticesPerTier = lod === 1 ? 16 : 11;
				const expectedTrianglesPerTier = lod === 1 ? 20 : 10;
				const expectedLeaderVertices = lod === 1 ? 6 : 4;
				const expectedLeaderTriangles = lod === 1 ? 4 : 2;

				expect( tierVertices ).toHaveLength( 10 * expectedVerticesPerTier );
				expect( bowl.count / 3 ).toBe( 10 * expectedTrianglesPerTier );
				expect( groupVertexIndices( mesh, leader ) ).toHaveLength( expectedLeaderVertices );
				expect( leader.count / 3 ).toBe( expectedLeaderTriangles );
				expect( vertexCount( mesh ) ).toBe( lod === 1 ? 209 : 140 );
				expect( triangleCount( mesh ) ).toBe( lod === 1 ? 270 : 138 );

				const leaderRoot = lodFrondRoot( mesh, lod, 0 );
				const leaderTip = lodFrondTip( mesh, lod, 0 );
				const referenceLeaderRoot = lodFrondRoot( data.lods[ 0 ]!, 0, 50 );
				const referenceLeaderTip = lodFrondTip( data.lods[ 0 ]!, 0, 50 );

				expect( Math.hypot( leaderRoot[ 0 ] - referenceLeaderRoot[ 0 ], leaderRoot[ 2 ] - referenceLeaderRoot[ 2 ] ) ).toBeLessThan( 0.001 );
				expect( Math.abs( leaderRoot[ 1 ] - referenceLeaderRoot[ 1 ] ) ).toBeLessThan( 0.2 );
				expect( distance3( leaderTip, referenceLeaderTip ) ).toBeLessThan( 0.2 );

			}

		}

	} );

	it( 'maps bowl UVs to horizontal positions and follows the frond tier heights', () => {

		const data = generateTreeData( { seed: 1 } );
		const reference = data.lods[ 0 ]!;
		const referenceLeaves = leafGroup( reference );

		for ( const lod of [ 1, 2 ] ) {

			const mesh = data.lods[ lod ]!;
			const bowl = leafRingGroup( mesh );
			const vertices = groupVertexIndices( mesh, bowl );
			const verticesPerTier = lod === 1 ? 16 : 11;
			const rimOffset = lod === 1 ? 6 : 1;

			for ( let tier = 0; tier < 10; tier ++ ) {

				const tierVertices = vertices.slice( tier * verticesPerTier, ( tier + 1 ) * verticesPerTier );
				const centerVertex = tierVertices[ 0 ]!;
				const centerOffset = centerVertex * 3;
				const center: [ number, number, number ] = [ mesh.positions[ centerOffset ]!, mesh.positions[ centerOffset + 1 ]!, mesh.positions[ centerOffset + 2 ]! ];
				const radius = Math.max( ...tierVertices.map( ( vertex ) => Math.hypot( mesh.positions[ vertex * 3 ]! - center[ 0 ], mesh.positions[ vertex * 3 + 2 ]! - center[ 2 ] ) ) );
				const meanBaseY = Array.from( { length: 5 }, ( _, index ) => frondPoint( reference, referenceLeaves, tier * 5 + index, 0, 1 )[ 1 ] ).reduce( ( total, value ) => total + value / 5, 0 );

				expect( center[ 1 ] ).toBeCloseTo( meanBaseY, 5 );

				for ( const vertex of tierVertices ) {

					const positionOffset = vertex * 3;
					const uvOffset = vertex * 2;
					const localU = 0.5 + ( mesh.positions[ positionOffset ]! - center[ 0 ] ) / ( 2 * radius );
					const localV = 0.5 + ( mesh.positions[ positionOffset + 2 ]! - center[ 2 ] ) / ( 2 * radius );

					expect( mesh.uvs[ uvOffset ] ).toBeCloseTo( ( tier + localU ) / 10, 4 );
					expect( mesh.uvs[ uvOffset + 1 ] ).toBeCloseTo( localV, 4 );
					expect( mesh.normals[ positionOffset ] ).toBe( 0 );
					expect( mesh.normals[ positionOffset + 1 ] ).toBe( 1 );
					expect( mesh.normals[ positionOffset + 2 ] ).toBe( 0 );
					expect( mesh.positions[ positionOffset + 1 ] ).toBeLessThanOrEqual( data.bounds.height );

				}

				if ( lod === 1 ) {

					for ( let frond = 0; frond < 5; frond ++ ) {

						const vertex = tierVertices[ 1 + frond ]!;
						const offset = vertex * 3;
						const referenceMid = frondPoint( reference, referenceLeaves, tier * 5 + frond, 1, 1 );

						for ( let axis = 0; axis < 3; axis ++ ) {
							expect( mesh.positions[ offset + axis ] ).toBeCloseTo( referenceMid[ axis ]!, 5 );
						}

					}

				}

				const rimVertices = tierVertices.slice( rimOffset );

				for ( let index = 1; index < rimVertices.length; index += 2 ) {

					const previous = mesh.positions[ rimVertices[ index - 1 ]! * 3 + 1 ]!;
					const midpoint = mesh.positions[ rimVertices[ index ]! * 3 + 1 ]!;
					const next = mesh.positions[ rimVertices[ ( index + 1 ) % rimVertices.length ]! * 3 + 1 ]!;

					// 葉と葉の間は LOD0 の V 字の折れの代わりに持ち上げる。
					expect( midpoint ).toBeGreaterThanOrEqual( Math.min( data.bounds.height, ( previous + next ) * 0.5 + 1e-4 ) );

				}

			}

			for ( let index = bowl.start; index < bowl.start + bowl.count; index += 3 ) {
				expect( geometricNormalY( mesh, index ) ).toBeGreaterThan( 0 );
			}

		}

	} );

	it( 'keeps at least 70 percent of LOD0 opaque coverage in exact side views', () => {

		const data = generateTreeData( { seed: 1 } );
		const yawAngles = Array.from( { length: 12 }, ( _, index ) => index * Math.PI / 12 );
		const tileSize = 128;
		const reference = bakeSideCoverage( data, 0, yawAngles );

		for ( const lod of [ 1, 2 ] ) {

			const measured = bakeSideCoverage( data, lod, yawAngles );

			for ( let view = 0; view < yawAngles.length; view ++ ) {

				const referenceCount = opaquePixelCount( reference, view, tileSize );
				const measuredCount = opaquePixelCount( measured, view, tileSize );

				expect( measuredCount / referenceCount ).toBeGreaterThanOrEqual( 0.7 );

			}

		}

	} );

	it( 'keeps the leader card and matches LOD0 color in elevated and top views', () => {

		const data = generateTreeData( { seed: 1 } );

		for ( const lod of [ 1, 2 ] ) {

			const candidate = data.lods[ lod ]!;
			const candidateLeaves = leafGroup( candidate );
			const leaderVertices = groupVertexIndices( candidate, candidateLeaves );
			const expectedVertexCount = lod === 1 ? 6 : 4;
			const expectedTriangleCount = lod === 1 ? 4 : 2;

			expect( leaderVertices ).toHaveLength( expectedVertexCount );
			expect( candidateLeaves.count / 3 ).toBe( expectedTriangleCount );

			for ( const vertex of leaderVertices ) {
				expect( candidate.normals[ vertex * 3 ] ).toBe( 0 );
				expect( candidate.normals[ vertex * 3 + 1 ] ).toBe( 1 );
				expect( candidate.normals[ vertex * 3 + 2 ] ).toBe( 0 );
			}

		}

		const referenceElevated = bakeElevatedLod( data, 0, 18 * Math.PI / 180 );
		const referenceTop = bakeLod( data, 0, true );

		for ( const lod of [ 1, 2 ] ) {

			const elevated = bakeElevatedLod( data, lod, 18 * Math.PI / 180 );
			const top = bakeLod( data, lod, true );

			for ( const difference of meanOpaqueColorDifference( referenceElevated, elevated, 0, 0, 128 ) ) {
				expect( difference, `LOD${ lod } elevated color` ).toBeLessThanOrEqual( 6 );
			}

			for ( const difference of meanOpaqueColorDifference( referenceTop, top, 0, 0, 128 ) ) {
				expect( difference, `LOD${ lod } top color` ).toBeLessThanOrEqual( 6 );
			}

		}

	} );

	it( 'matches LOD0 coarse silhouette coverage with a 3 px tolerance and mean color', () => {

		const data = generateTreeData( { seed: 1 } );
		const referenceCoverage = bakeLod( data, 0, false, true );
		const referenceColor = bakeLod( data, 0 );
		const tileSize = 128;
		const coveragePixelTolerance = 3;
		// 128px の輪郭差を 3px 幅で比較します。

		for ( const lod of [ 1, 2 ] ) {

			const measured = bakeLod( data, lod, false, true );
			const measuredColor = bakeLod( data, lod );
			const minimumIou = lod === 1 ? 0.88 : 0.8;

			for ( let view = 0; view < 3; view ++ ) {

				expect( coverageIou( referenceCoverage, measured, view, tileSize, coveragePixelTolerance ), `LOD${ lod } view ${ view }` ).toBeGreaterThanOrEqual( minimumIou );

				for ( const difference of meanOpaqueColorDifference( referenceColor, measuredColor, view, view, tileSize ) ) {
					expect( difference ).toBeLessThanOrEqual( 6 );
				}

			}

		}

	} );

	it( 'keeps the bowl LODs close to LOD0 when seen from straight above', () => {

		const tileSize = 128;
		const topView = [ LOD4_IMPOSTOR_VIEWS[ 1 ] ];

		for ( const seed of [ 1, 3 ] ) {

			const data = generateTreeData( { seed } );
			const bakeTop = ( lod: number ) => bakeImpostor( { ...data, lods: [ data.lods[ lod ]! ] }, defaultColors( data ), tileSize, topView );
			const reference = bakeTop( 0 );
			const referenceCount = opaquePixelCount( reference, 0, tileSize );

			for ( const lod of [ 1, 2 ] ) {

				const measured = bakeTop( lod );

				// お椀は LOD0 の葉を真上から焼いた 128px のテクスチャなので、細い針葉が少し欠けます。
				expect( opaquePixelCount( measured, 0, tileSize ) / referenceCount, `seed ${ seed } LOD${ lod } top coverage` ).toBeGreaterThanOrEqual( 0.75 );
				expect( coverageIou( reference, measured, 0, tileSize, 3 ), `seed ${ seed } LOD${ lod } top view` ).toBeGreaterThanOrEqual( 0.78 );

				for ( const difference of meanOpaqueColorDifference( reference, measured, 0, 0, tileSize ) ) {
					expect( difference ).toBeLessThanOrEqual( 6 );
				}

			}

		}

	} );

	it( 'generates the conifer LOD set within the 50 ms budget', () => {

		generateTreeData( { seed: 21 } );
		const start = performance.now();
		generateTreeData( { seed: 22 } );

		expect( performance.now() - start ).toBeLessThan( 50 );

	} );

	it( 'uses smooth radial trunk normals in LOD0 through LOD2', () => {

		const data = generateTreeData( { seed: 1 } );

		expect( data.parts[ 0 ]!.flatShading ).toBe( false );

		for ( let lod = 0; lod < 3; lod ++ ) {

			const mesh = data.lods[ lod ]!;
			const bark = mesh.groups.find( ( group ) => group.partIndex === BARK_PART_INDEX )!;
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

	it( 'closes each trunk apex and leaves the underground root ring open', () => {

		const data = generateTreeData( { seed: 1 } );
		const rootDepth = 0.3 * ( data.bounds.height / 7.55 );
		const sideCounts = [ 7, 6, 4 ];

		for ( let lod = 0; lod < sideCounts.length; lod ++ ) {

			const mesh = data.lods[ lod ]!;
			const bark = mesh.groups.find( ( group ) => group.partIndex === BARK_PART_INDEX )!;
			const boundary = boundaryEdges( mesh, bark );

			expect( boundary ).toHaveLength( sideCounts[ lod ]! );

			for ( const [ first, second ] of boundary ) {

				expect( Math.abs( mesh.positions[ first * 3 + 1 ]! + rootDepth ) ).toBeLessThan( 0.02 );
				expect( Math.abs( mesh.positions[ second * 3 + 1 ]! + rootDepth ) ).toBeLessThan( 0.02 );

			}

			for ( let index = bark.start; index < bark.start + bark.count; index += 3 ) {

				const a = mesh.indices[ index ]!;
				const b = mesh.indices[ index + 1 ]!;
				const c = mesh.indices[ index + 2 ]!;
				const aOffset = a * 3;
				const bOffset = b * 3;
				const cOffset = c * 3;
				const ab = [ mesh.positions[ bOffset ]! - mesh.positions[ aOffset ]!, mesh.positions[ bOffset + 1 ]! - mesh.positions[ aOffset + 1 ]!, mesh.positions[ bOffset + 2 ]! - mesh.positions[ aOffset + 2 ]! ];
				const ac = [ mesh.positions[ cOffset ]! - mesh.positions[ aOffset ]!, mesh.positions[ cOffset + 1 ]! - mesh.positions[ aOffset + 1 ]!, mesh.positions[ cOffset + 2 ]! - mesh.positions[ aOffset + 2 ]! ];
				const faceNormal = [ ab[ 1 ]! * ac[ 2 ]! - ab[ 2 ]! * ac[ 1 ]!, ab[ 2 ]! * ac[ 0 ]! - ab[ 0 ]! * ac[ 2 ]!, ab[ 0 ]! * ac[ 1 ]! - ab[ 1 ]! * ac[ 0 ]! ];
				const smoothNormal = [ 0, 1, 2 ].map( ( component ) => mesh.normals[ aOffset + component ]! + mesh.normals[ bOffset + component ]! + mesh.normals[ cOffset + component ]! );
				const alignment = faceNormal[ 0 ]! * smoothNormal[ 0 ]! + faceNormal[ 1 ]! * smoothNormal[ 1 ]! + faceNormal[ 2 ]! * smoothNormal[ 2 ]!;

				expect( alignment ).toBeGreaterThan( 0 );

			}

		}

	} );

	it( 'uses a trunk UV range suitable for repeating the bark grain', () => {

		const mesh = generateTreeData( { seed: 1 } ).lods[ 0 ]!;
		const bark = mesh.groups.find( ( group ) => group.partIndex === BARK_PART_INDEX )!;
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
		expect( mesh.uvs[ 8 * 2 + 1 ] ).toBeGreaterThan( mesh.uvs[ 1 ]! );

	} );

	it( 'keeps a reference root flare and assigns one whorl per branchCount', () => {

		const fiveTiers = generateTreeData( { seed: 1, branchCount: 5 } );
		const eightTiers = generateTreeData( { seed: 1, branchCount: 8 } );
		const trunk = eightTiers.lods[ 0 ]!;
		const bark = trunk.groups.find( ( group ) => group.partIndex === BARK_PART_INDEX )!;
		let baseRadius = 0;

		for ( let i = bark.start; i < bark.start + bark.count; i ++ ) {

			const offset = trunk.indices[ i ]! * 3;

			if ( trunk.positions[ offset + 1 ]! < 1e-5 ) {
				baseRadius = Math.max( baseRadius, Math.hypot( trunk.positions[ offset ]!, trunk.positions[ offset + 2 ]! ) );
			}

		}

		expect( baseRadius ).toBeCloseTo( 0.293, 2 );
		const fiveFronds = frondCount( fiveTiers.lods[ 0 ]!, 8 );
		const eightFronds = frondCount( eightTiers.lods[ 0 ]!, 8 );
		expect( triangleCount( eightTiers.lods[ 0 ]! ) - triangleCount( fiveTiers.lods[ 0 ]! ) ).toBe( ( eightFronds - fiveFronds ) * 8 );

	} );

	it( 'keeps the ground trunk radius about twice the mid-height radius', () => {

		const data = generateTreeData( { seed: 1 } );
		const mesh = data.lods[ 0 ]!;
		const base = trunkAxisAndRadiusAt( mesh, 7, 6, 0 );
		const middle = trunkAxisAndRadiusAt( mesh, 7, 6, data.bounds.height * 0.5 );
		const ratio = base.radius / middle.radius;

		expect( ratio ).toBeGreaterThanOrEqual( 1.5 );
		expect( ratio ).toBeLessThanOrEqual( 2.25 );

	} );

	it( 'keeps the closed trunk apex below the highest foliage', () => {

		const data = generateTreeData( { seed: 1 } );
		const mesh = data.lods[ 0 ]!;
		const trunk = mesh.groups.find( ( group ) => group.partIndex === BARK_PART_INDEX )!;
		const leaves = mesh.groups.find( ( group ) => group.partIndex === LEAF_PART_INDEX )!;
		let trunkTipY = - Infinity;
		let highestLeafY = - Infinity;

		for ( let index = trunk.start; index < trunk.start + trunk.count; index ++ ) {

			const vertex = mesh.indices[ index ]!;
			trunkTipY = Math.max( trunkTipY, mesh.positions[ vertex * 3 + 1 ]! );

		}

		for ( let index = leaves.start; index < leaves.start + leaves.count; index ++ ) {

			const vertex = mesh.indices[ index ]!;
			highestLeafY = Math.max( highestLeafY, mesh.positions[ vertex * 3 + 1 ]! );

		}

		expect( highestLeafY ).toBeGreaterThan( data.bounds.height - 0.05 );
		expect( trunkTipY ).toBeLessThan( highestLeafY - 0.25 );

	} );

	it( 'matches LOD0 silhouette on each LOD3 plane at front, 30, and 60 degrees', () => {

		for ( const seed of [ 1, 2, 3 ] ) {

			const data = generateTreeData( { seed } );
			const colors = defaultColors( data );
			const lod3Texture = bakeImpostor( data, colors, 128, LOD3_IMPOSTOR_VIEWS );
			for ( const yaw of [ 0, Math.PI / 6, Math.PI / 3 ] ) {

				const planeIndex = Math.round( yaw / ( Math.PI / 6 ) );
				const lod3PlaneData = {
					...data,
					lods: [ billboardPlane( data.lods[ 3 ]!, planeIndex, 2 ), ...data.lods.slice( 1 ) ],
					textures: { ...data.textures, 'impostor-lod3': lod3Texture },
				};
				const reference = bakeImpostor( data, colors, 128, [ yaw ] );
				const candidate = bakeImpostor( lod3PlaneData, colors, 128, [ yaw ] );
				let intersection = 0;
				let union = 0;

				for ( let y = 0; y < 128; y ++ ) {

					for ( let x = 0; x < 128; x ++ ) {

						const offset = ( y * reference.width + x ) * 4 + 3;
						const referenceOpaque = reference.data[ offset ]! >= 128;
						const candidateOpaque = candidate.data[ offset ]! >= 128;

						if ( referenceOpaque && candidateOpaque ) {

							intersection ++;

						}
						if ( referenceOpaque || candidateOpaque ) {

							union ++;

						}

					}

				}

				expect( intersection / union ).toBeGreaterThanOrEqual( 0.75 );

			}

		}
	} );

	it( 'keeps the LOD3 six-plane composite close to LOD0 coverage', () => {

		for ( const seed of [ 1, 2, 3 ] ) {

			const data = generateTreeData( { seed } );
			const colors = defaultColors( data );
			const lod3Texture = bakeImpostor( data, colors, 128, LOD3_IMPOSTOR_VIEWS );
			const lod3Data = {
				...data,
				lods: [ data.lods[ 3 ]!, ...data.lods.slice( 1 ) ],
				textures: { ...data.textures, 'impostor-lod3': lod3Texture },
			};

			for ( const yaw of [ 0, Math.PI / 6, Math.PI / 3 ] ) {

				const reference = bakeImpostor( data, colors, 128, [ yaw ] );
				const candidate = bakeImpostor( lod3Data, colors, 128, [ yaw ] );
				let intersection = 0;
				let union = 0;

				for ( let y = 0; y < 128; y ++ ) {

					for ( let x = 0; x < 128; x ++ ) {

						const offset = ( y * reference.width + x ) * 4 + 3;
						const referenceOpaque = reference.data[ offset ]! >= 128;
						const candidateOpaque = candidate.data[ offset ]! >= 128;

						if ( referenceOpaque && candidateOpaque ) {

							intersection ++;

						}
						if ( referenceOpaque || candidateOpaque ) {

							union ++;

						}

					}

				}

				expect( intersection / union ).toBeGreaterThanOrEqual( 0.74 );

			}

		}

	} );

	it( 'matches the textured LOD4 billboard silhouette to LOD0 in its front view', () => {

		for ( const seed of [ 1, 2, 3 ] ) {

			const data = generateTreeData( { seed } );
			const reference = bakeImpostor( data, defaultColors( data ), 128, LOD4_IMPOSTOR_VIEWS );
			const billboardData = {
				...data,
				lods: [ data.lods[ 4 ]!, ...data.lods.slice( 1 ) ],
				textures: { ...data.textures, impostor: reference },
			};
			const candidate = bakeImpostor( billboardData, defaultColors( data ), 128, [ 0 ] );

			for ( let view = 0; view < 1; view ++ ) {

				let intersection = 0;
				let union = 0;

				for ( let y = 0; y < 128; y ++ ) {

					for ( let x = 0; x < 128; x ++ ) {

						const referenceOffset = ( y * reference.width + view * 128 + x ) * 4 + 3;
						const candidateOffset = ( y * candidate.width + x ) * 4 + 3;
						const referenceOpaque = reference.data[ referenceOffset ]! >= 128;
						const candidateOpaque = candidate.data[ candidateOffset ]! >= 128;

						if ( referenceOpaque && candidateOpaque ) {

							intersection ++;

						}
						if ( referenceOpaque || candidateOpaque ) {

							union ++;

						}

					}

				}

				expect( intersection / union ).toBeGreaterThanOrEqual( 0.75 );

			}

		}

	} );

	it( 'matches the top-down LOD4 coverage to LOD0', () => {

		for ( const seed of [ 1, 2, 3 ] ) {

			const data = generateTreeData( { seed } );

			expect( triangleCount( data.lods[ 4 ]! ) ).toBe( 4 );
			expect( vertexCount( data.lods[ 4 ]! ) ).toBe( 8 );
			expect( data.lods[ 4 ]!.positions[ 13 ] ).toBeCloseTo( data.bounds.height * 0.25, 5 );
			expect( triangleCount( data.lods[ 3 ]! ) ).toBeGreaterThan( triangleCount( data.lods[ 4 ]! ) );
			expect( topCardCoverageIou( data ) ).toBeGreaterThanOrEqual( 0.6 );

		}

	} );

	it( 'keeps the trunk collider inside 1.5 times the base radius and reaches 85 percent height', () => {

		const data = generateTreeData( { seed: 1 } );
		const collider = data.collider!;
		const bark = data.lods[ 0 ]!.groups.find( ( group ) => group.partIndex === BARK_PART_INDEX )!;
		let baseRadius = 0;
		let colliderMaximumY = - Infinity;
		let colliderMinimumY = Infinity;

		for ( let i = bark.start; i < bark.start + bark.count; i ++ ) {

			const index = data.lods[ 0 ]!.indices[ i ]! * 3;
			const x = data.lods[ 0 ]!.positions[ index ]!;
			const y = data.lods[ 0 ]!.positions[ index + 1 ]!;
			const z = data.lods[ 0 ]!.positions[ index + 2 ]!;

			if ( y < data.bounds.height * 0.01 ) {

				baseRadius = Math.max( baseRadius, Math.hypot( x, z ) );

			}

		}

		for ( let i = 0; i < collider.positions.length; i += 3 ) {

			const x = collider.positions[ i ]!;
			const y = collider.positions[ i + 1 ]!;
			const z = collider.positions[ i + 2 ]!;

			colliderMaximumY = Math.max( colliderMaximumY, y );
			colliderMinimumY = Math.min( colliderMinimumY, y );
			expect( Math.hypot( x, z ) ).toBeLessThanOrEqual( baseRadius * 1.5 );

		}

		expect( triangleCount( { indices: collider.indices } ) ).toBeLessThanOrEqual( 48 );
		expect( Math.abs( colliderMinimumY + 0.3 * ( data.bounds.height / 7.55 ) ) ).toBeLessThanOrEqual( 1e-3 );
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
			const colors = defaultColors( data );
			bakeImpostor( data, colors, 128, LOD3_IMPOSTOR_YAW_ANGLES );
			bakeImpostor( data, colors, 128, [ 0 ] );

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
