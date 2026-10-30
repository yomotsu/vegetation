import { describe, expect, it } from 'vitest';
import { generateFlowersData, regenerateFlowersPetalTexture, regenerateFlowersStemTexture } from '../../src/core/generators/flowers';
import { CALLA_FLOWER_LENGTH, CALLA_PLANT_CARD_FLOWER_HEIGHT, CALLA_PLANT_CARD_FLOWER_Y, CALLA_PLANT_CARD_FOLIAGE_HEIGHT, CALLA_PLANT_CARD_FOLIAGE_WIDTH, CALLA_PLANT_CARD_TEXTURE_HEIGHT, CALLA_PLANT_CARD_TEXTURE_WIDTH, CALLA_PLANT_CARD_WIDTH } from '../../src/core/flowers/calla';
import { ALLIUM_HEAD_RISE, ALLIUM_HEAD_SIZE, ALLIUM_PLANT_CARD_TEXTURE_WIDTH, FLOWERS_PETAL_TEXTURE_SIZE, FLOWERS_STEM_TEXTURE_HEIGHT, createFlowersPetalTexture } from '../../src/core/flowersTexture';
import { hexToLinear } from '../../src/core/color';
import { bakeImpostor, getImpostorProjectionWindow, impostorViewsForPart, LOD4_IMPOSTOR_VIEWS } from '../../src/core/impostor';
import { prepareVegetationAsset } from '../../src/core/vegetationAssetPreparation';
import type { MeshData, VegetationData } from '../../src/core/types';
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

function footprintAtHeight( mesh: MeshData, minimumHeight: number ): { minX: number; maxX: number; minZ: number; maxZ: number } {

	const bounds = { minX: Infinity, maxX: - Infinity, minZ: Infinity, maxZ: - Infinity };
	const include = ( x: number, z: number ): void => {
		bounds.minX = Math.min( bounds.minX, x );
		bounds.maxX = Math.max( bounds.maxX, x );
		bounds.minZ = Math.min( bounds.minZ, z );
		bounds.maxZ = Math.max( bounds.maxZ, z );
	};

	for ( let triangle = 0; triangle < mesh.indices.length; triangle += 3 ) {
		const vertices = [ mesh.indices[ triangle ]!, mesh.indices[ triangle + 1 ]!, mesh.indices[ triangle + 2 ]! ];
		for ( let edge = 0; edge < 3; edge ++ ) {
			const first = vertices[ edge ]!;
			const second = vertices[ ( edge + 1 ) % 3 ]!;
			const firstOffset = first * 3;
			const secondOffset = second * 3;
			const firstY = mesh.positions[ firstOffset + 1 ]!;
			const secondY = mesh.positions[ secondOffset + 1 ]!;
			if ( firstY >= minimumHeight ) include( mesh.positions[ firstOffset ]!, mesh.positions[ firstOffset + 2 ]! );
			if ( ( firstY < minimumHeight && secondY > minimumHeight ) || ( firstY > minimumHeight && secondY < minimumHeight ) ) {
				const amount = ( minimumHeight - firstY ) / ( secondY - firstY );
				include(
					mesh.positions[ firstOffset ]! + ( mesh.positions[ secondOffset ]! - mesh.positions[ firstOffset ]! ) * amount,
					mesh.positions[ firstOffset + 2 ]! + ( mesh.positions[ secondOffset + 2 ]! - mesh.positions[ firstOffset + 2 ]! ) * amount,
				);
			}
		}
	}
	return bounds;

}

interface CallaSilhouette {
	width: number;
	reach: number;
	height: number;
	coverage: number;
}

function projectedCallaLeafSilhouette(
	mesh: MeshData,
	viewAngle: number,
	root: [ number, number, number ],
	texture?: { width: number; height: number; data: Uint8Array },
): CallaSilhouette {

	const size = 384;
	const minX = - 0.22;
	const maxX = 0.22;
	const minY = - 0.01;
	const maxY = 0.28;
	const pixelWidth = ( maxX - minX ) / size;
	const pixelHeight = ( maxY - minY ) / size;
	const mask = new Uint8Array( size * size );
	const viewX = Math.cos( viewAngle );
	const viewZ = Math.sin( viewAngle );
	const selectedGroups = mesh.groups.filter( ( group ) => group.partIndex === ( texture === undefined ? 1 : 2 ) );
	for ( const group of selectedGroups ) {
		for ( let offset = group.start; offset < group.start + group.count; offset += 3 ) {
			const triangle = [ mesh.indices[ offset ]!, mesh.indices[ offset + 1 ]!, mesh.indices[ offset + 2 ]! ];
			const uv = triangle.map( ( vertex ) => [ mesh.uvs[ vertex * 2 ]!, mesh.uvs[ vertex * 2 + 1 ]! ] as [ number, number ] );
			if ( texture === undefined && ! uv.every( ( value ) => value[ 0 ] > 0.2 ) ) continue;
			if ( texture !== undefined && ! uv.every( ( value ) => value[ 1 ] <= ( CALLA_PLANT_CARD_FOLIAGE_HEIGHT / CALLA_PLANT_CARD_TEXTURE_HEIGHT ) + 0.002 ) ) continue;

			const points = triangle.map( ( vertex, index ) => {
				const x = mesh.positions[ vertex * 3 ]! - root[ 0 ];
				const z = mesh.positions[ vertex * 3 + 2 ]! - root[ 2 ];
				const y = mesh.positions[ vertex * 3 + 1 ]!;
				return {
					x: ( x * viewX + z * viewZ - minX ) / pixelWidth,
					y: ( maxY - y ) / pixelHeight,
					u: uv[ index ]![ 0 ],
					v: uv[ index ]![ 1 ],
				};
			} );
			const [ a, b, c ] = points as [ typeof points[ number ], typeof points[ number ], typeof points[ number ] ];
			const denominator = ( b.y - c.y ) * ( a.x - c.x ) + ( c.x - b.x ) * ( a.y - c.y );
			if ( Math.abs( denominator ) < 1e-8 ) continue;
			const startX = Math.max( 0, Math.floor( Math.min( a.x, b.x, c.x ) ) );
			const endX = Math.min( size - 1, Math.ceil( Math.max( a.x, b.x, c.x ) ) );
			const startY = Math.max( 0, Math.floor( Math.min( a.y, b.y, c.y ) ) );
			const endY = Math.min( size - 1, Math.ceil( Math.max( a.y, b.y, c.y ) ) );
			for ( let y = startY; y <= endY; y ++ ) {
				for ( let x = startX; x <= endX; x ++ ) {
					const sampleX = x + 0.5;
					const sampleY = y + 0.5;
					const weightA = ( ( b.y - c.y ) * ( sampleX - c.x ) + ( c.x - b.x ) * ( sampleY - c.y ) ) / denominator;
					const weightB = ( ( c.y - a.y ) * ( sampleX - c.x ) + ( a.x - c.x ) * ( sampleY - c.y ) ) / denominator;
					const weightC = 1 - weightA - weightB;
					if ( weightA < - 1e-6 || weightB < - 1e-6 || weightC < - 1e-6 ) continue;
					if ( texture !== undefined ) {
						const u = Math.max( 0, Math.min( 1, weightA * a.u + weightB * b.u + weightC * c.u ) );
						const v = Math.max( 0, Math.min( 1, weightA * a.v + weightB * b.v + weightC * c.v ) );
						const tileCenter = u < 0.5 ? 0.25 : 0.75;
						if ( Math.abs( u - tileCenter ) < 0.01 ) continue;
						const textureX = Math.min( texture.width - 1, Math.floor( u * texture.width ) );
						const textureY = Math.min( texture.height - 1, Math.floor( v * texture.height ) );
						if ( texture.data[ ( textureY * texture.width + textureX ) * 4 + 3 ]! <= 127 ) continue;
					}
					mask[ y * size + x ] = 1;
				}
			}
		}
	}

	let left = size;
	let right = - 1;
	let top = size;
	let bottom = - 1;
	let covered = 0;
	for ( let y = 0; y < size; y ++ ) {
		for ( let x = 0; x < size; x ++ ) {
			if ( mask[ y * size + x ] === 0 ) continue;
			left = Math.min( left, x );
			right = Math.max( right, x );
			top = Math.min( top, y );
			bottom = Math.max( bottom, y );
			covered ++;
		}
	}
	const silhouetteMinX = minX + left * pixelWidth;
	const silhouetteMaxX = minX + ( right + 1 ) * pixelWidth;
	return {
		width: ( right - left + 1 ) * pixelWidth,
		reach: Math.max( Math.abs( silhouetteMinX ), Math.abs( silhouetteMaxX ) ),
		height: ( bottom - top + 1 ) * pixelHeight,
		coverage: covered * pixelWidth * pixelHeight,
	};

}

