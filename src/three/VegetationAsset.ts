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
	NoColorSpace,
	RGBAFormat,
	RepeatWrapping,
	SRGBColorSpace,
	UnsignedByteType,
} from 'three';
import type { ColorRepresentation, Texture } from 'three';
import { bakeImpostor, impostorViewsForPart } from '../core/impostor';
import { regenerateTexture } from '../core/textureRegenerator';
import { prepareVegetationAsset } from '../core/vegetationAssetPreparation';
import type { PreparedVegetationAsset } from '../core/vegetationAssetPreparation';
import type { ImpostorView, LodLevel, MeshData, PartDef, TextureData, VegetationData } from '../core/types';
import { addImpostorFade } from './impostorFadeMaterial';
import { getImpostorMaterialFactory } from './impostorMaterialFactory';
import type { VegetationMaterial } from './impostorMaterialFactory';

function createTexture( data: TextureData, normalMap = false ): DataTexture {

	const texture = new DataTexture( data.data, data.width, data.height, RGBAFormat, UnsignedByteType );
	texture.flipY = false;
	texture.colorSpace = normalMap ? NoColorSpace : SRGBColorSpace;
	texture.magFilter = LinearFilter;
	texture.minFilter = LinearMipmapLinearFilter;
	const wrapS = data.wrapS ?? data.wrap;
	const wrapT = data.wrapT ?? data.wrap;
	texture.wrapS = wrapS === 'repeat' ? RepeatWrapping : ClampToEdgeWrapping;
	texture.wrapT = wrapT === 'repeat' ? RepeatWrapping : ClampToEdgeWrapping;
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
	geometry.setAttribute( 'impostorCard', new BufferAttribute( data.impostorCard, 1 ) );
	geometry.setIndex( new BufferAttribute( data.indices, 1 ) );

	for ( const group of data.groups ) {

		geometry.addGroup( group.start, group.count, group.partIndex );

	}

	geometry.computeBoundingSphere();

	return geometry;

}

