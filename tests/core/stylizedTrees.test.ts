import { describe, expect, it } from 'vitest';
import { generateBroadleafTreeData } from '../../src/core/trees/broadleaf';
import { generateBushData } from '../../src/core/trees/bush';
import { generateFirTreeData } from '../../src/core/trees/fir';
import { generatePineTreeData } from '../../src/core/trees/pine';
import { composeFirFrondTexture, createFirFrondTextures, FIR_FROND_TEXTURE_HEIGHT, FIR_FROND_TEXTURE_WIDTH } from '../../src/core/trees/stylizedTextures';
import { generateWillowTreeData } from '../../src/core/trees/willow';
import { regenerateTexture } from '../../src/core/textureRegenerator';
import { validateMeshData } from '../helpers/validateMeshData';

// 大きなテクスチャは toEqual だと 1 要素ずつ比べて遅いので、ループで比べる。
function sameBytes( a: ArrayLike<number>, b: ArrayLike<number> ): boolean {

	if ( a.length !== b.length ) return false;
	for ( let index = 0; index < a.length; index ++ ) if ( a[ index ] !== b[ index ] ) return false;
	return true;

}

const trees = [
	{ name: 'broadleaf', generate: generateBroadleafTreeData, kind: 'broadleaf-tree', height: 6, bark: 0x8a7350, leaf: 0x4f9a2a, parts: [ 'bark', 'leaf', 'impostor-lod3', 'impostor' ], maxVertices: 800, collider: true },
	{ name: 'bush', generate: generateBushData, kind: 'bush', height: 1.3, bark: 0x6e5a40, leaf: 0x55a02e, parts: [ 'bark', 'leaf', 'impostor-lod3', 'impostor' ], maxVertices: 500, collider: false },
	{ name: 'fir', generate: generateFirTreeData, kind: 'fir-tree', height: 6, bark: 0x9a9183, leaf: 0x4b6c56, parts: [ 'bark', 'leaf', 'impostor-lod3', 'impostor' ], maxVertices: 800, collider: true },
	{ name: 'pine', generate: generatePineTreeData, kind: 'pine-tree', height: 9, bark: 0xb8653a, leaf: 0x3f8a4c, parts: [ 'bark', 'leaf', 'impostor-lod3', 'impostor' ], maxVertices: 1000, collider: true },
	{ name: 'willow', generate: generateWillowTreeData, kind: 'willow-tree', height: 7, bark: 0x6f6a45, leaf: 0x6cad3a, parts: [ 'bark', 'leaf', 'impostor-lod3', 'impostor' ], maxVertices: 900, collider: true },
];