function projectedFlowerBounds( meshes: MeshData[], viewAngle: number ): { minX: number; maxX: number; minY: number; maxY: number } {

	const viewX = Math.cos( viewAngle );
	const viewZ = Math.sin( viewAngle );
	const bounds = { minX: Infinity, maxX: - Infinity, minY: Infinity, maxY: - Infinity };
	for ( const mesh of meshes ) {
		for ( let vertex = 0; vertex < mesh.positions.length / 3; vertex ++ ) {
			const x = mesh.positions[ vertex * 3 ]!;
			const y = mesh.positions[ vertex * 3 + 1 ]!;
			const z = mesh.positions[ vertex * 3 + 2 ]!;
			const projectedX = x * viewX + z * viewZ;
			bounds.minX = Math.min( bounds.minX, projectedX );
			bounds.maxX = Math.max( bounds.maxX, projectedX );
			bounds.minY = Math.min( bounds.minY, y );
			bounds.maxY = Math.max( bounds.maxY, y );
		}
	}
	return bounds;

}

function projectedFlowerSilhouette( data: VegetationData, mesh: MeshData, viewAngle: number, bounds: ReturnType<typeof projectedFlowerBounds>, size = 192 ): Uint8Array {

	const mask = new Uint8Array( size * size );
	const viewX = Math.cos( viewAngle );
	const viewZ = Math.sin( viewAngle );
	const width = bounds.maxX - bounds.minX;
	const height = bounds.maxY - bounds.minY;
	const toScreen = ( vertex: number ) => {
		const offset = vertex * 3;
		const projectedX = mesh.positions[ offset ]! * viewX + mesh.positions[ offset + 2 ]! * viewZ;
		return [ ( projectedX - bounds.minX ) / width * size, ( bounds.maxY - mesh.positions[ offset + 1 ]! ) / height * size ] as const;
	};

	for ( const group of mesh.groups ) {
		const part = data.parts[ group.partIndex ]!;
		const texture = part.texture === null ? undefined : data.textures[ part.texture ];
		for ( let offset = group.start; offset < group.start + group.count; offset += 3 ) {
			const indices = [ mesh.indices[ offset ]!, mesh.indices[ offset + 1 ]!, mesh.indices[ offset + 2 ]! ];
			const points = indices.map( ( vertex ) => toScreen( vertex ) );
			const [ a, b, c ] = points as [ readonly [ number, number ], readonly [ number, number ], readonly [ number, number ] ];
			const denominator = ( b[ 1 ] - c[ 1 ] ) * ( a[ 0 ] - c[ 0 ] ) + ( c[ 0 ] - b[ 0 ] ) * ( a[ 1 ] - c[ 1 ] );
			if ( Math.abs( denominator ) < 1e-8 ) continue;
			const startX = Math.max( 0, Math.floor( Math.min( a[ 0 ], b[ 0 ], c[ 0 ] ) ) );
			const endX = Math.min( size - 1, Math.ceil( Math.max( a[ 0 ], b[ 0 ], c[ 0 ] ) ) );
			const startY = Math.max( 0, Math.floor( Math.min( a[ 1 ], b[ 1 ], c[ 1 ] ) ) );
			const endY = Math.min( size - 1, Math.ceil( Math.max( a[ 1 ], b[ 1 ], c[ 1 ] ) ) );
			for ( let y = startY; y <= endY; y ++ ) {
				for ( let x = startX; x <= endX; x ++ ) {
					const sampleX = x + 0.5;
					const sampleY = y + 0.5;
					const weightA = ( ( b[ 1 ] - c[ 1 ] ) * ( sampleX - c[ 0 ] ) + ( c[ 0 ] - b[ 0 ] ) * ( sampleY - c[ 1 ] ) ) / denominator;
					const weightB = ( ( c[ 1 ] - a[ 1 ] ) * ( sampleX - c[ 0 ] ) + ( a[ 0 ] - c[ 0 ] ) * ( sampleY - c[ 1 ] ) ) / denominator;
					const weightC = 1 - weightA - weightB;
					if ( weightA < - 1e-6 || weightB < - 1e-6 || weightC < - 1e-6 ) continue;
					if ( texture !== undefined ) {
						const u = Math.max( 0, Math.min( 1, weightA * mesh.uvs[ indices[ 0 ]! * 2 ]! + weightB * mesh.uvs[ indices[ 1 ]! * 2 ]! + weightC * mesh.uvs[ indices[ 2 ]! * 2 ]! ) );
						const v = Math.max( 0, Math.min( 1, weightA * mesh.uvs[ indices[ 0 ]! * 2 + 1 ]! + weightB * mesh.uvs[ indices[ 1 ]! * 2 + 1 ]! + weightC * mesh.uvs[ indices[ 2 ]! * 2 + 1 ]! ) );
						const textureX = Math.min( texture.width - 1, Math.floor( u * texture.width ) );
						const textureY = Math.min( texture.height - 1, Math.floor( v * texture.height ) );
						if ( texture.data[ ( textureY * texture.width + textureX ) * 4 + 3 ]! <= 127 ) continue;
					}
					mask[ y * size + x ] = 1;
				}
			}
		}
	}
	return mask;

}

