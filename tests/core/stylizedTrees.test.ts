import { describe, expect, it } from 'vitest';
import { generateBroadleafTreeData } from '../../src/core/trees/broadleaf';
import { generateBushData } from '../../src/core/trees/bush';
import { generatePineTreeData } from '../../src/core/trees/pine';
import { generateWillowTreeData } from '../../src/core/trees/willow';
import { validateMeshData } from '../helpers/validateMeshData';

const trees = [
	{ name: 'broadleaf', generate: generateBroadleafTreeData, kind: 'broadleaf-tree', height: 6, bark: 0x8a7350, leaf: 0x4f9a2a, parts: [ 'bark', 'leaf' ], maxVertices: 800, collider: true },
	{ name: 'bush', generate: generateBushData, kind: 'bush', height: 1.3, bark: 0x6e5a40, leaf: 0x55a02e, parts: [ 'bark', 'leaf' ], maxVertices: 500, collider: false },
	{ name: 'pine', generate: generatePineTreeData, kind: 'pine-tree', height: 9, bark: 0xb8653a, leaf: 0x3f8a4c, parts: [ 'bark', 'leaf' ], maxVertices: 1000, collider: true },
	{ name: 'willow', generate: generateWillowTreeData, kind: 'willow-tree', height: 7, bark: 0x6f6a45, leaf: 0x6cad3a, parts: [ 'bark', 'leaf' ], maxVertices: 900, collider: true },
];

describe( 'stylized trees', () => {

	it.each( trees )( 'generates valid $name mesh data', ( tree ) => {

		const data = tree.generate( { seed: 17 } );
		expect( data.kind ).toBe( tree.kind );
		expect( data.lods ).toHaveLength( 5 );
		expect( data.parts.map( ( part ) => part.name ) ).toEqual( tree.parts );
		expect( data.parts.some( ( part ) => part.name === 'leafRing' ) ).toBe( false );
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
		expect( first.textures.leaf!.data ).toEqual( repeated.textures.leaf!.data );
		expect( first.textures.bark!.data ).toEqual( repeated.textures.bark!.data );

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