function createCollider( data: VegetationData['collider'] ): BufferGeometry | null {

	if ( data === null ) {
		return null;
	}

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
	readonly materials: VegetationMaterial[];
	readonly collider: BufferGeometry | null;
	private readonly impostorTextures = new Map<string, DataTexture>();
	private readonly impostorViews = new Map<string, readonly ImpostorView[]>();
	private readonly partIndices = new Map<string, number>();
	private readonly partColors: Color[];
	private readonly partsCache = new Map<LodLevel, { part: string; geometry: BufferGeometry; material: VegetationMaterial }[]>();
	private readonly impostorSize: number;
	private disposed = false;

	constructor( data: VegetationData, colors?: Record<string, ColorRepresentation>, impostorSize?: number );
	constructor( data: VegetationData, colors: Record<string, ColorRepresentation> = {}, impostorSize = 128, prepared?: PreparedVegetationAsset ) {

		const colorObjects = Object.fromEntries( data.parts.map( ( part ) => [ part.name, new Color( colors[ part.name ] ?? part.defaultColor ) ] ) );
		const partColorsHex = prepared?.partColorsHex ?? Object.fromEntries( Object.entries( colorObjects ).map( ( [ name, color ] ) => [ name, color.getHex() ] ) );
		const partColorsLinear = prepared?.partColorsLinear ?? Object.fromEntries( Object.entries( colorObjects ).map( ( [ name, color ] ) => [ name, [ color.r, color.g, color.b ] as [ number, number, number ] ] ) );
		const payload = prepared ?? prepareVegetationAsset( data, partColorsHex, impostorSize, partColorsLinear );
		this.data = payload.data;
		this.impostorSize = payload.impostorSize;
		this.geometries = this.data.lods.map( createGeometry );
		this.collider = createCollider( this.data.collider );
		this.partColors = this.data.parts.map( ( part ) => {

			if ( prepared === undefined ) return colorObjects[ part.name ]!;

			const color = new Color();
			const linear = payload.partColorsLinear[ part.name ]!;
			color.r = linear[ 0 ];
			color.g = linear[ 1 ];
			color.b = linear[ 2 ];
			return color;

		} );
		const materialColors = this.getMaterialColors();

		for ( const [ textureName, views ] of Object.entries( payload.impostorViews ) ) {

			this.impostorViews.set( textureName, views );

		}
		for ( const [ textureName, textureData ] of Object.entries( payload.impostorTextures ) ) {

			this.impostorTextures.set( textureName, createTexture( textureData ) );

		}

		this.materials = this.data.parts.map( ( part, index ) => {

			this.partIndices.set( part.name, index );

			const isImpostor = impostorViewsForPart( part ) !== undefined;
			const texture = isImpostor ? this.impostorTextures.get( part.texture! ) ?? null : part.texture === null ? null : this.data.textures[ part.texture ] === undefined ? null : createTexture( this.data.textures[ part.texture ]! );
			const normalTexture = part.normalTexture === undefined ? null : this.data.textures[ part.normalTexture ] === undefined ? null : createTexture( this.data.textures[ part.normalTexture ]!, true );
			const materialParameters = {
				color: materialColors[ index ]!,
				map: texture,
				normalMap: normalTexture,
				vertexColors: ! isImpostor,
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
			const fadesImpostor = isImpostor && part.impostorFade !== false;
			const impostorFactory = fadesImpostor ? getImpostorMaterialFactory() : null;
			const material = impostorFactory !== null
				? impostorFactory( {
					...materialParameters,
					...( part.specularIntensity !== undefined ? { specularIntensity: part.specularIntensity } : {} ),
					...( part.ior !== undefined ? { ior: part.ior } : {} ),
				} )
				: part.specularIntensity !== undefined || part.ior !== undefined
				? new MeshPhysicalMaterial( {
					...materialParameters,
					...( part.specularIntensity !== undefined ? { specularIntensity: part.specularIntensity } : {} ),
					...( part.ior !== undefined ? { ior: part.ior } : {} ),
				} )
				: new MeshStandardMaterial( materialParameters );

			if ( fadesImpostor && impostorFactory === null ) {

				addImpostorFade( material );

			}

			return material;

		} );

	}

	static fromPrepared( prepared: PreparedVegetationAsset ): VegetationAsset {

		return Reflect.construct( VegetationAsset, [ prepared.data, {}, prepared.impostorSize, prepared ] ) as VegetationAsset;

	}

	private getMaterialColors(): Color[] {

		return this.partColors.map( ( color, index ) => this.data.parts[ index ]!.colorizesTexture ? new Color( 0xffffff ) : color.clone() );

	}

	/** @remarks 返される geometry は属性バッファを geometries[ lod ] と共有し、VegetationAsset が所有します。個別に dispose せず、パーツごとの Mesh または InstancedMesh に使ってください。 */
	getParts( lod: number ): { part: string; geometry: BufferGeometry; material: VegetationMaterial }[] {

		const level = Math.max( 0, Math.min( 4, Math.floor( Number.isFinite( lod ) ? lod : 0 ) ) ) as LodLevel;
		const cached = this.partsCache.get( level );
		if ( cached !== undefined ) {

			return cached;

		}

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
			geometry.setAttribute( 'impostorCard', source.getAttribute( 'impostorCard' ) );
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

		this.setColors( { [ part ]: color } );

	}

	setColors( colors: Record<string, ColorRepresentation> ): void {

		const changes: { index: number; part: PartDef; color: Color }[] = [];
		const regeneratedTextures = new Map<string, TextureData>();

		for ( const [ partName, color ] of Object.entries( colors ) ) {

			const index = this.partIndices.get( partName );

			if ( index === undefined ) {
				throw new Error( `Unknown vegetation part: ${ partName }` );
			}

			const part = this.data.parts[ index ]!;
			const nextColor = new Color( color );

			if ( this.partColors[ index ]!.equals( nextColor ) ) {
				continue;
			}

			if ( part.colorizesTexture ) {

				if ( part.texture === null || impostorViewsForPart( part ) !== undefined || this.materials[ index ]!.map === null ) {
					throw new Error( `Vegetation part cannot regenerate its texture: ${ partName }` );
				}

				regeneratedTextures.set( part.texture, regenerateTexture( this.data, part.texture, nextColor.getHex() ) );

			}

			changes.push( { index, part, color: nextColor } );

		}

		if ( changes.length === 0 ) {
			return;
		}

		let plantCardTextureChanged = false;
		const plantCardGenerator = this.data.textureGenerators?.plantCard;
		if ( plantCardGenerator?.type === 'flowers-allium-plant-card' || plantCardGenerator?.type === 'flowers-tulip-plant-card' || plantCardGenerator?.type === 'flowers-calla-plant-card' ) {
			const updatedGenerator = { ...plantCardGenerator };
			let regeneratePlantCard = false;
			for ( const { part, color } of changes ) {
				if ( part.name === 'petal' && updatedGenerator.petalColor !== color.getHex() ) {
					updatedGenerator.petalColor = color.getHex();
					regeneratePlantCard = true;
				}
				else if ( part.name === 'stem' && updatedGenerator.stemColor !== color.getHex() ) {
					updatedGenerator.stemColor = color.getHex();
					regeneratePlantCard = true;
				}
			}
			if ( regeneratePlantCard ) {
				this.data.textureGenerators = { ...this.data.textureGenerators, plantCard: updatedGenerator };
				const updatedTexture = regenerateTexture( this.data, 'plantCard', 0xffffff );
				this.data.textures.plantCard = updatedTexture;
				plantCardTextureChanged = true;
				const cardPartIndex = this.partIndices.get( 'plantCard' );
				if ( cardPartIndex !== undefined ) {
					const texture = this.materials[ cardPartIndex ]!.map as DataTexture | null;
					if ( texture !== null ) {
						texture.image.data = updatedTexture.data;
						texture.needsUpdate = true;
					}
				}
			}
		}

		for ( const { index, part, color } of changes ) {

			if ( part.colorizesTexture && part.texture !== null ) {

				const updatedTexture = regeneratedTextures.get( part.texture )!;
				this.data.textures[ part.texture ] = updatedTexture;
				const texture = this.materials[ index ]!.map as DataTexture;
				texture.image.data = updatedTexture.data;
				texture.needsUpdate = true;

			} else {

				this.materials[ index ]!.color.copy( color );

			}

			this.partColors[ index ]!.copy( color );

		}

		const changedParts = new Set( changes.map( ( change ) => change.index ) );
		const sourceGroups = this.data.lods[ 0 ]!.groups;
		if ( ! plantCardTextureChanged && ! sourceGroups.some( ( group ) => changedParts.has( group.partIndex ) ) ) {
			return;
		}

		const materialColors = this.getMaterialColors();

		for ( const [ textureName, viewYawAngles ] of this.impostorViews ) {

			const texture = this.impostorTextures.get( textureName )!;
			const pixels = bakeImpostor( this.data, toLinearColors( materialColors ), this.impostorSize, viewYawAngles );
			texture.image.data = pixels.data;
			texture.needsUpdate = true;

		}

	}

	getColor( part: string ): Color {

		const index = this.partIndices.get( part );

		if ( index === undefined ) {

			throw new Error( `Unknown vegetation part: ${ part }` );

		}

		return this.partColors[ index ]!;

	}

	dispose(): void {

		if ( this.disposed ) {

			return;

		}
		this.disposed = true;

		for ( const geometry of this.geometries ) {

			geometry.dispose();

		}
		for ( const parts of this.partsCache.values() ) {

			for ( const part of parts ) {

				part.geometry.dispose();

			}

		}

		this.collider?.dispose();

		const textures = new Set<Texture>();
		for ( const texture of this.impostorTextures.values() ) textures.add( texture );

		for ( const material of this.materials ) {

			if ( material.map !== null ) {

				textures.add( material.map );

			}
			if ( material.normalMap !== null ) {

				textures.add( material.normalMap );

			}
			material.dispose();

		}

		for ( const texture of textures ) {

			texture.dispose();

		}

	}

}
