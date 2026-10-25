import { describe, expect, it } from 'vitest';
import { bakeImpostor, buildBillboard, hexToLinear, impostorPart, linearToSrgbByte, LOD3_IMPOSTOR_YAW_ANGLES } from '../../src/core';
import { generateTreeData } from '../../src/core';
import type { MeshData } from '../../src/core';
import { validateMeshData } from '../helpers/validateMeshData';

function triangleCount( mesh: { indices: Uint32Array } ): number {

	return mesh.indices.length / 3;

}

function vertexCount( mesh: { positions: Float32Array } ): number {

	return mesh.positions.length / 3;

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

	for ( let index = group.start; index < group.start + group.count; index += 3 ) {

		const triangle = [ mesh.indices[ index ]!, mesh.indices[ index + 1 ]!, mesh.indices[ index + 2 ]! ];

		for ( let edgeIndex = 0; edgeIndex < 3; edgeIndex ++ ) {

			const first = triangle[ edgeIndex ]!;
			const second = triangle[ ( edgeIndex + 1 ) % 3 ]!;
			const edge: [ number, number ] = first < second ? [ first, second ] : [ second, first ];
			const key = `${ edge[ 0 ] }:${ edge[ 1 ] }`;
			const existing = counts.get( key );

			if ( existing === undefined ) counts.set( key, { edge, count: 1 } );
			else existing.count ++;

		}

	}

	return [ ...counts.values() ].filter( ( value ) => value.count === 1 ).map( ( value ) => value.edge );

}

function defaultColors( data: ReturnType<typeof generateTreeData> ): [ number, number, number ][] {

	return data.parts.map( ( part ) => hexToLinear( part.defaultColor ) );

}

function leafGroup( mesh: MeshData ) {

	return mesh.groups.find( ( group ) => group.partIndex === 1 )!;

}

function lodFrondRoot( mesh: MeshData, lod: number, frondIndex: number ): [ number, number, number ] {

	const leaves = leafGroup( mesh );
	const indicesPerFrond = lod === 0 ? 24 : lod === 1 ? 12 : 6;
	const first = mesh.indices[ leaves.start + frondIndex * indicesPerFrond ]!;
	const firstOffset = first * 3;

	if ( lod === 2 ) {

		const secondOffset = ( first + 1 ) * 3;

		return [
			( mesh.positions[ firstOffset ]! + mesh.positions[ secondOffset ]! ) * 0.5,
			( mesh.positions[ firstOffset + 1 ]! + mesh.positions[ secondOffset + 1 ]! ) * 0.5,
			( mesh.positions[ firstOffset + 2 ]! + mesh.positions[ secondOffset + 2 ]! ) * 0.5,
		];

	}

	const centerOffset = ( first + 1 ) * 3;

	return [ mesh.positions[ centerOffset ]!, mesh.positions[ centerOffset + 1 ]!, mesh.positions[ centerOffset + 2 ]! ];

}

function lodFrondTip( mesh: MeshData, lod: number, frondIndex: number ): [ number, number, number ] {

	const leaves = leafGroup( mesh );
	const indicesPerFrond = lod === 0 ? 24 : lod === 1 ? 12 : 6;
	const first = mesh.indices[ leaves.start + frondIndex * indicesPerFrond ]!;
	const firstTipVertex = first + ( lod === 0 ? 7 : lod === 1 ? 4 : 2 );

	if ( lod === 2 ) {

		const secondOffset = ( firstTipVertex + 1 ) * 3;
		const firstOffset = firstTipVertex * 3;

		return [
			( mesh.positions[ firstOffset ]! + mesh.positions[ secondOffset ]! ) * 0.5,
			( mesh.positions[ firstOffset + 1 ]! + mesh.positions[ secondOffset + 1 ]! ) * 0.5,
			( mesh.positions[ firstOffset + 2 ]! + mesh.positions[ secondOffset + 2 ]! ) * 0.5,
		];

	}

	const offset = firstTipVertex * 3;

	return [ mesh.positions[ offset ]!, mesh.positions[ offset + 1 ]!, mesh.positions[ offset + 2 ]! ];

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

					if ( sampleX < 0 || sampleX >= tileSize || sampleY < 0 || sampleY >= tileSize ) continue;

					const firstOffset = ( sampleY * first.width + tile * tileSize + sampleX ) * 4 + 3;
					const secondOffset = ( sampleY * second.width + tile * tileSize + sampleX ) * 4 + 3;
					if ( first.data[ firstOffset ] === 255 ) firstOpaque = true;
					if ( second.data[ secondOffset ] === 255 ) secondOpaque = true;

				}

			}

			if ( firstOpaque && secondOpaque ) intersection ++;
			if ( firstOpaque || secondOpaque ) union ++;

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

	const center = texture.width / 6;
	let width = 0;

	for ( let x = Math.floor( center ) - 8; x <= Math.ceil( center ) + 8; x ++ ) {

		const offset = ( y * texture.width + x ) * 4;
		const red = texture.data[ offset ]!;
		const green = texture.data[ offset + 1 ]!;
		const blue = texture.data[ offset + 2 ]!;

		if ( texture.data[ offset + 3 ]! >= 128 && red > green + 2 && green > blue * 1.5 ) width ++;

	}

	return width;

}

