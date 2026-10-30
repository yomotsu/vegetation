import {
	BufferAttribute,
	BufferGeometry,
	ClampToEdgeWrapping,
	Color,
	CompressedTexture,
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
import { encodeUastcTextureAsync } from '../core/uastc';
import { writeUastcKtx2Async } from '../core/ktx2';
import { alphaTestForTexture, prepareTextureMipmaps } from '../core/textureMipmaps';
import type { PreparedVegetationAsset } from '../core/vegetationAssetPreparation';
import type { ImpostorView, LodLevel, MeshData, PartDef, TextureData, VegetationData } from '../core/types';
import { addImpostorFade } from './impostorFadeMaterial';
import { getImpostorMaterialFactory } from './impostorMaterialFactory';
import type { VegetationMaterial } from './impostorMaterialFactory';
import { requestVegetationWorkerEncoding } from '../worker/workerPool';

async function copyBytesInSlices( source: Uint8Array, onSlice: ( durationMs: number ) => void ): Promise<Uint8Array> {
	const data = new Uint8Array( source.length );
	const sliceSize = 64 * 1024;
	for ( let offset = 0; offset < source.length; offset += sliceSize ) {
		const sliceStart = performance.now();
		const end = Math.min( source.length, offset + sliceSize );
		data.set( source.subarray( offset, end ), offset );
		onSlice( performance.now() - sliceStart );
		if ( end < source.length ) await new Promise<void>( ( resolve ) => setTimeout( resolve, 0 ) );
	}
	return data;
}

async function cloneTextureForTransfer( texture: TextureData, onSlice: ( durationMs: number ) => void ): Promise<TextureData> {
	const data = await copyBytesInSlices( texture.data, onSlice );
	const mipmaps = texture.mipmaps === undefined ? undefined : [] as NonNullable<TextureData['mipmaps']>;
	if ( mipmaps !== undefined ) {
		for ( let index = 0; index < texture.mipmaps!.length; index ++ ) {
			const level = texture.mipmaps![ index ]!;
			mipmaps.push( {
				width: level.width,
				height: level.height,
				data: level.data === texture.data ? data : await copyBytesInSlices( level.data, onSlice ),
			} );
		}
	}
	return { width: texture.width, height: texture.height, data, ...( mipmaps === undefined ? {} : { mipmaps } ) };
}

export interface KTX2LoaderLike {
	parse( buffer: ArrayBuffer, onLoad?: ( texture: CompressedTexture ) => void, onError?: ( error: unknown ) => void ): void;
}

export interface VegetationAssetOptions {
	ktx2Loader?: KTX2LoaderLike;
}

export interface TextureCompressionReport {
	texture: string;
	slot: TextureSlot;
	format: number;
	encodeThread: 'worker' | 'main';
	encodeTimeMs: number;
	mainThreadMaxSliceMs: number;
	transcodeTimeMs: number;
	byteLength: number;
}

type TextureSlot = 'map' | 'normalMap';

interface TextureBinding {
	material: VegetationMaterial;
	slot: TextureSlot;
	name: string;
	raw: DataTexture;
	alphaTest: number;
	normalMap: boolean;
	getData: () => TextureData | undefined;
	generation: number;
	compressed: CompressedTexture | null;
}

function createTexture( data: TextureData, normalMap = false, alphaTest = 0 ): DataTexture {

	const texture = new DataTexture( data.data, data.width, data.height, RGBAFormat, UnsignedByteType );
	const preparedData = data.mipmaps === undefined ? prepareTextureMipmaps( data, alphaTest, normalMap ) : data;
	texture.mipmaps = preparedData.mipmaps ?? [];
	texture.flipY = false;
	texture.colorSpace = normalMap ? NoColorSpace : SRGBColorSpace;
	texture.magFilter = LinearFilter;
	texture.minFilter = LinearMipmapLinearFilter;
	const wrapS = data.wrapS ?? data.wrap;
	const wrapT = data.wrapT ?? data.wrap;
	texture.wrapS = wrapS === 'repeat' ? RepeatWrapping : ClampToEdgeWrapping;
	texture.wrapT = wrapT === 'repeat' ? RepeatWrapping : ClampToEdgeWrapping;
	texture.generateMipmaps = preparedData.mipmaps === undefined;
	texture.needsUpdate = true;

	return texture;

}

function updateTexture( texture: DataTexture, data: TextureData ): void {

	texture.image.data = data.data;
	texture.image.width = data.width;
	texture.image.height = data.height;
	texture.mipmaps = data.mipmaps ?? [];
	texture.generateMipmaps = data.mipmaps === undefined;
	texture.needsUpdate = true;

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
	private readonly impostorTextureData = new Map<string, TextureData>();
	private readonly impostorViews = new Map<string, readonly ImpostorView[]>();
	private readonly textureBindings: TextureBinding[] = [];
	private readonly rawTextures = new Map<VegetationMaterial, { map: DataTexture | null; normalMap: DataTexture | null }>();
	private readonly ktx2Loader: KTX2LoaderLike | undefined;
	private readonly compressionReports = new Map<string, TextureCompressionReport>();
	private readonly partIndices = new Map<string, number>();
	private readonly partColors: Color[];
	private readonly partsCache = new Map<LodLevel, { part: string; geometry: BufferGeometry; material: VegetationMaterial }[]>();
	private readonly impostorSize: number;
	private disposed = false;

	constructor( data: VegetationData, colors?: Record<string, ColorRepresentation>, impostorSize?: number, options?: VegetationAssetOptions );
	constructor( data: VegetationData, colors: Record<string, ColorRepresentation> = {}, impostorSize = 128, options: VegetationAssetOptions = {}, prepared?: PreparedVegetationAsset ) {

		this.ktx2Loader = options.ktx2Loader;
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

			this.impostorTextureData.set( textureName, textureData );
			this.impostorTextures.set( textureName, createTexture( textureData, false, alphaTestForTexture( this.data.parts, textureName ) ) );

		}

		this.materials = this.data.parts.map( ( part, index ) => {

			this.partIndices.set( part.name, index );

			const isImpostor = impostorViewsForPart( part ) !== undefined;
			const texture = isImpostor ? this.impostorTextures.get( part.texture! ) ?? null : part.texture === null ? null : this.data.textures[ part.texture ] === undefined ? null : createTexture( this.data.textures[ part.texture ]!, false, part.alphaTest );
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
			this.rawTextures.set( material, { map: texture as DataTexture | null, normalMap: normalTexture as DataTexture | null } );
			if ( texture !== null && part.texture !== null ) {
				const source = isImpostor
					? () => this.impostorTextureData.get( part.texture! )
					: () => this.data.textures[ part.texture! ];
				this.textureBindings.push( {
					material,
					slot: 'map',
					name: part.texture,
					raw: texture as DataTexture,
					alphaTest: part.alphaTest,
					normalMap: false,
					getData: source,
					generation: 0,
					compressed: null,
				} );
			}
			if ( normalTexture !== null && part.normalTexture !== undefined ) {
				this.textureBindings.push( {
					material,
					slot: 'normalMap',
					name: part.normalTexture,
					raw: normalTexture as DataTexture,
					alphaTest: 0,
					normalMap: true,
					getData: () => this.data.textures[ part.normalTexture! ],
					generation: 0,
					compressed: null,
				} );
			}

			return material;

		} );
		if ( this.ktx2Loader !== undefined ) {
			for ( const binding of this.textureBindings ) this.scheduleCompression( binding );
		}

	}

	static fromPrepared( prepared: PreparedVegetationAsset, options: VegetationAssetOptions = {} ): VegetationAsset {

		return Reflect.construct( VegetationAsset, [ prepared.data, {}, prepared.impostorSize, options, prepared ] ) as VegetationAsset;

	}

	private getMaterialColors(): Color[] {

		return this.partColors.map( ( color, index ) => this.data.parts[ index ]!.colorizesTexture ? new Color( 0xffffff ) : color.clone() );

	}

	private async encodeKtx2( texture: TextureData, binding: TextureBinding ): Promise<{ buffer: ArrayBuffer; encodeTimeMs: number; encodeThread: 'worker' | 'main'; mainThreadMaxSliceMs: number }> {
		const options = { alphaTest: binding.alphaTest, normalMap: binding.normalMap, colorSpace: binding.normalMap ? 'none' as const : 'srgb' as const };
		let mainThreadMaxSliceMs = 0;
		const updateMaxMainThreadSlice = ( durationMs: number ): void => {
			mainThreadMaxSliceMs = Math.max( mainThreadMaxSliceMs, durationMs );
		};
		const encodeOnMainThread = async (): Promise<{ buffer: ArrayBuffer; encodeTimeMs: number; encodeThread: 'main'; mainThreadMaxSliceMs: number }> => {
			if ( this.disposed ) throw new Error( 'VegetationAsset was disposed' );
			const start = performance.now();
			const encoded = await encodeUastcTextureAsync( texture, options, updateMaxMainThreadSlice );
			const buffer = await writeUastcKtx2Async( encoded, updateMaxMainThreadSlice );
			return { buffer, encodeTimeMs: performance.now() - start, encodeThread: 'main', mainThreadMaxSliceMs };
		};
		if ( typeof Worker === 'undefined' ) return encodeOnMainThread();

		const transferableTexture = await cloneTextureForTransfer( texture, updateMaxMainThreadSlice );
		if ( this.disposed ) throw new Error( 'VegetationAsset was disposed' );
		return requestVegetationWorkerEncoding( transferableTexture, options ).then( ( result ) => ( { ...result, encodeThread: 'worker' as const, mainThreadMaxSliceMs } ) ).catch( ( error: unknown ) => {
			if ( this.disposed ) throw error;
			return encodeOnMainThread();
		} );
	}

	private parseKtx2( buffer: ArrayBuffer ): Promise<CompressedTexture> {
		return new Promise( ( resolve, reject ) => {
			try {
				this.ktx2Loader!.parse( buffer, resolve, reject );
			} catch ( error ) {
				reject( error );
			}
		} );
	}

	private scheduleCompression( binding: TextureBinding ): void {
		if ( this.ktx2Loader === undefined || this.disposed ) return;
		const textureData = binding.getData();
		if ( textureData === undefined ) return;
		const generation = ++ binding.generation;
		this.compressionReports.delete( `${ binding.name }:${ binding.slot }` );
		void this.encodeKtx2( textureData, binding ).then( async ( result ) => {
			if ( this.disposed || binding.generation !== generation ) return;
			const transcodeStart = performance.now();
			const compressed = await this.parseKtx2( result.buffer );
			const transcodeTimeMs = performance.now() - transcodeStart;
			if ( this.disposed || binding.generation !== generation || this.rawTexture( binding.material, binding.slot ) !== binding.raw ) {
				compressed.dispose();
				return;
			}
			compressed.wrapS = binding.raw.wrapS;
			compressed.wrapT = binding.raw.wrapT;
			compressed.flipY = false;
			compressed.colorSpace = binding.normalMap ? NoColorSpace : SRGBColorSpace;
			compressed.name = `${ binding.name }-uastc`;
			binding.material[ binding.slot ] = compressed;
			binding.material.needsUpdate = true;
			this.disposeRawTextureIfUnused( binding.raw );
			binding.compressed?.dispose();
			binding.compressed = compressed;
			const reportKey = `${ binding.name }:${ binding.slot }`;
			this.compressionReports.set( reportKey, {
				texture: binding.name,
				slot: binding.slot,
				format: compressed.format,
				encodeThread: result.encodeThread,
				encodeTimeMs: result.encodeTimeMs,
				mainThreadMaxSliceMs: result.mainThreadMaxSliceMs,
				transcodeTimeMs,
				byteLength: compressed.mipmaps.reduce( ( total, level ) => total + level.data.byteLength, 0 ),
			} );
		} ).catch( ( error: unknown ) => {
			if ( binding.generation !== generation || this.disposed ) return;
			console.warn( `VegetationAsset: UASTC texture conversion failed for "${ binding.name }"; keeping its RGBA texture.`, error );
		} );
	}

	private rawTexture( material: VegetationMaterial, slot: TextureSlot ): DataTexture | null {
		return this.rawTextures.get( material )?.[ slot ] ?? null;
	}

	private disposeRawTextureIfUnused( texture: DataTexture ): void {
		if ( this.textureBindings.some( ( binding ) => binding.material[ binding.slot ] === texture ) ) return;
		texture.dispose();
	}

	private refreshTexture( textureName: string, slot: TextureSlot, data: TextureData ): void {
		const bindings = this.textureBindings.filter( ( binding ) => binding.name === textureName && binding.slot === slot );
		if ( bindings.length === 0 ) {
			if ( slot === 'map' ) {
				const impostor = this.impostorTextures.get( textureName );
				if ( impostor !== undefined ) updateTexture( impostor, data );
			}
			return;
		}
		for ( const binding of bindings ) {
			binding.generation ++;
			if ( binding.compressed !== null ) {
				binding.material[ slot ] = binding.raw;
				binding.material.needsUpdate = true;
				binding.compressed.dispose();
				binding.compressed = null;
			}
			updateTexture( binding.raw, data );
			this.scheduleCompression( binding );
		}
	}

	getTextureCompressionReport(): TextureCompressionReport[] {
		return [ ...this.compressionReports.values() ];
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

				regeneratedTextures.set( part.texture, prepareTextureMipmaps(
					regenerateTexture( this.data, part.texture, nextColor.getHex() ),
					alphaTestForTexture( this.data.parts, part.texture ),
				) );

			}

			changes.push( { index, part, color: nextColor } );

		}

		if ( changes.length === 0 ) {
			return;
		}

		let plantCardTextureChanged = false;
		const plantCardGenerator = this.data.textureGenerators?.plantCard;
		if ( plantCardGenerator?.type === 'flowers-allium-plant-card' || plantCardGenerator?.type === 'flowers-tulip-plant-card' || plantCardGenerator?.type === 'flowers-calla-plant-card' || plantCardGenerator?.type === 'flowers-bluebell-plant-card' ) {
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
				const updatedTexture = prepareTextureMipmaps(
					regenerateTexture( this.data, 'plantCard', 0xffffff ),
					alphaTestForTexture( this.data.parts, 'plantCard' ),
				);
				this.data.textures.plantCard = updatedTexture;
				plantCardTextureChanged = true;
				this.refreshTexture( 'plantCard', 'map', updatedTexture );
			}
		}

		for ( const { index, part, color } of changes ) {

			if ( part.colorizesTexture && part.texture !== null ) {

				const updatedTexture = regeneratedTextures.get( part.texture )!;
				this.data.textures[ part.texture ] = updatedTexture;
				this.refreshTexture( part.texture, 'map', updatedTexture );

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

			const pixels = prepareTextureMipmaps(
				bakeImpostor( this.data, toLinearColors( materialColors ), this.impostorSize, viewYawAngles ),
				alphaTestForTexture( this.data.parts, textureName ),
			);
			this.impostorTextureData.set( textureName, pixels );
			this.refreshTexture( textureName, 'map', pixels );

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
		for ( const binding of this.textureBindings ) {
			binding.generation ++;
			textures.add( binding.raw );
			if ( binding.compressed !== null ) textures.add( binding.compressed );
		}

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
		this.compressionReports.clear();

	}

}
