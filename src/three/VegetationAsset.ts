import {
	BufferAttribute,
	BufferGeometry,
	ClampToEdgeWrapping,
	Color,
	DataTexture,
	DoubleSide,
	FrontSide,
	LinearFilter,
	LinearMipmapLinearFilter,
	MeshPhysicalMaterial,
	MeshStandardMaterial,
	RGBAFormat,
	RepeatWrapping,
	SRGBColorSpace,
	UnsignedByteType,
} from 'three';
import type { ColorRepresentation, Texture } from 'three';
import { bakeImpostor } from '../core/impostor';
import { regenerateTreeLeafTexture } from '../core/generators/tree';
import type { LodLevel, MeshData, TextureData, VegetationData } from '../core/types';

function createTexture( data: TextureData ): DataTexture {

	const texture = new DataTexture( data.data, data.width, data.height, RGBAFormat, UnsignedByteType );
	texture.flipY = false;
	texture.colorSpace = SRGBColorSpace;
	texture.magFilter = LinearFilter;
	texture.minFilter = LinearMipmapLinearFilter;
	const wrapping = data.wrap === 'repeat' ? RepeatWrapping : ClampToEdgeWrapping;
	texture.wrapS = wrapping;
	texture.wrapT = wrapping;
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
	/** @remarks WebGPURenderer のシャドウ描画では、マテリアル配列と一緒に使わないでください。代わりに getParts( lod ) を使い、パーツごとに InstancedMesh を作成してください。 */
	readonly geometries: BufferGeometry[];
	/** @remarks WebGPURenderer のシャドウ描画では geometries[ lod ] と組み合わせないでください。getParts( lod ) の各パーツに対応するマテリアルを使ってください。 */
	readonly materials: MeshStandardMaterial[];
	readonly collider: BufferGeometry | null;
	private readonly impostorTexture: DataTexture | null;
	private readonly partIndices = new Map<string, number>();
	private readonly partColors: Color[];
	private readonly partsCache = new Map<LodLevel, { part: string; geometry: BufferGeometry; material: MeshStandardMaterial }[]>();
	private disposed = false;

	constructor( data: VegetationData, colors: Record<string, ColorRepresentation> = {}, impostorSize = 128 ) {

		this.data = data;
		this.geometries = data.lods.map( createGeometry );
		this.collider = createCollider( data.collider );

		this.partColors = data.parts.map( ( part ) => new Color( colors[ part.name ] ?? part.defaultColor ) );
		const materialColors = this.partColors.map( ( color, index ) => data.parts[ index ]!.colorizesTexture ? new Color( 0xffffff ) : color.clone() );
		const impostor = bakeImpostor( data, toLinearColors( materialColors ), impostorSize, [ 0 ] );
		this.impostorTexture = createTexture( impostor );
		this.materials = data.parts.map( ( part, index ) => {

			this.partIndices.set( part.name, index );

			const texture = part.texture === 'impostor' ? this.impostorTexture : part.texture === null ? null : data.textures[ part.texture ] === undefined ? null : createTexture( data.textures[ part.texture ]! );
			const materialParameters = {
				color: materialColors[ index ]!,
				map: texture,
				vertexColors: part.texture !== 'impostor',
				side: part.doubleSided ? DoubleSide : FrontSide,
				flatShading: part.flatShading,
				alphaTest: part.alphaTest,
				alphaToCoverage: false,
				transparent: false,
				emissive: part.emissive ?? 0x000000,
				emissiveIntensity: part.emissiveIntensity ?? 1,
				roughness: part.roughness ?? 1,
				metalness: 0,
			};
			const material = part.specularIntensity !== undefined || part.ior !== undefined
				? new MeshPhysicalMaterial( {
					...materialParameters,
					...( part.specularIntensity !== undefined ? { specularIntensity: part.specularIntensity } : {} ),
					...( part.ior !== undefined ? { ior: part.ior } : {} ),
				} )
				: new MeshStandardMaterial( materialParameters );

			return material;

		} );

	}

	/** @remarks 返される geometry は属性バッファを geometries[ lod ] と共有し、VegetationAsset が所有します。個別に dispose せず、パーツごとの Mesh または InstancedMesh に使ってください。 */
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

		const definition = this.data.parts[ index ]!;
		const nextColor = new Color( color );

		if ( definition.colorizesTexture ) {

			if ( definition.texture === null || definition.texture === 'impostor' || this.materials[ index ]!.map === null ) {
				throw new Error( `Vegetation part cannot regenerate its texture: ${ part }` );
			}

			regenerateTreeLeafTexture( this.data, nextColor.getHex() );

			const texture = this.materials[ index ]!.map as DataTexture;
			texture.image.data = this.data.textures[ definition.texture ]!.data;
			texture.needsUpdate = true;

		} else {

			this.materials[ index ]!.color.copy( nextColor );

		}

		this.partColors[ index ]!.copy( nextColor );

		const materialColors = this.partColors.map( ( partColor, partIndex ) => this.data.parts[ partIndex ]!.colorizesTexture ? new Color( 0xffffff ) : partColor );
		const pixels = bakeImpostor( this.data, toLinearColors( materialColors ), this.impostorTexture!.image.width, [ 0 ] );
		this.impostorTexture!.image.data = pixels.data;
		this.impostorTexture!.needsUpdate = true;

	}

	getColor( part: string ): Color {

		const index = this.partIndices.get( part );

		if ( index === undefined ) {

			throw new Error( `Unknown vegetation part: ${ part }` );

		}

		return this.partColors[ index ]!;

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
