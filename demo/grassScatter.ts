import { Box3, Color, FrontSide, Group, InstancedMesh, Matrix4, Quaternion, StaticDrawUsage, Vector3 } from 'three';
import type { BufferGeometry, Camera, Material } from 'three';
import type { VegetationAsset } from '../src/index';
import { GRASS_BLUE_NOISE_RANKS } from '../src/core/grassBlueNoise';
import { createBidirectionalCardGeometry } from '../src/three/grassCardGeometry';
import { setPreviewShadowFlags } from './rendering';

const cellSize = 0.11;
const density = 0.15;
const drawRadius = 48;
const sinkBias = 0.03;
const minHeight = 0.3;
const maxHeight = 0.6;
const cardAspect = 1.125;
const tintJitter = 0.06;
const maxCellIndex = Math.ceil( drawRadius / cellSize ) + 1;
const up = new Vector3( 0, 1, 0 );

const channel = {
	keep: 1,
	keepOffsetZ: 9,
	jitterX: 2,
	jitterZ: 3,
	yaw: 4,
	height: 5,
	tint: 6,
	rank: 7,
	variant: 8,
};

function cellRandom( seed: number, cellX: number, cellZ: number, salt: number ): number {

	let hash = ( seed ^ Math.imul( cellX, 0x8da6b343 ) ^ Math.imul( cellZ, 0xd8163841 ) ^ Math.imul( salt, 0xcb1ab31f ) ) >>> 0;
	hash = Math.imul( hash ^ ( hash >>> 16 ), 0x7feb352d );
	hash = Math.imul( hash ^ ( hash >>> 15 ), 0x846ca68b );
	return ( hash ^ ( hash >>> 16 ) ) >>> 0;

}

function randomUnit( seed: number, cellX: number, cellZ: number, salt: number ): number {

	return cellRandom( seed, cellX, cellZ, salt ) / 4294967296;

}

function smoothstep( start: number, end: number, value: number ): number {

	const amount = Math.max( 0, Math.min( 1, ( value - start ) / ( end - start ) ) );
	return amount * amount * ( 3 - 2 * amount );

}