describe( 'stylized trees', () => {

	it.each( trees )( 'generates valid $name mesh data', ( tree ) => {

		const data = tree.generate( { seed: 17 } );
		expect( data.kind ).toBe( tree.kind );
		expect( data.lods ).toHaveLength( 5 );
		expect( data.parts.map( ( part ) => part.name ) ).toEqual( tree.parts );
		expect( Number.isFinite( data.bounds.radius ) ).toBe( true );
		expect( Number.isFinite( data.bounds.height ) ).toBe( true );
		expect( data.bounds.height ).toBe( tree.height );
		expect( data.parts[ 0 ]!.defaultColor ).toBe( tree.bark );
		expect( data.parts[ 1 ]!.defaultColor ).toBe( tree.leaf );
		expect( data.collider !== null ).toBe( tree.collider );
		expect( data.lods[ 0 ]!.positions.length / 3 ).toBeLessThanOrEqual( tree.maxVertices );
		let maximumY = - Infinity;
		for ( let index = 1; index < data.lods[ 0 ]!.positions.length; index += 3 ) maximumY = Math.max( maximumY, data.lods[ 0 ]!.positions[ index ]! );
		expect( maximumY ).toBeLessThan( data.bounds.height * 1.02 );

		for ( const lod of data.lods ) validateMeshData( lod );

	} );

	it.each( trees )( 'reduces the $name detail through LOD1 and LOD2 and ends in fir-style impostors', ( tree ) => {

		const data = tree.generate( { seed: 11 } );
		const counts = data.lods.map( ( lod ) => lod.positions.length / 3 );
		expect( counts[ 1 ]! ).toBeLessThan( counts[ 0 ]! * 0.65 );
		expect( counts[ 2 ]! ).toBeLessThan( counts[ 1 ]! * 0.75 );
		// LOD3: 6 方向の縦板 + 真上の水平板、LOD4: 縦板 1 枚 + 真上の水平板（モミと同じ）。
		expect( counts[ 3 ] ).toBe( 28 );
		expect( counts[ 4 ] ).toBe( 8 );
		expect( data.lods[ 3 ]!.groups.map( ( group ) => data.parts[ group.partIndex ]!.name ) ).toEqual( [ 'impostor-lod3' ] );
		expect( data.lods[ 4 ]!.groups.map( ( group ) => data.parts[ group.partIndex ]!.name ) ).toEqual( [ 'impostor' ] );

		for ( const part of data.parts.slice( 2 ) ) {

			expect( part.impostorFade ).toBe( false );
			// 裏から見た板が黒くならないよう、裏向きの三角形を足して表として描く。
			expect( part.upNormalCards ).toBe( true );

		}

		// LOD1 / LOD2 も LOD0 と同じ樹皮と葉のパーツで描く。
		for ( const lod of data.lods.slice( 1, 3 ) ) expect( lod.groups.every( ( group ) => group.partIndex < 2 ) ).toBe( true );

	} );

	it.each( trees )( 'is deterministic for $name and changes with the seed', ( tree ) => {

		const first = tree.generate( { seed: 23 } );
		const repeated = tree.generate( { seed: 23 } );
		const changed = tree.generate( { seed: 24 } );

		for ( let lod = 0; lod < 5; lod ++ ) {
			expect( repeated.lods[ lod ]!.positions ).toEqual( first.lods[ lod ]!.positions );
			expect( repeated.lods[ lod ]!.normals ).toEqual( first.lods[ lod ]!.normals );
			expect( repeated.lods[ lod ]!.uvs ).toEqual( first.lods[ lod ]!.uvs );
			expect( repeated.lods[ lod ]!.colors ).toEqual( first.lods[ lod ]!.colors );
			expect( repeated.lods[ lod ]!.indices ).toEqual( first.lods[ lod ]!.indices );
		}

		expect( first.lods[ 0 ]!.positions ).not.toEqual( changed.lods[ 0 ]!.positions );
		expect( sameBytes( first.textures.leaf!.data, repeated.textures.leaf!.data ) ).toBe( true );
		expect( sameBytes( first.textures.bark!.data, repeated.textures.bark!.data ) ).toBe( true );

	} );

	it( 'keeps the stylized leaf texture binary and clear around its edge', () => {

		const texture = generateBroadleafTreeData( { seed: 31 } ).textures.leaf!;
		expect( texture.width ).toBe( 512 );
		expect( texture.height ).toBe( 512 );
		const alphas = new Set<number>();
		let emptyMargin = true;

		for ( let y = 0; y < texture.height; y ++ ) {
			for ( let x = 0; x < texture.width; x ++ ) {

				const alpha = texture.data[ ( y * texture.width + x ) * 4 + 3 ]!;
				alphas.add( alpha );
				if ( ( x < 4 || y < 4 || x >= texture.width - 4 || y >= texture.height - 4 ) && alpha !== 0 ) emptyMargin = false;

			}
		}

		expect( [ ...alphas ].every( ( alpha ) => alpha === 0 || alpha === 255 ) ).toBe( true );
		expect( emptyMargin ).toBe( true );

	} );

	it( 'paints a binary fir frond with a midrib that keeps its color', () => {

		const { color, normal } = createFirFrondTextures( 5, 0x3f8a55 );
		expect( [ color.width, color.height ] ).toEqual( [ FIR_FROND_TEXTURE_WIDTH, FIR_FROND_TEXTURE_HEIGHT ] );
		expect( [ normal.width, normal.height ] ).toEqual( [ color.width, color.height ] );
		const alphas = new Set<number>();
		let emptyMargin = true;

		for ( let y = 0; y < color.height; y ++ ) {
			for ( let x = 0; x < color.width; x ++ ) {

				const alpha = color.data[ ( y * color.width + x ) * 4 + 3 ]!;
				alphas.add( alpha );
				if ( ( x < 1 || y < 1 || x >= color.width - 1 || y >= color.height - 1 ) && alpha !== 0 ) emptyMargin = false;

			}
		}

		expect( [ ...alphas ].every( ( alpha ) => alpha === 0 || alpha === 255 ) ).toBe( true );
		expect( emptyMargin ).toBe( true );
		const recolored = composeFirFrondTexture( color, 0x2f8f8a );
		const center = color.width / 2;
		for ( let y = Math.round( color.height * 0.1 ); y < color.height * 0.8; y += 16 ) {
			const offset = ( y * color.width + center ) * 4;
			expect( color.data[ offset + 3 ] ).toBe( 255 );
			expect( Array.from( recolored.data.slice( offset, offset + 4 ) ) ).toEqual( Array.from( color.data.slice( offset, offset + 4 ) ) );
		}

		const changed = Array.from( color.colorPixelIndices! ).filter( ( pixel ) => recolored.data[ pixel * 4 + 1 ] !== color.data[ pixel * 4 + 1 ] || recolored.data[ pixel * 4 + 2 ] !== color.data[ pixel * 4 + 2 ] );
		expect( changed.length ).toBeGreaterThan( color.colorPixelIndices!.length * 0.9 );
		// 512 × 1024 画素あるので、画素ごとに expect を呼ばず違いの数だけ確かめる。
		let alphaChanges = 0;
		for ( let index = 3; index < color.data.length; index += 4 ) if ( recolored.data[ index ] !== color.data[ index ] ) alphaChanges ++;
		expect( alphaChanges ).toBe( 0 );
		expect( sameBytes( createFirFrondTextures( 5, 0x3f8a55 ).color.data, color.data ) ).toBe( true );

	} );

	it( 'creates a seamless painted bark texture with a normal map', () => {

		const data = generateBroadleafTreeData( { seed: 37 } );
		const texture = data.textures.bark!;
		expect( texture.width ).toBe( 256 );
		expect( texture.height ).toBe( 512 );
		expect( texture.wrap ).toBe( 'repeat' );
		expect( data.textures.barkNormal!.wrap ).toBe( 'repeat' );
		const at = ( x: number, y: number ) => texture.data[ ( y * texture.width + x ) * 4 ]!;
		// 継ぎ目をまたぐ隣接画素の差が、内側の隣接画素の差の最大を超えない。
		let insideX = 0;
		let seamX = 0;
		for ( let y = 0; y < texture.height; y ++ ) {
			for ( let x = 1; x < texture.width; x ++ ) insideX = Math.max( insideX, Math.abs( at( x, y ) - at( x - 1, y ) ) );
			seamX = Math.max( seamX, Math.abs( at( 0, y ) - at( texture.width - 1, y ) ) );
		}
		let insideY = 0;
		let seamY = 0;
		for ( let x = 0; x < texture.width; x ++ ) {
			for ( let y = 1; y < texture.height; y ++ ) insideY = Math.max( insideY, Math.abs( at( x, y ) - at( x, y - 1 ) ) );
			seamY = Math.max( seamY, Math.abs( at( x, 0 ) - at( x, texture.height - 1 ) ) );
		}
		expect( seamX ).toBeLessThanOrEqual( insideX );
		expect( seamY ).toBeLessThanOrEqual( insideY );

	} );

	it.each( trees )( 'draws the $name leaves from both sides with outward normals', ( tree ) => {

		const data = tree.generate( { seed: 5 } );
		const leaf = data.parts.find( ( part ) => part.name === 'leaf' )!;
		expect( leaf.upNormalCards ).toBe( true );
		expect( leaf.doubleSided ).toBe( false );
		expect( leaf.normalTexture ).toBe( 'leafNormal' );
		expect( data.textures.leafNormal!.width ).toBe( data.textures.leaf!.width );

	} );

	it.each( trees )( 'keeps the $name vertex count within its budget across seeds', ( tree ) => {

		for ( let seed = 1; seed <= 12; seed ++ ) expect( tree.generate( { seed } ).lods[ 0 ]!.positions.length / 3 ).toBeLessThanOrEqual( tree.maxVertices );

	} );

	it( 'keeps every fir seed under budget and inside its height', () => {

		for ( let seed = 1; seed <= 20; seed ++ ) {
			const data = generateFirTreeData( { seed } );
			const lod0 = data.lods[ 0 ]!;
			expect( lod0.positions.length / 3 ).toBeLessThan( 800 );
			let top = - Infinity;
			for ( let index = 1; index < lod0.positions.length; index += 3 ) top = Math.max( top, lod0.positions[ index ]! );
			expect( top ).toBeLessThan( data.bounds.height * 1.02 );
		}

	} );

	it( 'generates valid firs at extreme heights', () => {

		for ( const height of [ 2, 30 ] ) {
			const data = generateFirTreeData( { seed: 3, height } );
			expect( data.bounds.height ).toBe( height );
			for ( const lod of data.lods ) validateMeshData( lod );
		}

	} );

	it( 'bends the fir branches down from the trunk and up at the tips with leaves hanging on both sides', () => {

		const data = generateFirTreeData( { seed: 1 } );
		const lod0 = data.lods[ 0 ]!;
		const leafGroup = lod0.groups.find( ( group ) => group.partIndex === 1 )!;
		const leafIndices = lod0.indices.subarray( leafGroup.start, leafGroup.start + leafGroup.count );
		const firstVertex = Math.min( ...leafIndices );
		const lastVertex = Math.max( ...leafIndices );
		// LOD0 の枝は 4 断面 × 3 頂点（右・中央・左）。頂上の傘 4 本は付け根の中央を共有する（12 + 11 × 3 頂点）。
		const capVertices = 12 + 11 * 3;
		const branchCount = ( lastVertex + 1 - firstVertex - capVertices ) / 12;
		const y = ( vertex: number ) => lod0.positions[ vertex * 3 + 1 ]!;
		const scales: number[] = [];
		let lowerRadius = 0;
		let upperRadius = 0;
		expect( Number.isInteger( branchCount ) ).toBe( true );

		for ( let branch = 0; branch < branchCount; branch ++ ) {

			const vertex = firstVertex + branch * 12;
			const center = ( row: number ) => vertex + row * 3 + 1;
			// 幹からやや下向きに出て、先へ向かって上へ反る。
			expect( y( center( 1 ) ) ).toBeLessThan( y( center( 0 ) ) );
			expect( ( y( center( 3 ) ) - y( center( 2 ) ) ) / 0.3 ).toBeGreaterThan( ( y( center( 1 ) ) - y( center( 0 ) ) ) / 0.35 );
			// 葉は枝を稜線にして両側へ垂れる。
			expect( y( vertex + 3 ) ).toBeLessThan( y( center( 1 ) ) );
			expect( y( vertex + 5 ) ).toBeLessThan( y( center( 1 ) ) );
			// どの枝もテクスチャを同じ縮尺で貼る（針葉の大きさがそろう）。
			const base = center( 0 );
			const tip = center( 3 );
			const span = Math.hypot( lod0.positions[ tip * 3 ]! - lod0.positions[ base * 3 ]!, y( tip ) - y( base ), lod0.positions[ tip * 3 + 2 ]! - lod0.positions[ base * 3 + 2 ]! );
			scales.push( ( lod0.uvs[ tip * 2 + 1 ]! - lod0.uvs[ base * 2 + 1 ]! ) / span );
			const radius = Math.hypot( lod0.positions[ tip * 3 ]!, lod0.positions[ tip * 3 + 2 ]! );
			if ( y( base ) < data.bounds.height * 0.5 ) lowerRadius = Math.max( lowerRadius, radius );
			if ( y( base ) > data.bounds.height * 0.75 ) upperRadius = Math.max( upperRadius, radius );

		}

		const meanScale = scales.reduce( ( sum, scale ) => sum + scale, 0 ) / scales.length;
		for ( const scale of scales ) expect( Math.abs( scale / meanScale - 1 ) ).toBeLessThan( 0.25 );
		// 上の段ほど樹冠が細い。
		expect( lowerRadius ).toBeGreaterThan( upperRadius * 1.3 );
		// 根元の幹は葉で埋めない。
		let lowestLeaf = Infinity;
		for ( let vertex = firstVertex; vertex <= lastVertex; vertex ++ ) lowestLeaf = Math.min( lowestLeaf, y( vertex ) );
		expect( lowestLeaf ).toBeGreaterThan( data.bounds.height * 0.06 );

	} );

	it( 'keeps the fir LOD0 free of duplicated vertices', () => {

		const lod0 = generateFirTreeData( { seed: 4 } ).lods[ 0 ]!;
		const keys = new Set<string>();
		for ( let vertex = 0; vertex < lod0.positions.length / 3; vertex ++ ) {
			keys.add( [
				...Array.from( lod0.positions.subarray( vertex * 3, vertex * 3 + 3 ) ),
				...Array.from( lod0.normals.subarray( vertex * 3, vertex * 3 + 3 ) ),
				...Array.from( lod0.uvs.subarray( vertex * 2, vertex * 2 + 2 ) ),
			].map( ( value ) => value.toFixed( 5 ) ).join( ',' ) );
		}
		expect( keys.size ).toBe( lod0.positions.length / 3 );

	} );

	it( 'recolors the fir leaf texture without touching the midrib', () => {

		const data = generateFirTreeData( { seed: 2 } );
		const texture = data.textures.leaf!;
		const recolored = regenerateTexture( data, 'leaf', 0xa8c14a );
		const center = texture.width / 2;
		const midribPixel = ( Math.round( texture.height * 0.5 ) * texture.width + center ) * 4;
		expect( data.parts[ 1 ]!.colorizesTexture ).toBe( true );
		expect( Array.from( recolored.data.slice( midribPixel, midribPixel + 4 ) ) ).toEqual( Array.from( texture.data.slice( midribPixel, midribPixel + 4 ) ) );
		const changed = Array.from( texture.colorPixelIndices! ).filter( ( pixel ) => recolored.data[ pixel * 4 ] !== texture.data[ pixel * 4 ] || recolored.data[ pixel * 4 + 1 ] !== texture.data[ pixel * 4 + 1 ] || recolored.data[ pixel * 4 + 2 ] !== texture.data[ pixel * 4 + 2 ] );
		expect( changed.length ).toBeGreaterThan( texture.colorPixelIndices!.length * 0.9 );

	} );

	it( 'wraps the willow canopy texture horizontally around its bells', () => {

		const data = generateWillowTreeData( { seed: 3 } );
		const texture = data.textures.leaf!;
		expect( texture.wrapS ).toBe( 'repeat' );
		expect( texture.wrapT ).toBe( 'clamp' );
		const alphaAt = ( x: number, y: number ) => texture.data[ ( y * texture.width + x ) * 4 + 3 ]!;
		// 左右の端をまたいで葉が続く（どこかの行で両端とも不透明）。
		let crossesSeam = false;
		for ( let y = 0; y < texture.height; y ++ ) if ( alphaAt( 0, y ) === 255 && alphaAt( texture.width - 1, y ) === 255 ) crossesSeam = true;
		expect( crossesSeam ).toBe( true );

	} );

} );