function sampleFrondLuminance( texture: { width: number; height: number; data: Uint8Array }, v: number, greenTint: number ): number {

	const centerY = Math.round( v * ( texture.height - 1 ) );
	let total = 0;
	let count = 0;

	for ( let y = Math.max( 0, centerY - 1 ); y <= Math.min( texture.height - 1, centerY + 1 ); y ++ ) {

		for ( let x = 0; x < texture.width / 3; x ++ ) {

			const offset = ( y * texture.width + x ) * 4;
			const red = texture.data[ offset ]!;
			const green = texture.data[ offset + 1 ]!;
			const blue = texture.data[ offset + 2 ]!;

			if ( texture.data[ offset + 3 ]! < 128 || green <= red || green <= blue ) continue;

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

function trunkAxisAndRadiusAt( mesh: MeshData, sides: number, ringSegments: number, y: number ): { center: [ number, number ]; radius: number } {

	const ringCount = ringSegments;
	const rings: { center: [ number, number ]; y: number; radius: number }[] = [];

	for ( let ring = 0; ring <= ringCount; ring ++ ) {

		let centerX = 0;
		let centerZ = 0;
		let centerY = 0;

		for ( let side = 0; side < sides; side ++ ) {

			const vertex = ring === ringCount ? ring * sides : ring * sides + side;
			const offset = vertex * 3;
			centerX += mesh.positions[ offset ]! / sides;
			centerY += mesh.positions[ offset + 1 ]! / sides;
			centerZ += mesh.positions[ offset + 2 ]! / sides;

		}

		let radius = 0;

		for ( let side = 0; side < sides; side ++ ) {

			const vertex = ring === ringCount ? ring * sides : ring * sides + side;
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

	it( 'defaults to ten branch whorls', () => {

		const defaultTree = generateTreeData( { seed: 1 } );
		const tenWhorls = generateTreeData( { seed: 1, branchCount: 10 } );

		expect( triangleCount( defaultTree.lods[ 0 ]! ) ).toBe( triangleCount( tenWhorls.lods[ 0 ]! ) );
		expect( triangleCount( defaultTree.lods[ 0 ]! ) ).toBe( 77 + 51 * 8 );

	} );

	it( 'builds five valid, strictly decreasing LOD meshes and reference-matched parts', () => {

		const data = generateTreeData( { seed: 1 } );
		const counts = data.lods.map( triangleCount );

		expect( data.bounds.height ).toBe( 7.5 );
		expect( data.lods ).toHaveLength( 5 );
		expect( data.parts ).toHaveLength( 4 );
		expect( data.parts[ 0 ] ).toEqual( {
			name: 'bark',
			defaultColor: 0xffffff,
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
			alphaTest: 0.5,
			doubleSided: true,
			flatShading: false,
		} );
		expect( data.parts[ 3 ] ).toEqual( impostorPart() );
		expect( Object.keys( data.textures ).sort() ).toEqual( [ 'bark', 'leaf' ] );

		for ( const lod of data.lods ) validateMeshData( lod );

		expect( counts[ 0 ] ).toBeGreaterThanOrEqual( 400 );
		expect( counts[ 0 ] ).toBeLessThanOrEqual( 1000 );
		expect( counts[ 0 ] ).toBe( 77 + 51 * 8 );
		expect( counts[ 1 ] ).toBeLessThan( counts[ 0 ]! );
		expect( counts[ 1 ] ).toBeGreaterThanOrEqual( counts[ 0 ]! * 0.45 );
		expect( counts[ 1 ] ).toBeLessThanOrEqual( counts[ 0 ]! * 0.55 );
		expect( counts[ 2 ] ).toBeLessThan( counts[ 1 ]! );
		expect( counts[ 2 ] ).toBeGreaterThanOrEqual( counts[ 0 ]! * 0.2 );
		expect( counts[ 2 ] ).toBeLessThanOrEqual( counts[ 0 ]! * 0.3 );
		expect( counts[ 3 ] ).toBeLessThan( counts[ 2 ]! );
		expect( counts[ 3 ] ).toBe( 12 );
		expect( counts[ 4 ] ).toBeLessThan( counts[ 3 ]! );
		expect( counts[ 4 ] ).toBe( 2 );
		expect( data.lods[ 3 ]!.groups ).toEqual( [ { start: 0, count: 36, partIndex: 2 } ] );
		expect( data.lods[ 4 ] ).toEqual( buildBillboard( data.bounds, 3 ) );

	} );

	it( 'keeps LOD vertex counts below the reference and removes hidden trunk rings', () => {

		for ( const seed of [ 1, 2, 3, 4, 5 ] ) {

			const lods = generateTreeData( { seed } ).lods;
			const counts = lods.map( vertexCount );

			expect( counts[ 0 ] ).toBeLessThanOrEqual( 740 );
			expect( counts[ 1 ] ).toBeLessThanOrEqual( 410 );
			expect( counts[ 2 ] ).toBeLessThanOrEqual( 331 );
			expect( counts[ 0 ] ).toBeLessThanOrEqual( 795 );
			expect( counts[ 1 ] ).toBeLessThanOrEqual( 513 );
			expect( counts[ 3 ] ).toBe( 24 );
			expect( counts[ 4 ] ).toBe( 4 );
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
			{ lod: 0, trianglesPerFrond: 8, indicesPerFrond: 24, rows: 3, rowStride: 3 },
			{ lod: 1, trianglesPerFrond: 4, indicesPerFrond: 12, rows: 2, rowStride: 3 },
		];

		for ( const setting of settings ) {

			const mesh = generateTreeData( { seed: 1 } ).lods[ setting.lod ]!;
			const leaves = leafGroup( mesh );

			for ( let frond = 0; frond < frondCount( mesh, setting.trianglesPerFrond ); frond ++ ) {

				const firstVertex = mesh.indices[ leaves.start + frond * setting.indicesPerFrond ]!;
				const baseGreen = mesh.colors[ firstVertex * 3 + 1 ]!;

				for ( let row = 1; row < setting.rows; row ++ ) {

					expect( mesh.colors[ ( firstVertex + row * setting.rowStride ) * 3 + 1 ] ).toBeCloseTo( baseGreen, 5 );

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

	it( 'keeps the calibrated mean green in both LOD3 top-down crown atlas tiles', () => {

		const texture = generateTreeData( { seed: 1 } ).textures.leaf!;

		for ( const tile of [ 1, 2 ] ) {

			let total = 0;
			let count = 0;

			for ( let y = 0; y < texture.height; y ++ ) {

				for ( let x = 0; x < texture.height; x ++ ) {

					const offset = ( y * texture.width + tile * texture.height + x ) * 4;

					if ( texture.data[ offset + 3 ]! < 128 ) continue;

					total += texture.data[ offset + 1 ]!;
					count ++;

				}

			}

			expect( total / count ).toBe( 83 );

		}

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
					expect( mesh.uvs[ uvOffset ]! * 3 ).toBeCloseTo( column * 0.5, 2 );
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

	it( 'keeps every frond while reducing per-frond detail across LOD0, LOD1, and LOD2', () => {

		const data = generateTreeData( { seed: 1 } );

		expect( frondCount( data.lods[ 0 ]!, 8 ) ).toBe( 51 );
		expect( frondCount( data.lods[ 1 ]!, 4 ) ).toBe( 51 );
		expect( frondCount( data.lods[ 2 ]!, 2 ) ).toBe( 51 );
		expect( triangleCount( data.lods[ 0 ]! ) ).toBe( 485 );
		expect( triangleCount( data.lods[ 1 ]! ) ).toBe( 258 );
		expect( triangleCount( data.lods[ 2 ]! ) ).toBe( 130 );

		for ( let frond = 0; frond < 51; frond ++ ) {

			const reference = lodFrondRoot( data.lods[ 0 ]!, 0, frond );

			for ( const lod of [ 1, 2 ] ) {

				const root = lodFrondRoot( data.lods[ lod ]!, lod, frond );
				const tip = lodFrondTip( data.lods[ lod ]!, lod, frond );

				expect( Math.hypot( root[ 0 ] - reference[ 0 ], root[ 2 ] - reference[ 2 ] ) ).toBeLessThan( 0.001 );
				expect( Math.abs( root[ 1 ] - reference[ 1 ] ) ).toBeLessThan( 0.2 );
				expect( distance3( tip, lodFrondTip( data.lods[ 0 ]!, 0, frond ) ) ).toBeLessThan( 0.2 );

			}

		}

	} );

	it( 'matches LOD0 coarse silhouette coverage with a 3 px tolerance and mean color', () => {

		const data = generateTreeData( { seed: 1 } );
		const referenceCoverage = bakeLod( data, 0, false, true );
		const referenceCoverageTop = bakeLod( data, 0, true, true );
		const referenceColor = bakeLod( data, 0 );
		const referenceColorTop = bakeLod( data, 0, true );
		const tileSize = 128;
		const coveragePixelTolerance = 3;
		// 128px の輪郭差を 3px 幅で比較します。

		for ( const lod of [ 1, 2 ] ) {

			const measured = bakeLod( data, lod, false, true );
			const measuredTop = bakeLod( data, lod, true, true );
			const measuredColor = bakeLod( data, lod );
			const measuredColorTop = bakeLod( data, lod, true );
			const minimumIou = lod === 1 ? 0.88 : 0.8;

			for ( let view = 0; view < 3; view ++ ) {

				expect( coverageIou( referenceCoverage, measured, view, tileSize, coveragePixelTolerance ) ).toBeGreaterThanOrEqual( minimumIou );

				for ( const difference of meanOpaqueColorDifference( referenceColor, measuredColor, view, view, tileSize ) ) {
					expect( difference ).toBeLessThanOrEqual( 6 );
				}

			}

			expect( coverageIou( referenceCoverageTop, measuredTop, 0, tileSize, coveragePixelTolerance ) ).toBeGreaterThanOrEqual( minimumIou );

			for ( const difference of meanOpaqueColorDifference( referenceColorTop, measuredColorTop, 0, 0, tileSize ) ) {
				expect( difference ).toBeLessThanOrEqual( 6 );
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

	it( 'closes each trunk apex with a pointed tip and leaves only the base ring open', () => {

		const data = generateTreeData( { seed: 1 } );
		const sideCounts = [ 7, 6, 4 ];

		for ( let lod = 0; lod < sideCounts.length; lod ++ ) {

			const mesh = data.lods[ lod ]!;
			const bark = mesh.groups.find( ( group ) => group.partIndex === 0 )!;
			const boundary = boundaryEdges( mesh, bark );

			expect( boundary ).toHaveLength( sideCounts[ lod ]! );

			for ( const [ first, second ] of boundary ) {

				expect( Math.abs( mesh.positions[ first * 3 + 1 ]! ) ).toBeLessThan( 0.02 );
				expect( Math.abs( mesh.positions[ second * 3 + 1 ]! ) ).toBeLessThan( 0.02 );

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

	it( 'keeps a reference root flare and assigns one whorl per branchCount', () => {

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

		expect( baseRadius ).toBeCloseTo( 0.293, 2 );
		expect( triangleCount( fiveTiers.lods[ 0 ]! ) ).toBe( 77 + 26 * 8 );
		expect( triangleCount( eightTiers.lods[ 0 ]! ) ).toBe( 77 + 41 * 8 );

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
		const trunk = mesh.groups.find( ( group ) => group.partIndex === 0 )!;
		const leaves = mesh.groups.find( ( group ) => group.partIndex === 1 )!;
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
			const lod3Texture = bakeImpostor( data, colors, 128, LOD3_IMPOSTOR_YAW_ANGLES );
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

						if ( referenceOpaque && candidateOpaque ) intersection ++;
						if ( referenceOpaque || candidateOpaque ) union ++;

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
			const lod3Texture = bakeImpostor( data, colors, 128, LOD3_IMPOSTOR_YAW_ANGLES );
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

						if ( referenceOpaque && candidateOpaque ) intersection ++;
						if ( referenceOpaque || candidateOpaque ) union ++;

					}

				}

				expect( intersection / union ).toBeGreaterThanOrEqual( 0.74 );

			}

		}

	} );

	it( 'matches the textured LOD4 billboard silhouette to LOD0 in its front view', () => {

		for ( const seed of [ 1, 2, 3 ] ) {

			const data = generateTreeData( { seed } );
			const reference = bakeImpostor( data, defaultColors( data ), 128, [ 0 ] );
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
