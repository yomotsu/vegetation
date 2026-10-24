import {
	BufferAttribute,
	BufferGeometry,
	Color,
	DataTexture,
	DoubleSide,
	FrontSide,
	LinearFilter,
	LinearMipmapLinearFilter,
	MeshStandardMaterial,
	RGBAFormat,
	SRGBColorSpace,
	UnsignedByteType,
} from 'three';
import type { ColorRepresentation, Texture } from 'three';
import { bakeImpostor } from '../core/impostor';
import type { LodLevel, MeshData, TextureData, VegetationData } from '../core/types';

function createTexture( data: TextureData ): DataTexture {

	const texture = new DataTexture( data.data, data.width, data.height, RGBAFormat, UnsignedByteType );
	texture.flipY = false;
	texture.colorSpace = SRGBColorSpace;
	texture.magFilter = LinearFilter;
	texture.minFilter = LinearMipmapLinearFilter;
	texture.generateMipmaps = true;
	texture.needsUpdate = true;

	return texture;

}

function createGeometry( data: MeshData ): BufferGeometry {

	const geometry = new BufferGeometry();
	geometry.setAttribute( 'position', new BufferAttribute( data.positions, 3 ) );
	geometry.setAttribute( 'normal', new BufferAttribute( data.normals, 3 ) );
	geometry.setAttribute( 'uv', new BufferAttribute( data.uvs, 2 ) );
	geometry.setAttribute( 'color', new BufferAttribute( data.colors, 3 ) );
	geometry.setAttribute( 'windWeight', new BufferAttribute( data.windWeight, 1 ) );
	geometry.setIndex( new BufferAttribute( data.indices, 1 ) );

	for ( const group of data.groups ) {

		geometry.addGroup( group.start, group.count, group.partIndex );

	}

	geometry.computeBoundingSphere();

	return geometry;

}

function createCollider( data: VegetationData['collider'] ): BufferGeometry | null {

	if ( data === null ) return null;

	const geometry = new BufferGeometry();
	geometry.setAttribute( 'position', new BufferAttribute( data.positions, 3 ) );
	geometry.setIndex( new BufferAttribute( data.indices, 1 ) );
	geometry.computeBoundingSphere();

	return geometry;

}

function toLinearColors( colors: Color[] ): [ number, number, number ][] {

	return colors.map( ( color ) => [ color.r, color.g, color.b ] );

}

export class VegetationAsset {

	readonly data: VegetationData;
	readonly geometries: BufferGeometry[];
	readonly materials: MeshStandardMaterial[];
	readonly collider: BufferGeometry | null;
	private readonly impostorTexture: DataTexture | null;
	private readonly partIndices = new Map<string, number>();
	private readonly partsCache = new Map<LodLevel, { part: string; geometry: BufferGeometry; material: MeshStandardMaterial }[]>();
	private disposed = false;

	constructor( data: VegetationData, colors: Record<string, ColorRepresentation> = {}, impostorSize = 128 ) {

		this.data = data;
		this.geometries = data.lods.map( createGeometry );
		this.collider = createCollider( data.collider );

		const partColors = data.parts.map( ( part ) => new Color( colors[ part.name ] ?? part.defaultColor ) );
		const impostor = bakeImpostor( data, toLinearColors( partColors ), impostorSize );
		this.impostorTexture = createTexture( impostor );
		this.materials = data.parts.map( ( part, index ) => {

			this.partIndices.set( part.name, index );

			const texture = part.texture === 'impostor' ? this.impostorTexture : part.texture === null ? null : data.textures[ part.texture ] === undefined ? null : createTexture( data.textures[ part.texture ]! );
			const material = new MeshStandardMaterial( {
				color: partColors[ index ]!,
				map: texture,
				vertexColors: part.texture !== 'impostor',
				side: part.doubleSided ? DoubleSide : FrontSide,
				flatShading: part.flatShading,
				alphaTest: part.alphaTest,
				alphaToCoverage: false,
				transparent: false,
				roughness: 1,
				metalness: 0,
			} );

			return material;

		} );

	}

	getParts( lod: number ): { part: string; geometry: BufferGeometry; material: MeshStandardMaterial }[] {

		const level = Math.max( 0, Math.min( 4, Math.floor( Number.isFinite( lod ) ? lod : 0 ) ) ) as LodLevel;
		const cached = this.partsCache.get( level );
		if ( cached !== undefined ) return cached;

		const source = this.geometries[ level ]!;
		const index = source.getIndex()!;
		const parts = this.data.lods[ level ]!.groups.map( ( group ) => {

			const definition = this.data.parts[ group.partIndex ]!;
			const geometry = new BufferGeometry();
			geometry.setAttribute( 'position', source.getAttribute( 'position' ) );
			geometry.setAttribute( 'normal', source.getAttribute( 'normal' ) );
			geometry.setAttribute( 'uv', source.getAttribute( 'uv' ) );
			geometry.setAttribute( 'color', source.getAttribute( 'color' ) );
			geometry.setAttribute( 'windWeight', source.getAttribute( 'windWeight' ) );
			geometry.setIndex( new BufferAttribute( index.array.slice( group.start, group.start + group.count ), 1 ) );
			geometry.addGroup( 0, group.count, group.partIndex );
			geometry.boundingSphere = source.boundingSphere?.clone() ?? null;

			return {
				part: definition.name,
				geometry,
				material: this.materials[ group.partIndex ]!,
			};

		} );

		this.partsCache.set( level, parts );

		return parts;

	}

	setColor( part: string, color: ColorRepresentation ): void {

		const index = this.partIndices.get( part );

		if ( index === undefined ) {

			throw new Error( `Unknown vegetation part: ${ part }` );

		}

		this.materials[ index ]!.color.set( color );

		const pixels = bakeImpostor( this.data, toLinearColors( this.materials.map( ( material ) => material.color ) ), this.impostorTexture!.image.width / 2 );
		this.impostorTexture!.image.data = pixels.data;
		this.impostorTexture!.needsUpdate = true;

	}

	getColor( part: string ): Color {

		const index = this.partIndices.get( part );

		if ( index === undefined ) {

			throw new Error( `Unknown vegetation part: ${ part }` );

		}

		return this.materials[ index ]!.color;

	}

	dispose(): void {

		if ( this.disposed ) return;
		this.disposed = true;

		for ( const geometry of this.geometries ) geometry.dispose();
		for ( const parts of this.partsCache.values() ) {

			for ( const part of parts ) part.geometry.dispose();

		}

		this.collider?.dispose();

		const textures = new Set<Texture>();

		for ( const material of this.materials ) {

			if ( material.map !== null ) textures.add( material.map );
			material.dispose();

		}

		for ( const texture of textures ) texture.dispose();

	}

}