function projectedFlowerIou( first: Uint8Array, second: Uint8Array ): number {

	let intersection = 0;
	let union = 0;
	for ( let pixel = 0; pixel < first.length; pixel ++ ) {
		if ( first[ pixel ] === 1 && second[ pixel ] === 1 ) intersection ++;
		if ( first[ pixel ] === 1 || second[ pixel ] === 1 ) union ++;
	}
	return union === 0 ? 1 : intersection / union;

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

	it( 'keeps poppy and calla LOD0 and primrose LOD0/1 byte-identical', async () => {

		const fields = [ 'positions', 'normals', 'uvs', 'colors', 'windWeight', 'impostorCard', 'indices' ] as const;
		const hash = async ( bytes: ArrayBufferView ) => {
			const source = new Uint8Array( bytes.buffer, bytes.byteOffset, bytes.byteLength );
			const digest = await globalThis.crypto.subtle.digest( 'SHA-256', Uint8Array.from( source ) );
			return Array.from( new Uint8Array( digest ), ( value ) => value.toString( 16 ).padStart( 2, '0' ) ).join( '' );
		};
		const expected = {
			poppy: {
				lods: [ [ '6fce5da5944be37b9dc1700fc53018644dfe72abe504f6fe635fdfe5ea76aeb0', '826b2e4a93f514a70ee3af485c928282041b0619da218fef6a400cad0ac1de0b', '9c01e2c5c99afb8c2c156a42095b9d647c198fcb7cc5bbd744d23fb862256f31', '32602b5f6aa16c692f6a582f5b7ebbdfa540312af0f43cce6d270f0e5abe572f', '5446686147e15355cf04312d05075fde6ac2df49b152fc103fc63c9d2526ff4d', '696bda342649ec9268da57b6a279df6f24b0e857d5e6d0605fd25af95adc3cee', '6ad0fc10aea57e1cd3d1ce5c5ad2f539d3054b3b8776dfcf509a2ffa4523baab' ] ],
				textures: [ '37d06a4645a7397847abe4199ea53dbdc6d8eb54eaeb1cabcf891a5f966f1351', 'f94a2954e625b855f823862c8cd02a6adb6790d5b957a3a7b9cde72918922971' ],
			},
			calla: {
				lods: [ [ '3eb0637de333da3589972da5315ec1ecc73ba55c46abf005d060030e7049b23d', 'ec5b75110a571b82d1a047329b3b9c3ac48586c19de1f6ed1c20ca85ef8c7167', '61270b45f606face94b8e283afd6c06138c9b37aa9b30eb1e07628e0ab7f92cd', '940eae32aa57b31c5270446b229465c1ff964dd673890d6e82797924cbb5379f', '34eb88752ec65016c4ab01fb49e0f0641c41ae17dd80d074e2b8ef1c6275c92a', '8889eb3cdd3d0ac94711b47ce78b430d8e23a7b31ecc994c56d0c3310c87674a', 'bd2122d0dfe44b1102b0e7be5c3b15ed6c54fe9e4e1a0bcc6935d7c97682ba74' ] ],
				textures: [ '6ba7fe2abb9b8be9c66bbde2a3e9659209b1dcd289d57ecca4f9365ec1ed2b3d', '3c97d04f02c849c11d5bf1d8fe0e26e31db8b102c48d4068192cfab1e93e99d9' ],
			},
			primrose: {
				lods: [
					[ 'd63b4655176aa34b1dc6cd2fa64779c325ffeb2a53049ff7f70dee6560b0ad35', '41b9d65d6754d23d9dc019e7bd7af870440953642bc83fd15634153bd0c88443', '8e0eb2854129c037cd4ad34e93c0dc782a25a926d321aaef248a59171881cb5c', '22fd25e9489f309ce36dbc7ba69042c279e957c19689951a3e29e15dc21574ac', '99bb5e9370031dfc1f8a2cf9bd4d0d74edbc57ab0c27856335bebb5da05333d8', '2b73f6b3cd6cd9f97ccbbedc2fa1904331b916b2ace865882f72ddd083c79b04', '48bbc3e512fd9222829ebf6b0d17a8a8a0a81a539755109ec4c559aa0e42e154' ],
					[ '3315266599db243ce6f09335da78cf328ec01089c31a59f37c8a182b6278adbc', 'be7903465f55756f988fa51fbc1cf7337f4d78d890ae869c070adfd7de6d4d55', '369c9486943961ad04338f9190db295bd4fbd26730cee8841345d1069b1aa5d1', 'dc90f6f1960b01ff1b235f01a9c5f950e2681ee588ea14d227f32febad3836dc', 'fad251f36965f0ec3baaefc91626e3140259fae3966548094bef548ac341a63e', 'e2fc162ed9124452d23c85e81d60a0c228f414c3214a5de635737e25fbd29ac1', '2361f5245ce5525b55851cc418321f4203059d91484967a00a326e72bd1df991' ],
				],
			},
		};

		for ( const variety of [ 'poppy', 'calla', 'primrose' ] as const ) {
			const data = generateFlowersData( { seed: 1, variety } );
			const lods = data.lods.slice( 0, variety === 'primrose' ? 2 : 1 );
			const actual = {
				lods: await Promise.all( lods.map( ( mesh ) => Promise.all( fields.map( ( field ) => hash( mesh[ field ] ) ) ) ) ),
				...( variety === 'primrose' ? {} : { textures: await Promise.all( [ 'petal', 'stem' ].map( ( key ) => hash( data.textures[ key ]!.data ) ) ) } ),
			};
			expect( actual ).toEqual( expected[ variety ] );
		}

	} );

	it( 'builds poppy LOD1-4 cups, stems, and horizontal flower cards', () => {

		const data = generateFlowersData( { seed: 5, variety: 'poppy' } );
		const [ lod0, lod1, lod2, lod3, lod4 ] = data.lods;
		expect( data.lods.map( triangleCount ) ).toEqual( [ 84, 40, 22, 6, 4 ] );
		expect( data.lods.slice( 1 ).every( ( mesh, index ) => triangleCount( mesh ) < triangleCount( data.lods[ index ]! ) ) ).toBe( true );
		expect( data.parts[ 2 ]!.impostorFade ).toBe( false );
		expect( data.parts[ 2 ]!.impostorViews ).toHaveLength( 3 );
		expect( data.parts[ 2 ]!.upNormalCards ).toBe( true );
		expect( data.parts[ 3 ]!.impostorFade ).toBe( false );
		expect( data.parts[ 3 ]!.impostorViews ).toHaveLength( 2 );
		expect( data.parts[ 3 ]!.upNormalCards ).toBe( true );
		expect( data.parts[ 2 ]!.doubleSided ).toBe( true );
		expect( data.parts[ 3 ]!.doubleSided ).toBe( true );

		const headCenters = ( mesh: MeshData ) => {
			const group = mesh.groups.find( ( candidate ) => candidate.partIndex === 0 )!;
			const vertices = new Set( mesh.indices.slice( group.start, group.start + group.count ) );
			return [ ...vertices ].filter( ( vertex ) => Math.abs( mesh.uvs[ vertex * 2 ]! - 0.34 ) < 1e-6 && Math.abs( mesh.uvs[ vertex * 2 + 1 ]! - 0.5 ) < 1e-6 );
		};
		const centerVertices = [ lod0, lod1, lod2 ].map( ( mesh ) => headCenters( mesh! ) );
		expect( centerVertices[ 0 ] ).toHaveLength( 2 );
		expect( centerVertices.map( ( vertices ) => vertices.length ) ).toEqual( [ 2, 2, 2 ] );
		for ( const [ headIndex, head ] of centerVertices[ 0 ]!.entries() ) {
			const reference = vertexPosition( lod0!, head );
			for ( const mesh of [ lod1!, lod2! ] ) {
				const matchingHead = headCenters( mesh ).find( ( vertex ) => {
					const point = vertexPosition( mesh, vertex );
					return Math.hypot( point[ 0 ] - reference[ 0 ], point[ 1 ] - reference[ 1 ], point[ 2 ] - reference[ 2 ] ) < 1e-6;
				} );
				expect( matchingHead ).toBeDefined();
			}
			expect( headIndex ).toBeLessThan( 2 );
		}
		const firstHead = centerVertices[ 1 ]![ 0 ]!;
		const stemTip = ( mesh: MeshData ) => {
			const group = mesh.groups.find( ( candidate ) => candidate.partIndex === 1 )!;
			const firstVertex = Math.min( ...mesh.indices.slice( group.start, group.start + group.count ) );
			return cardRowCenter( mesh, firstVertex, 1 );
		};
		for ( const mesh of [ lod1!, lod2! ] ) {
			const head = vertexPosition( mesh, headCenters( mesh )[ 0 ]! );
			const tip = stemTip( mesh );
			expect( Math.hypot( head[ 0 ] - tip[ 0 ], head[ 1 ] - tip[ 1 ], head[ 2 ] - tip[ 2 ] ) ).toBeLessThan( 1e-6 );
		}
		expect( vertexPosition( lod0!, centerVertices[ 0 ]![ 0 ]! ) ).toEqual( vertexPosition( lod1!, firstHead ) );

		const horizontalVertices = ( mesh: MeshData ) => Array.from( { length: mesh.impostorCard.length }, ( _, vertex ) => vertex ).filter( ( vertex ) => mesh.impostorCard[ vertex ] === 1 );
		const expectedHeadHeight = centerVertices[ 0 ]!.reduce( ( sum, vertex ) => sum + lod0!.positions[ vertex * 3 + 1 ]!, 0 ) / centerVertices[ 0 ]!.length;
		for ( const mesh of [ lod3!, lod4! ] ) {
			const top = horizontalVertices( mesh );
			expect( top ).toHaveLength( 4 );
			for ( const vertex of top ) expect( mesh.positions[ vertex * 3 + 1 ] ).toBeCloseTo( expectedHeadHeight, 6 );
			const topBounds = {
				minX: Math.min( ...top.map( ( vertex ) => mesh.positions[ vertex * 3 ]! ) ),
				maxX: Math.max( ...top.map( ( vertex ) => mesh.positions[ vertex * 3 ]! ) ),
				minZ: Math.min( ...top.map( ( vertex ) => mesh.positions[ vertex * 3 + 2 ]! ) ),
				maxZ: Math.max( ...top.map( ( vertex ) => mesh.positions[ vertex * 3 + 2 ]! ) ),
			};
			const headGroup = lod0!.groups.find( ( group ) => group.partIndex === 0 )!;
			const headVertices = new Set( lod0!.indices.slice( headGroup.start, headGroup.start + headGroup.count ) );
			for ( const vertex of headVertices ) {
				expect( lod0!.positions[ vertex * 3 ] ).toBeGreaterThanOrEqual( topBounds.minX - 1e-6 );
				expect( lod0!.positions[ vertex * 3 ] ).toBeLessThanOrEqual( topBounds.maxX + 1e-6 );
				expect( lod0!.positions[ vertex * 3 + 2 ] ).toBeGreaterThanOrEqual( topBounds.minZ - 1e-6 );
				expect( lod0!.positions[ vertex * 3 + 2 ] ).toBeLessThanOrEqual( topBounds.maxZ + 1e-6 );
			}
		}
		expect( horizontalVertices( lod3! ).every( ( vertex ) => lod3!.positions[ vertex * 3 + 1 ] === horizontalVertices( lod3! ).reduce( ( sum, index ) => sum + lod3!.positions[ index * 3 + 1 ]!, 0 ) / 4 ) ).toBe( true );
		expect( triangleCount( generateFlowersData( { seed: 5, variety: 'poppy', count: 1 } ).lods[ 2 ]! ) ).toBeLessThan( triangleCount( generateFlowersData( { seed: 5, variety: 'poppy', count: 1 } ).lods[ 3 ]! ) );

	} );

	it( 'bakes the poppy leaves into the LOD3/4 vertical cards but not into the top card', () => {

		const data = generateFlowersData( { seed: 5, variety: 'poppy' } );
		const leafRanges = data.parts[ 1 ]!.impostorBakeExcludeIndexRanges!;
		const lod0 = data.lods[ 0 ]!;
		const fullBakeData = { ...data, parts: data.parts.map( ( part ) => ( { ...part, impostorBakeExcludeIndexRanges: undefined } ) ) };
		const colors = data.parts.map( ( part ) => part.colorizesTexture ? [ 1, 1, 1 ] as [ number, number, number ] : hexToLinear( part.defaultColor ) );
		const prepared = prepareVegetationAsset( data, {}, 128 );

		expect( leafRanges ).toHaveLength( 18 );
		for ( const range of leafRanges ) {
			expect( range.count ).toBe( 6 );
			for ( let index = range.start; index < range.start + range.count; index ++ ) {
				const vertex = lod0.indices[ index ]!;
				expect( lod0.positions[ vertex * 3 + 1 ] ).toBeGreaterThanOrEqual( 0.012 );
				expect( lod0.positions[ vertex * 3 + 1 ] ).toBeLessThanOrEqual( 0.028001 );
			}
		}

		for ( const partIndex of [ 2, 3 ] ) {
			const part = data.parts[ partIndex ]!;
			const withoutLeaves = prepared.impostorTextures[ part.texture! ]!;
			const views = impostorViewsForPart( part )!;
			const withLeaves = bakeImpostor( fullBakeData, colors, 128, views );
			// 縦カードのタイルは葉込みの焼きと一致し、最後の上面タイルだけ葉が抜ける。
			for ( let tile = 0; tile < views.length; tile ++ ) {
				let differentPixels = 0;
				let opaquePixels = 0;
				for ( let y = 0; y < withoutLeaves.height; y ++ ) {
					for ( let x = tile * 128; x < ( tile + 1 ) * 128; x ++ ) {
						const pixel = ( y * withoutLeaves.width + x ) * 4;
						if ( withoutLeaves.data[ pixel + 3 ]! > 0 ) opaquePixels ++;
						for ( let channel = 0; channel < 4; channel ++ ) {
							if ( withoutLeaves.data[ pixel + channel ] !== withLeaves.data[ pixel + channel ] ) {
								differentPixels ++;
								break;
							}
						}
					}
				}
				expect( opaquePixels ).toBeGreaterThan( 0 );
				expect( views[ tile ]!.excludesBakeRanges === true ).toBe( tile === views.length - 1 );
				if ( tile === views.length - 1 ) expect( differentPixels ).toBeGreaterThan( 0 );
				else expect( differentPixels ).toBe( 0 );
			}
		}

		const recolored = prepareVegetationAsset( data, { petal: 0xa98bd6 }, 128 );
		expect( recolored.data.parts[ 1 ]!.impostorBakeExcludeIndexRanges ).toEqual( leafRanges );
		for ( const texture of [ 'impostor-lod3', 'impostor' ] ) expect( areByteIdentical( recolored.impostorTextures[ texture ]!.data, prepared.impostorTextures[ texture ]!.data ) ).toBe( false );

	} );

	it( 'uses a compact shared plant-card texture and LOD0 leaf count for calla', () => {

		const options = { seed: 5, variety: 'calla' as const };
		const data = generateFlowersData( options );
		const [ lod0, lod1, lod2, lod3, lod4 ] = data.lods;
		expect( data.lods.map( triangleCount ) ).toEqual( [ 93, 36, 24, 4, 2 ] );
		expect( data.parts.map( ( part ) => part.name ) ).toEqual( [ 'petal', 'stem', 'plantCard', 'impostor-lod3', 'impostor' ] );
		const plantCard = data.textures.plantCard!;
		expect( plantCard.width ).toBe( CALLA_PLANT_CARD_TEXTURE_WIDTH );
		expect( plantCard.width ).toBe( FLOWERS_PETAL_TEXTURE_SIZE );
		expect( plantCard.height ).toBe( CALLA_PLANT_CARD_TEXTURE_HEIGHT );
		expect( plantCard.height ).toBeLessThanOrEqual( 512 );
		expect( plantCard.width ).toBeLessThanOrEqual( 128 );
		expect( CALLA_PLANT_CARD_FOLIAGE_WIDTH ).toBeGreaterThanOrEqual( 0.36 );
		expect( plantCard.height ).toBe( 397 );
		expect( CALLA_PLANT_CARD_FLOWER_HEIGHT ).toBe( 141 );
		for ( let tile = 0; tile < 2; tile ++ ) {
			let coveredFoliagePixels = 0;
			for ( let y = 0; y < CALLA_PLANT_CARD_FOLIAGE_HEIGHT; y ++ ) {
				for ( let x = tile * ( plantCard.width / 2 ); x < ( tile + 1 ) * ( plantCard.width / 2 ); x ++ ) {
					if ( plantCard.data[ ( y * plantCard.width + x ) * 4 + 3 ]! > 127 ) coveredFoliagePixels ++;
				}
			}
			expect( coveredFoliagePixels ).toBeGreaterThan( 0 );
		}

		const trianglesByPart = ( mesh: MeshData, partIndex: number ) => mesh.groups.filter( ( group ) => group.partIndex === partIndex ).reduce( ( sum, group ) => sum + group.count / 3, 0 );
		expect( trianglesByPart( lod1!, 1 ) ).toBe( 12 );
		expect( trianglesByPart( lod2!, 1 ) ).toBe( 0 );
		for ( const mesh of [ lod1!, lod2! ] ) {
			const stemPart = mesh.groups.filter( ( group ) => group.partIndex === 1 );
			for ( const group of stemPart ) {
				const vertices = new Set( mesh.indices.slice( group.start, group.start + group.count ) );
				for ( const vertex of vertices ) expect( mesh.uvs[ vertex * 2 ]! ).toBeLessThanOrEqual( 0.16 );
			}
			const plantCardTriangles = trianglesByPart( mesh, 2 );
			expect( plantCardTriangles ).toBe( 24 );
		}

		const singlePlant = generateFlowersData( { ...options, count: 1 } );
		expect( singlePlant.lods.map( triangleCount ) ).toEqual( [ 31, 12, 8, 4, 2 ] );
		const singleLod0 = singlePlant.lods[ 0]!;
		const singleStemGroup = singleLod0.groups.find( ( group ) => group.partIndex === 1 )!;
		const lod0StemTipVertices = new Set( singleLod0.indices.slice( singleStemGroup.start, singleStemGroup.start + singleStemGroup.count ) );
		const lod0StemTop = [ ...lod0StemTipVertices ].filter( ( vertex ) => singleLod0.windWeight[ vertex ]! > 0.999 && singleLod0.uvs[ vertex * 2 ]! < 0.17 );
		const stemTipCenter = [ 0, 1, 2 ].map( ( axis ) => lod0StemTop.reduce( ( sum, vertex ) => sum + singleLod0.positions[ vertex * 3 + axis ]!, 0 ) / lod0StemTop.length );
		expect( lod0StemTop ).toHaveLength( 4 );
		for ( const mesh of [ singlePlant.lods[ 1]!, singlePlant.lods[ 2]! ] ) {
			const flowerStartV = CALLA_PLANT_CARD_FLOWER_Y / plantCard.height;
			const flowerVertices = new Set( mesh.groups.filter( ( group ) => group.partIndex === 2 ).flatMap( ( group ) => [ ...mesh.indices.slice( group.start, group.start + group.count ) ].filter( ( vertex ) => {
				const u = mesh.uvs[ vertex * 2 ]!;
				return mesh.uvs[ vertex * 2 + 1 ]! >= flowerStartV - 1e-6 && ( Math.abs( u - 16 / CALLA_PLANT_CARD_TEXTURE_WIDTH ) < 1e-6 || Math.abs( u - 112 / CALLA_PLANT_CARD_TEXTURE_WIDTH ) < 1e-6 );
			} ) ) );
			const flowerBottom = [ ...flowerVertices ].filter( ( vertex ) => Math.abs( mesh.uvs[ vertex * 2 + 1 ]! - flowerStartV ) < 1e-6 );
			const flowerTop = [ ...flowerVertices ].filter( ( vertex ) => Math.abs( mesh.uvs[ vertex * 2 + 1 ]! - 1 ) < 1e-6 );
			expect( flowerBottom ).toHaveLength( 4 );
			expect( flowerTop ).toHaveLength( 4 );
			for ( const [ vertices, expectedY ] of [ [ flowerBottom, stemTipCenter[ 1 ]! ], [ flowerTop, stemTipCenter[ 1 ]! + CALLA_FLOWER_LENGTH ] ] as const ) {
				const center = [ 0, 1, 2 ].map( ( axis ) => vertices.reduce( ( sum, vertex ) => sum + mesh.positions[ vertex * 3 + axis ]!, 0 ) / vertices.length );
				expect( center[ 0 ] ).toBeCloseTo( stemTipCenter[ 0 ]!, 6 );
				expect( center[ 1 ] ).toBeCloseTo( expectedY, 6 );
				expect( center[ 2 ] ).toBeCloseTo( stemTipCenter[ 2 ]!, 6 );
				const width = Math.max( ...vertices.flatMap( ( first ) => vertices.map( ( second ) => Math.hypot( mesh.positions[ first * 3 ]! - mesh.positions[ second * 3 ]!, mesh.positions[ first * 3 + 2 ]! - mesh.positions[ second * 3 + 2 ]! ) ) ) );
				expect( width ).toBeCloseTo( CALLA_PLANT_CARD_WIDTH, 6 );
			}
		}
		for ( let count = 1; count <= 6; count ++ ) {
			const counts = generateFlowersData( { ...options, count } ).lods.map( triangleCount );
			expect( counts.slice( 1 ).every( ( value, index ) => value < counts[ index ]! ) ).toBe( true );
		}

		for ( const index of [ 3, 4 ] ) {
			expect( data.parts[ index ]!.impostorFade ).toBe( false );
			expect( data.parts[ index ]!.upNormalCards ).toBe( true );
		}
		expect( data.parts[ 3 ]!.impostorViews ).toHaveLength( 2 );
		expect( data.parts[ 4 ]!.impostorViews ).toHaveLength( 1 );
		expect( lod3!.impostorCard.every( ( card ) => card === 0 ) ).toBe( true );
		expect( lod4!.impostorCard.every( ( card ) => card === 0 ) ).toBe( true );

		const petalColor = 0xa98bd6;
		const centerColor = 0xff00ff;
		const stemColor = 0x81603d;
		const recolored = generateFlowersData( { ...options, petalColor, centerColor, stemColor } );
		expect( areByteIdentical( plantCard.data, recolored.textures.plantCard!.data ) ).toBe( false );
		const regenerated = generateFlowersData( options );
		regenerateFlowersPetalTexture( regenerated, petalColor );
		regenerateFlowersStemTexture( regenerated, stemColor );
		expect( areByteIdentical( regenerated.textures.plantCard!.data, generateFlowersData( { ...options, petalColor, stemColor } ).textures.plantCard!.data ) ).toBe( true );
		const prepared = prepareVegetationAsset( generateFlowersData( options ), { petal: petalColor, stem: stemColor }, 128 );
		expect( areByteIdentical( prepared.data.textures.plantCard!.data, generateFlowersData( { ...options, petalColor, stemColor } ).textures.plantCard!.data ) ).toBe( true );
		const originalPrepared = prepareVegetationAsset( generateFlowersData( options ), {}, 128 );
		const fullyRecoloredPrepared = prepareVegetationAsset( recolored, {}, 128 );
		for ( const texture of [ 'impostor-lod3', 'impostor' ] ) {
			expect( areByteIdentical( prepared.impostorTextures[ texture ]!.data, originalPrepared.impostorTextures[ texture ]!.data ) ).toBe( false );
			expect( areByteIdentical( fullyRecoloredPrepared.impostorTextures[ texture ]!.data, originalPrepared.impostorTextures[ texture ]!.data ) ).toBe( false );
		}

	} );

	it( 'matches the calla leaf alpha silhouette from front, side, and 45-degree views', () => {

		const seeds = [ 1, 5, 7, 11, 23 ];
		const viewOffsets = [ 0, Math.PI / 4, Math.PI / 2 ];
		const totals = viewOffsets.map( () => ( { lod0: { width: 0, reach: 0, height: 0, coverage: 0 }, lod1: { width: 0, reach: 0, height: 0, coverage: 0 }, lod2: { width: 0, reach: 0, height: 0, coverage: 0 } } ) );
		for ( const seed of seeds ) {
			const data = generateFlowersData( { seed, variety: 'calla', count: 1 } );
			const lod1 = data.lods[ 1 ]!;
			const firstCardGroup = lod1.groups.find( ( group ) => group.partIndex === 2 )!;
			const firstTriangle = lod1.indices.slice( firstCardGroup.start, firstCardGroup.start + 3 );
			const left = vertexPosition( lod1, firstTriangle[ 0 ]! );
			const right = vertexPosition( lod1, firstTriangle[ 1 ]! );
			const root: [ number, number, number ] = [ ( left[ 0 ] + right[ 0 ] ) * 0.5, 0, ( left[ 2 ] + right[ 2 ] ) * 0.5 ];
			const cardAxis = Math.atan2( right[ 2 ] - left[ 2 ], right[ 0 ] - left[ 0 ] );
			for ( let view = 0; view < viewOffsets.length; view ++ ) {
				const angle = cardAxis + viewOffsets[ view ]!;
				const reference = projectedCallaLeafSilhouette( data.lods[ 0 ]!, angle, root );
				const lod1Silhouette = projectedCallaLeafSilhouette( lod1, angle, root, data.textures.plantCard! );
				const lod2Silhouette = projectedCallaLeafSilhouette( data.lods[ 2 ]!, angle, root, data.textures.plantCard! );
				for ( const [ name, measured ] of [ [ 'lod0', reference ], [ 'lod1', lod1Silhouette ], [ 'lod2', lod2Silhouette ] ] as const ) {
					totals[ view ]![ name ].width += measured.width / seeds.length;
					totals[ view ]![ name ].reach += measured.reach / seeds.length;
					totals[ view ]![ name ].height += measured.height / seeds.length;
					totals[ view ]![ name ].coverage += measured.coverage / seeds.length;
				}
			}
		}

		for ( const view of totals ) {
			for ( const name of [ 'lod1', 'lod2' ] as const ) {
				for ( const measurement of [ 'width', 'reach' ] as const ) {
					expect( Math.abs( view[ name ][ measurement ] / view.lod0[ measurement ] - 1 ) ).toBeLessThan( 0.23 );
				}
				expect( Math.abs( view[ name ].height / view.lod0.height - 1 ) ).toBeLessThan( 0.12 );
				expect( Math.abs( view[ name ].coverage / view.lod0.coverage - 1 ) ).toBeLessThan( 0.25 );
			}
		}

	} );

	it( 'uses a shared top-baked primrose dome at LOD2/3', () => {

		const data = generateFlowersData( { seed: 5, variety: 'primrose' } );
		const [ lod0, lod1, lod2, lod3, lod4 ] = data.lods;
		const topView = LOD4_IMPOSTOR_VIEWS[ 1 ]!;
		const window = getImpostorProjectionWindow( data.bounds, lod0!, topView );
		expect( data.lods.map( triangleCount ) ).toEqual( [ 80, 36, 33, 7, 4 ] );
		expect( triangleCount( lod1! ) ).toBeGreaterThan( triangleCount( lod2! ) );
		expect( triangleCount( lod2! ) ).toBeGreaterThan( triangleCount( lod3! ) );
		expect( triangleCount( lod3! ) ).toBeGreaterThan( triangleCount( lod4! ) );
		expect( lod2!.groups ).toHaveLength( 1 );
		expect( lod3!.groups ).toHaveLength( 1 );
		expect( lod2!.groups[ 0 ]!.partIndex ).toBe( 2 );
		expect( lod3!.groups[ 0 ]!.partIndex ).toBe( 2 );
		expect( Math.min( ...Array.from( { length: lod2!.positions.length / 3 }, ( _, vertex ) => lod2!.positions[ vertex * 3 + 1 ]! ) ) ).toBe( 0 );
		expect( maximumY( lod2! ) ).toBeCloseTo( data.bounds.height, 6 );
		expect( data.parts[ 2 ]!.impostorViews ).toEqual( [ topView ] );
		expect( data.parts[ 2 ]!.upNormalCards ).toBeUndefined();
		expect( data.parts[ 2 ]!.doubleSided ).toBe( false );
		expect( data.parts[ 3 ]!.impostorFade ).toBe( false );
		expect( data.parts[ 3 ]!.impostorViews ).toHaveLength( 2 );

		const footprint = { minX: window.minRight, maxX: window.maxRight, minZ: - window.maxUp, maxZ: - window.minUp };
		for ( const mesh of [ lod2!, lod3! ] ) {
			for ( let vertex = 0; vertex < mesh.positions.length / 3; vertex ++ ) {
				const x = mesh.positions[ vertex * 3 ]!;
				const z = mesh.positions[ vertex * 3 + 2 ]!;
				expect( mesh.uvs[ vertex * 2 ] ).toBeCloseTo( ( x - window.minRight ) / ( window.maxRight - window.minRight ), 6 );
				expect( mesh.uvs[ vertex * 2 + 1 ] ).toBeCloseTo( ( - z - window.minUp ) / ( window.maxUp - window.minUp ), 6 );
			}
		}
		for ( const mesh of [ lod2!, lod3! ] ) {
			expect( Math.min( ...Array.from( { length: mesh.positions.length / 3 }, ( _, vertex ) => mesh.positions[ vertex * 3 ]! ) ) ).toBeCloseTo( footprint.minX, 6 );
			expect( Math.max( ...Array.from( { length: mesh.positions.length / 3 }, ( _, vertex ) => mesh.positions[ vertex * 3 ]! ) ) ).toBeCloseTo( footprint.maxX, 6 );
			expect( Math.min( ...Array.from( { length: mesh.positions.length / 3 }, ( _, vertex ) => mesh.positions[ vertex * 3 + 2 ]! ) ) ).toBeCloseTo( footprint.minZ, 6 );
			expect( Math.max( ...Array.from( { length: mesh.positions.length / 3 }, ( _, vertex ) => mesh.positions[ vertex * 3 + 2 ]! ) ) ).toBeCloseTo( footprint.maxZ, 6 );
			for ( let offset = 0; offset < mesh.normals.length; offset += 3 ) {
				const normal = [ mesh.normals[ offset ]!, mesh.normals[ offset + 1 ]!, mesh.normals[ offset + 2 ]! ];
				expect( Math.hypot( ...normal ) ).toBeCloseTo( 1, 5 );
				expect( normal[ 1 ] ).toBeGreaterThan( 0 );
			}
			for ( let index = 0; index < mesh.indices.length; index += 3 ) {
				const first = vertexPosition( mesh, mesh.indices[ index ]! );
				const second = vertexPosition( mesh, mesh.indices[ index + 1 ]! );
				const third = vertexPosition( mesh, mesh.indices[ index + 2 ]! );
				const geometricNormalY = ( second[ 2 ] - first[ 2 ] ) * ( third[ 0 ] - first[ 0 ] ) - ( second[ 0 ] - first[ 0 ] ) * ( third[ 2 ] - first[ 2 ] );
				expect( geometricNormalY ).toBeGreaterThan( 0 );
			}
		}

		const prepared = prepareVegetationAsset( data, {}, 128 );
		const topTexture = prepared.impostorTextures[ 'impostor-lod3' ]!;
		expect( topTexture.width ).toBe( 128 );
		expect( topTexture.height ).toBe( 128 );
		expect( [ ...topTexture.data.filter( ( _value, index ) => index % 4 === 3 ) ].some( ( alpha ) => alpha > 0 ) ).toBe( true );

		const horizontal = Array.from( { length: lod4!.impostorCard.length }, ( _, vertex ) => vertex ).filter( ( vertex ) => lod4!.impostorCard[ vertex ] === 1 );
		expect( horizontal ).toHaveLength( 4 );
		for ( const vertex of horizontal ) expect( lod4!.positions[ vertex * 3 + 1 ] ).toBeCloseTo( data.bounds.height * 0.55, 6 );

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
				if ( lod === 0 ) expect( vertexCount( first.lods[ lod ]! ) ).toBeLessThanOrEqual( variety === 'bluebell' ? 340 : 150 );
				if ( lod === 1 ) expect( vertexCount( first.lods[ lod ]! ) ).toBeLessThanOrEqual( variety === 'calla' ? 120 : variety === 'bluebell' ? 150 : 78 );
			}
			expect( triangles.slice( 1 ).every( ( value, index ) => value < triangles[ index ]! ) ).toBe( true );
			expect( areByteIdentical( first.textures.petal!.data, second.textures.petal!.data ) ).toBe( true );
			expect( areByteIdentical( first.textures.stem!.data, second.textures.stem!.data ) ).toBe( true );

		} );

	}

	it( 'keeps the captured bluebell LOD0 byte-for-byte as LOD1', async () => {

		const data = generateFlowersData( { seed: 1, variety: 'bluebell' } );
		const hash = async ( bytes: ArrayBufferView ) => {
			const source = new Uint8Array( bytes.buffer, bytes.byteOffset, bytes.byteLength );
			const digest = await globalThis.crypto.subtle.digest( 'SHA-256', Uint8Array.from( source ) );
			return Array.from( new Uint8Array( digest ), ( value ) => value.toString( 16 ).padStart( 2, '0' ) ).join( '' );
		};
		const expectedMesh = {
			positions: '086941e4f92ec0d1540ca5ebc72cbd059c200808cb95b338376214e6fe6c1f75',
			normals: 'cba4e76064d6adda28439decc52b63f562c496bdea2cc18e87e70227a3cd0804',
			uvs: '2793eb2df9ce8f1f4d514b07baa788972b577a2c2a72f70c655457bdc2ec9d24',
			colors: '0ea47d33ef3e8d0d7838045b87de63fbfe65ce211faf6d5802fe7a7384718d7f',
			windWeight: 'f16f07186490db5bd100c063ea125d1e8be481377d221f01e8319395af4fc705',
			impostorCard: '1a0295f4bf5986c5f74eca9153a6a4cb10b073a01a76ba4a457fd862c78966a4',
			indices: 'd780f3f6b368b1e9fc08f5b4f30290e795b3ec1fdfa7f1959ea83f2fe28452b8',
		};
		const lod1 = data.lods[ 1]!;
		for ( const [ field, expected ] of Object.entries( expectedMesh ) as [ keyof typeof expectedMesh, string ][] ) expect( await hash( lod1[ field ] ) ).toBe( expected );
		expect( lod1.groups ).toEqual( [ { start: 0, count: 90, partIndex: 0 }, { start: 90, count: 162, partIndex: 1 } ] );
		expect( await hash( data.textures.petal!.data ) ).toBe( 'b8f9fd6d61a46f5e6433a7b76f933e4801007589b71a91bdeca9d19ed5e58d5b' );
		expect( await hash( data.textures.stem!.data ) ).toBe( '2107c4a996a6437f7bdc891781e8f25e84c7e51ff4f2aa0d932e864a25d93288' );
		expect( [ data.textures.petal!.width, data.textures.petal!.height ] ).toEqual( [ 128, 128 ] );
		expect( [ data.textures.stem!.width, data.textures.stem!.height ] ).toEqual( [ 128, 256 ] );

	} );

	it( 'keeps bluebell LOD triangle budgets decreasing for counts one through six', () => {

		const defaultData = generateFlowersData( { seed: 1, variety: 'bluebell' } );
		const defaultTriangles = defaultData.lods.map( triangleCount );
		expect( defaultTriangles ).toEqual( [ 216, 84, 81, 8, 2 ] );
		expect( defaultTriangles[ 0 ] ).toBeGreaterThan( defaultTriangles[ 1 ]! * 1.5 );
		// 花柄を交差 2 枚にしたぶん、LOD1 の 2.5 倍を少し超える。
		expect( defaultTriangles[ 0 ] ).toBeLessThanOrEqual( defaultTriangles[ 1 ]! * 2.6 );
		for ( let count = 1; count <= 6; count ++ ) {
			const triangles = generateFlowersData( { seed: 1, variety: 'bluebell', count } ).lods.map( triangleCount );
			expect( triangles ).toEqual( [ 72 * count, 28 * count, 27 * count, 8, 2 ] );
			expect( triangles.slice( 1 ).every( ( value, index ) => value < triangles[ index ]! ) ).toBe( true );
		}

	} );

	it( 'keeps the bluebell LOD2 silhouette close to the new LOD0 from front and side', () => {

		const data = generateFlowersData( { seed: 5, variety: 'bluebell', count: 1 } );
		const lod0 = data.lods[ 0]!;
		const lod2 = data.lods[ 2]!;
		// 細い茎と小さな釣り鐘が主なので IoU の絶対値は低い。
		for ( const angle of [ 0, Math.PI / 2 ] ) {
			const bounds = projectedFlowerBounds( [ lod0, lod2 ], angle );
			const lod0Mask = projectedFlowerSilhouette( data, lod0, angle, bounds );
			const lod2Mask = projectedFlowerSilhouette( data, lod2, angle, bounds );
			const lod2Iou = projectedFlowerIou( lod0Mask, lod2Mask );
			expect( lod2Iou ).toBeGreaterThan( 0.3 );
		}

	} );

	it( 'builds bluebell LOD3 from two subdivided vertical cards and LOD4 as a lone camera-facing card', () => {

		const data = generateFlowersData( { seed: 5, variety: 'bluebell' } );
		const lod3 = data.lods[ 3]!;
		const lod4 = data.lods[ 4]!;
		const [ lod3Part, lod4Part ] = data.parts.slice( 2 );
		expect( triangleCount( lod3 ) ).toBe( 8 );
		expect( lod3.impostorCard.every( ( card ) => card === 0 ) ).toBe( true );
		expect( lod3.positions.length / 3 ).toBe( 12 );
		for ( let vertex = 0; vertex < 6; vertex ++ ) expect( lod3.positions[ vertex * 3 + 2 ] ).toBeCloseTo( 0, 6 );
		for ( let vertex = 6; vertex < 12; vertex ++ ) expect( lod3.positions[ vertex * 3 ] ).toBeCloseTo( 0, 6 );
		expect( lod3Part!.impostorFade ).toBe( false );
		expect( lod3Part!.upNormalCards ).toBe( true );
		expect( lod3Part!.impostorViews ).toHaveLength( 2 );
		expect( lod3Part!.impostorViews![ 0 ]!.direction ).toEqual( [ 0, 0, 1 ] );
		expect( lod3Part!.impostorViews![ 1 ]!.direction[ 0 ] ).toBeCloseTo( 1, 6 );
		expect( lod3Part!.impostorViews![ 1 ]!.direction[ 2 ] ).toBeCloseTo( 0, 6 );
		expect( triangleCount( lod4 ) ).toBe( 2 );
		expect( new Set( lod4.impostorCard ) ).toEqual( new Set( [ 0 ] ) );
		expect( lod4Part!.upNormalCards ).toBe( true );
		expect( lod4Part!.impostorFade ).toBe( false );
		expect( lod4Part!.impostorViews ).toHaveLength( 1 );

	} );

	it( 'recolors bluebell petals, pedicels, stems, and their baked impostors', () => {

		const defaults = generateFlowersData( { seed: 7, variety: 'bluebell' } );
		const petal = generateFlowersData( { seed: 7, variety: 'bluebell', petalColor: 0xa98bd6 } );
		const center = generateFlowersData( { seed: 7, variety: 'bluebell', centerColor: 0xff00ff } );
		const stem = generateFlowersData( { seed: 7, variety: 'bluebell', stemColor: 0x81603d } );
		const defaultPrepared = prepareVegetationAsset( defaults, {}, 128 );
		for ( const recolored of [ petal, center, stem ] ) {
			const prepared = prepareVegetationAsset( recolored, {}, 128 );
			expect( areByteIdentical( prepared.impostorTextures[ 'impostor-lod3' ]!.data, defaultPrepared.impostorTextures[ 'impostor-lod3' ]!.data ) ).toBe( false );
			expect( areByteIdentical( prepared.impostorTextures.impostor!.data, defaultPrepared.impostorTextures.impostor!.data ) ).toBe( false );
		}
		expect( areByteIdentical( petal.textures.petal!.data, defaults.textures.petal!.data ) ).toBe( false );
		expect( areByteIdentical( center.textures.petal!.data, defaults.textures.petal!.data ) ).toBe( false );
		expect( areByteIdentical( stem.textures.stem!.data, defaults.textures.stem!.data ) ).toBe( false );
		expect( areByteIdentical( stem.textures.petal!.data, defaults.textures.petal!.data ) ).toBe( true );

	} );

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
			const pixels = Object.entries( data.textures ).filter( ( [ name ] ) => name !== 'plantCard' ).reduce( ( sum, [ , texture ] ) => sum + texture.width * texture.height, 0 );
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

	it( 'uses curved crossed plant cards for tulip LOD1/2 and keeps the flower size and color layers', () => {

		const options = { seed: 5, variety: 'tulip' as const };
		const data = generateFlowersData( options );
		const lod0 = data.lods[ 0 ]!;
		const lod1 = data.lods[ 1 ]!;
		const lod2 = data.lods[ 2 ]!;
		const lod3 = data.lods[ 3 ]!;
		const lod4 = data.lods[ 4 ]!;
		const texture = data.textures.plantCard!;

		expect( data.parts.map( ( part ) => part.name ) ).toEqual( [ 'petal', 'stem', 'plantCard', 'impostor-lod3', 'impostor' ] );
		expect( [ lod0, lod1, lod2, lod3, lod4 ].map( triangleCount ) ).toEqual( [ 88, 32, 24, 4, 2 ] );
		expect( [ lod1, lod2 ].every( ( mesh ) => mesh.groups.every( ( group ) => group.partIndex === 2 ) ) ).toBe( true );
		expect( texture.width ).toBe( FLOWERS_PETAL_TEXTURE_SIZE );
		expect( texture.height ).toBeLessThan( 512 );

		for ( const [ mesh, segments ] of [ [ lod1, 2 ], [ lod2, 1 ] ] as const ) {
			const verticesPerCard = ( segments + 1 ) * 2;
			const firstCardWidth = Math.hypot(
				mesh.positions[ 0 ]! - mesh.positions[ 3 ]!,
				mesh.positions[ 2 ]! - mesh.positions[ 5 ]!,
			);
			const secondCard = verticesPerCard + ( segments === 1 ? 1 : 0 );
			const secondCardWidth = Math.hypot(
				mesh.positions[ secondCard * 3 ]! - mesh.positions[ ( secondCard + 1 ) * 3 ]!,
				mesh.positions[ secondCard * 3 + 2 ]! - mesh.positions[ ( secondCard + 1 ) * 3 + 2 ]!,
			);
			expect( firstCardWidth ).toBeCloseTo( 0.18, 6 );
			expect( secondCardWidth ).toBeCloseTo( 0.18, 6 );

			const firstCardVertex = 0;
			const top = cardRowCenter( mesh, firstCardVertex, segments );
			const bloomBottom = cardRowCenter( mesh, firstCardVertex, segments === 2 ? 1 : 0 );
			const stemTip = cardRowCenter( lod0, 18 * 4, 2 );
			const petalTopCenters = [ 0, 1, 2 ].map( ( petal ) => {
				const first = petal * 6 + 4;
				return [
					( lod0.positions[ first * 3 ]! + lod0.positions[ ( first + 1 ) * 3 ]! ) * 0.5,
					( lod0.positions[ first * 3 + 1 ]! + lod0.positions[ ( first + 1 ) * 3 + 1 ]! ) * 0.5,
					( lod0.positions[ first * 3 + 2 ]! + lod0.positions[ ( first + 1 ) * 3 + 2 ]! ) * 0.5,
				];
			} );
			const flowerCenter = [ 0, 1, 2 ].map( ( axis ) => petalTopCenters.reduce( ( sum, center ) => sum + center[ axis ]!, 0 ) / petalTopCenters.length );

			expect( top[ 0 ] ).toBeCloseTo( flowerCenter[ 0 ]!, 6 );
			expect( top[ 1 ] ).toBeCloseTo( flowerCenter[ 1 ]!, 6 );
			expect( top[ 2 ] ).toBeCloseTo( flowerCenter[ 2 ]!, 6 );
			if ( segments === 2 ) {
				expect( bloomBottom[ 0 ] ).toBeCloseTo( stemTip[ 0 ], 6 );
				expect( bloomBottom[ 1 ] ).toBeCloseTo( stemTip[ 1 ], 6 );
				expect( bloomBottom[ 2 ] ).toBeCloseTo( stemTip[ 2 ], 6 );
			}
		}

		let minPetalX = texture.width;
		let maxPetalX = - 1;
		let minPetalY = texture.height;
		let maxPetalY = - 1;
		for ( let y = FLOWERS_STEM_TEXTURE_HEIGHT; y < texture.height; y ++ ) {
			for ( let x = 0; x < texture.width; x ++ ) {
				if ( texture.data[ ( y * texture.width + x ) * 4 + 3 ] === 0 ) continue;
				minPetalX = Math.min( minPetalX, x );
				maxPetalX = Math.max( maxPetalX, x );
				minPetalY = Math.min( minPetalY, y );
				maxPetalY = Math.max( maxPetalY, y );
			}
		}
		expect( ( maxPetalX - minPetalX + 1 ) / texture.width * 0.18 ).toBeCloseTo( 0.052, 1 );
		expect( ( maxPetalY - minPetalY + 1 ) / texture.height * data.bounds.height ).toBeCloseTo( 0.06, 1 );

		const originalCard = texture.data.slice();
		const petalColor = 0xa98bd6;
		const stemColor = 0x81603d;
		regenerateFlowersPetalTexture( data, petalColor );
		expect( areByteIdentical( data.textures.plantCard!.data, originalCard ) ).toBe( false );
		regenerateFlowersStemTexture( data, stemColor );
		const recolored = generateFlowersData( { ...options, petalColor, stemColor } );
		expect( areByteIdentical( data.textures.plantCard!.data, recolored.textures.plantCard!.data ) ).toBe( true );
		expect( areByteIdentical( data.textures.petal!.data, recolored.textures.petal!.data ) ).toBe( true );
		expect( areByteIdentical( data.textures.stem!.data, recolored.textures.stem!.data ) ).toBe( true );

		expect( data.parts[ 3 ]!.impostorFade ).toBe( false );
		expect( data.parts[ 3 ]!.upNormalCards ).toBe( true );
		expect( data.parts[ 3 ]!.impostorViews ).toHaveLength( 2 );
		expect( data.parts[ 4 ]!.impostorFade ).toBe( false );
		expect( data.parts[ 4 ]!.upNormalCards ).toBe( true );
		expect( data.parts[ 4 ]!.impostorViews ).toHaveLength( 1 );
		expect( [ lod0, lod1, lod2, lod3, lod4 ].slice( 1 ).every( ( mesh, index ) => triangleCount( mesh ) < triangleCount( [ lod0, lod1, lod2, lod3, lod4 ][ index ]! ) ) ).toBe( true );
		const singlePlant = generateFlowersData( { ...options, count: 1 } ).lods;
		expect( singlePlant.map( triangleCount ) ).toEqual( [ 22, 8, 6, 4, 2 ] );
		expect( singlePlant.slice( 1 ).every( ( mesh, index ) => triangleCount( mesh ) < triangleCount( singlePlant[ index ]! ) ) ).toBe( true );

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
			{ variety: 'bluebell' as const, segments: 4 },
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
		// 釣り鐘 1 つ: 交差 2 枚の花柄（4 三角形）と 6 角の釣り鐘（6 三角形）。
		expect( bluebellPetal.count / 3 ).toBe( 5 * 10 * 3 );
		const bluebellCupTriangles = Array.from( { length: 5 }, ( _, bell ) => bluebellPetal.start + ( bell * 10 + 4 ) * 3 );
		for ( const triangleStart of bluebellCupTriangles ) {
			const top = bluebell.positions[ bluebell.indices[ triangleStart ]! * 3 + 1 ]!;
			const rimA = bluebell.positions[ bluebell.indices[ triangleStart + 1 ]! * 3 + 1 ]!;
			const rimB = bluebell.positions[ bluebell.indices[ triangleStart + 2 ]! * 3 + 1 ]!;
			// 釣り鐘は LOD1 と同じ高さ約 3.4 cm。口は頭より 2.5 cm 以上下にある。
			expect( Math.min( rimA, rimB ) ).toBeLessThan( top - 0.025 );
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

			const data = generateFlowersData( { seed: 7, variety } );
			const lods = data.lods;
			if ( variety === 'primrose' ) {
				expect( data.parts.filter( ( _part, index ) => index !== 2 ).every( ( part ) => part.upNormalCards === true ) ).toBe( true );
				expect( data.parts[ 2 ]!.upNormalCards ).toBeUndefined();
				for ( let lod = 0; lod < lods.length; lod ++ ) {
					for ( const group of lods[ lod ]!.groups ) {
						if ( ( lod === 2 || lod === 3 ) && group.partIndex === 2 ) continue;
						expect( data.parts[ group.partIndex ]!.upNormalCards ).toBe( true );
					}
					if ( lod === 2 || lod === 3 ) {
						for ( let offset = 0; offset < lods[ lod ]!.normals.length; offset += 3 ) {
							const normal = [ lods[ lod ]!.normals[ offset ]!, lods[ lod ]!.normals[ offset + 1 ]!, lods[ lod ]!.normals[ offset + 2 ]! ];
							expect( Math.hypot( ...normal ) ).toBeCloseTo( 1, 5 );
							expect( normal[ 1 ] ).toBeGreaterThan( 0 );
						}
						expect( [ ...lods[ lod ]!.normals ].some( ( value, index ) => index % 3 === 1 ? value < 0.99 : Math.abs( value ) > 0.01 ) ).toBe( true );
					} else {
						expect( [ ...lods[ lod ]!.normals ].every( ( value, index ) => index % 3 === 1 ? value === 1 : value === 0 ) ).toBe( true );
					}
				}
			} else {
				expect( data.parts.every( ( part ) => part.upNormalCards === true ) ).toBe( true );
				for ( const mesh of lods ) for ( const group of mesh.groups ) expect( data.parts[ group.partIndex ]!.upNormalCards ).toBe( true );
				for ( const mesh of lods ) expect( [ ...mesh.normals ].every( ( value, index ) => index % 3 === 1 ? value === 1 : value === 0 ) ).toBe( true );
			}
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

	it( 'keeps the daisy top cards at mean head height and draws all impostor planes', () => {

		const data = generateFlowersData( { seed: 5, variety: 'daisy' } );
		const lod0 = data.lods[ 0 ]!;
		const lod3 = data.lods[ 3 ]!;
		const lod4 = data.lods[ 4 ]!;
		const headHeight = Array.from( { length: 6 }, ( _, plant ) => lod0.positions[ plant * 5 * 3 + 1 ]! ).reduce( ( sum, height ) => sum + height, 0 ) / 6;
		const horizontalVertices = ( mesh: MeshData ) => Array.from( { length: mesh.impostorCard.length }, ( _, vertex ) => vertex ).filter( ( vertex ) => mesh.impostorCard[ vertex ] === 1 );
		const lod3Top = horizontalVertices( lod3 );
		const lod4Top = horizontalVertices( lod4 );

		expect( triangleCount( lod3 ) ).toBe( 6 );
		expect( lod3.impostorCard.filter( ( card ) => card === 0 ) ).toHaveLength( 8 );
		expect( lod3Top ).toHaveLength( 4 );
		expect( triangleCount( lod4 ) ).toBe( 4 );
		expect( lod4.impostorCard.filter( ( card ) => card === 0 ) ).toHaveLength( 4 );
		expect( lod4Top ).toHaveLength( 4 );
		for ( const vertex of lod3Top ) expect( lod3.positions[ vertex * 3 + 1 ] ).toBeCloseTo( headHeight, 6 );
		for ( const vertex of lod4Top ) expect( lod4.positions[ vertex * 3 + 1 ] ).toBeCloseTo( headHeight, 6 );

		const expectedFootprint = footprintAtHeight( lod0, headHeight );
		for ( const [ mesh, vertices ] of [ [ lod3, lod3Top ], [ lod4, lod4Top ] ] as const ) {
			const actual = {
				minX: Math.min( ...vertices.map( ( vertex ) => mesh.positions[ vertex * 3 ]! ) ),
				maxX: Math.max( ...vertices.map( ( vertex ) => mesh.positions[ vertex * 3 ]! ) ),
				minZ: Math.min( ...vertices.map( ( vertex ) => mesh.positions[ vertex * 3 + 2 ]! ) ),
				maxZ: Math.max( ...vertices.map( ( vertex ) => mesh.positions[ vertex * 3 + 2 ]! ) ),
			};
			expect( actual.minX ).toBeCloseTo( expectedFootprint.minX, 6 );
			expect( actual.maxX ).toBeCloseTo( expectedFootprint.maxX, 6 );
			expect( actual.minZ ).toBeCloseTo( expectedFootprint.minZ, 6 );
			expect( actual.maxZ ).toBeCloseTo( expectedFootprint.maxZ, 6 );
		}

		expect( data.parts[ 2 ]!.impostorFade ).toBe( false );
		expect( data.parts[ 2 ]!.impostorViews ).toHaveLength( 3 );
		expect( data.parts[ 3 ]!.impostorFade ).toBe( false );
		expect( data.parts[ 3 ]!.impostorViews ).toHaveLength( 2 );

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

			const textureKey = variety === 'allium' || variety === 'calla' ? 'plantCard' : 'petal';
			const first = generateFlowersData( { seed: 5, variety } ).textures[ textureKey ]!;
			const changed = generateFlowersData( { seed: 5, variety, centerColor: 0xff00ff } ).textures[ textureKey ]!;
			const alpha = new Set<number>();
			for ( let index = 3; index < first.data.length; index += 4 ) alpha.add( first.data[ index ]! );

			// tulip だけ centerColor を使わない（bluebell は花柄の色に使う）。
			expect( areByteIdentical( first.data, changed.data ) ).toBe( variety === 'tulip' );
			if ( variety !== 'tulip' ) expect( [ ...alpha ].some( ( value ) => value > 0 && value < 255 ) ).toBe( true );
			if ( variety === 'allium' ) expect( first.width ).toBe( ALLIUM_PLANT_CARD_TEXTURE_WIDTH );
			else if ( variety === 'calla' ) expect( first.width ).toBe( CALLA_PLANT_CARD_TEXTURE_WIDTH );
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