export function createGrassScatter( assets: VegetationAsset[], seed: number ): {
	group: Group;
	update: ( camera: Camera, time: number ) => number;
	dispose: () => void;
} {

	const variants = assets.slice( 0, 4 );
	if ( variants.length === 0 ) throw new RangeError( 'Grass scatter requires at least one asset' );

	const normalizedSeed = Math.floor( Math.abs( seed ) * 1000 ) >>> 0;
	const blueNoiseOffsetX = cellRandom( normalizedSeed, 0, 0, channel.keep ) & 63;
	const blueNoiseOffsetZ = cellRandom( normalizedSeed, 0, 0, channel.keepOffsetZ ) & 63;
	const group = new Group();
	const renderGeometries: BufferGeometry[] = [];
	const renderMaterials: Material[] = [];
	const expectedCount = Math.ceil( Math.PI * drawRadius * drawRadius / ( cellSize * cellSize ) * density );
	const capacityPerVariant = Math.ceil( expectedCount * 1.2 / variants.length );
	const meshes = variants.map( ( asset, variantIndex ) => {
		const partIndex = asset.data.parts.findIndex( ( part ) => part.name === 'blade' );
		const part = asset.getParts( 0 ).find( ( candidate ) => candidate.part === 'blade' );
		if ( partIndex < 0 || part === undefined ) throw new Error( 'Grass asset has no blade part' );

		const geometry = createBidirectionalCardGeometry( part.geometry );
		const material = part.material.clone();
		material.side = FrontSide;
		renderGeometries.push( geometry );
		renderMaterials.push( material );
		const mesh = new InstancedMesh( geometry, material, capacityPerVariant );
		mesh.count = 0;
		mesh.visible = true;
		mesh.frustumCulled = false;
		mesh.boundingBox = new Box3(
			new Vector3( - drawRadius - maxHeight * cardAspect, - sinkBias, - drawRadius - maxHeight * cardAspect ),
			new Vector3( drawRadius + maxHeight * cardAspect, maxHeight - sinkBias, drawRadius + maxHeight * cardAspect ),
		);
		mesh.instanceMatrix.setUsage( StaticDrawUsage );
		setPreviewShadowFlags( mesh );
		mesh.castShadow = false;
		mesh.receiveShadow = false;
		mesh.userData.part = 'blade';
		mesh.userData.variant = variantIndex;
		group.add( mesh );
		return mesh;
	} );

	const matrix = new Matrix4();
	const position = new Vector3();
	const rotation = new Quaternion();
	const scale = new Vector3();
	const color = new Color();
	const baseHeight = variants[ 0 ]!.data.bounds.height;
	const baseWidth = variants[ 0 ]!.data.bounds.radius * 2;
	const radiusSquared = drawRadius * drawRadius;
	let triangles = 0;

	for ( let cellZ = - maxCellIndex; cellZ <= maxCellIndex; cellZ ++ ) {
		for ( let cellX = - maxCellIndex; cellX <= maxCellIndex; cellX ++ ) {
			const blueNoiseX = ( cellX + blueNoiseOffsetX ) & 63;
			const blueNoiseZ = ( cellZ + blueNoiseOffsetZ ) & 63;
			if ( GRASS_BLUE_NOISE_RANKS[ blueNoiseZ * 64 + blueNoiseX ]! / 4096 >= density ) continue;

			const x = ( cellX + randomUnit( normalizedSeed, cellX, cellZ, channel.jitterX ) ) * cellSize;
			const z = ( cellZ + randomUnit( normalizedSeed, cellX, cellZ, channel.jitterZ ) ) * cellSize;
			const distanceSquared = x * x + z * z;
			if ( distanceSquared >= radiusSquared ) continue;

			const distance = Math.sqrt( distanceSquared );
			const keepFraction = 1 + ( 0.45 - 1 ) * smoothstep( 24, 40, distance );
			const alive = randomUnit( normalizedSeed, cellX, cellZ, channel.rank ) < keepFraction;
			const fade = 1 - smoothstep( 40, drawRadius, distance );

			const variantIndex = Math.min( variants.length - 1, Math.floor( randomUnit( normalizedSeed, cellX, cellZ, channel.variant ) * variants.length ) );
			const mesh = meshes[ variantIndex ]!;
			if ( mesh.count >= mesh.instanceMatrix.count ) throw new RangeError( 'Grass scatter exceeded its instance capacity' );

			const height = minHeight + ( maxHeight - minHeight ) * randomUnit( normalizedSeed, cellX, cellZ, channel.height );
			const shrink = 1 + ( 0.1 - 1 ) * smoothstep( 12, 40, distance );
			const instanceScale = height / baseHeight * shrink * fade * ( alive ? 1 : 0 );
			const widthScale = height * cardAspect / baseWidth * shrink * fade * ( alive ? 1 : 0 );
			const yaw = randomUnit( normalizedSeed, cellX, cellZ, channel.yaw ) * Math.PI * 2;
			const tint = 1 + ( randomUnit( normalizedSeed, cellX, cellZ, channel.tint ) * 2 - 1 ) * tintJitter;

			position.set( x, - sinkBias, z );
			rotation.setFromAxisAngle( up, yaw );
			scale.set( widthScale, instanceScale, 1 );
			matrix.compose( position, rotation, scale );
			mesh.setMatrixAt( mesh.count, matrix );
			color.setRGB( tint, tint, tint );
			mesh.setColorAt( mesh.count, color );
			mesh.count ++;
		}
	}

	for ( const mesh of meshes ) {
		mesh.instanceMatrix.needsUpdate = true;
		if ( mesh.instanceColor !== null ) mesh.instanceColor.needsUpdate = true;
		triangles += mesh.count * ( mesh.geometry.getIndex()?.count ?? 0 ) / 3;
	}

	function update( _camera: Camera, _time: number ): number {

		return triangles;

	}

	function dispose(): void {

		for ( const mesh of meshes ) mesh.dispose();
		for ( const geometry of renderGeometries ) geometry.dispose();
		for ( const material of renderMaterials ) material.dispose();
		group.clear();
		meshes.length = 0;
		renderGeometries.length = 0;
		renderMaterials.length = 0;

	}

	return { group, update, dispose };

}
