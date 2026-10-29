import type { MeshData, TextureData, Vec3 } from './types';
import { createRockFacetNormals, isRockScoopInterior } from './rockGeometry';
import type { RockHullShape, RockRidgeUvSegment } from './rockGeometry';
import { createGradientNoise3D, createNoise3D } from './noise';

type NoiseSampler = ( u: number, v: number ) => number;

interface NoiseField extends NoiseSampler {
	fillPixelRow( y: number, output: Float64Array ): void;
	sampleUnit( u: number, v: number ): number;
}

interface PixelAxisSamples {
	x0: Uint16Array;
	x1: Uint16Array;
	tx: Float32Array;
	y0: Uint16Array;
	y1: Uint16Array;
	ty: Float32Array;
}

interface RockTexturePair {
	albedo: TextureData;
	normal: TextureData;
}

export interface RockMossTextureOptions {
	amount: number;
	color: number;
	minimumNormalY?: number;
	minimumPositionY?: number;
}

export interface RockMossSurfaceSamples {
	positions: Float32Array;
	normals: Float32Array;
	upFacing: Float32Array;
	valid: Uint8Array;
	coverage: Float32Array;
	clumps: Float32Array;
	activePixels: Uint32Array;
	edgeHighlights: Float32Array;
	diameter: number;
}

export const DEFAULT_MOSS_COLOR = 0x7cb83a;

function createRockScoopTester( scoopShape?: { shape: RockHullShape; verticalOffset: number } ): ( x: number, y: number, z: number ) => boolean {

	if ( scoopShape === undefined || scoopShape.shape.scoops.length === 0 ) return () => false;
	const shape = scoopShape.shape;
	const cosineY = Math.cos( shape.rotationY );
	const sineY = Math.sin( shape.rotationY );
	const cosineZ = Math.cos( shape.tiltZ );
	const sineZ = Math.sin( shape.tiltZ );
	const cosineX = Math.cos( shape.tiltX );
	const sineX = Math.sin( shape.tiltX );
	const translationX = shape.translation[ 0 ];
	const translationY = shape.translation[ 1 ];
	const translationZ = shape.translation[ 2 ];
	const radiusX = shape.radii[ 0 ];
	const radiusY = shape.radii[ 1 ];
	const radiusZ = shape.radii[ 2 ];
	const scoops = shape.scoops.map( ( scoop ) => ( {
		x: scoop.direction[ 0 ],
		y: scoop.direction[ 1 ],
		z: scoop.direction[ 2 ],
		cosine: Math.cos( scoop.angularRadius * 0.98 )
	} ) );
	const verticalOffset = scoopShape.verticalOffset;

	return ( x, y, z ) => {

		const translatedX = x - translationX;
		const translatedY = y - verticalOffset - translationY;
		const translatedZ = z - translationZ;
		const yawX = translatedX * cosineY - translatedZ * sineY;
		const yawZ = translatedX * sineY + translatedZ * cosineY;
		const tiltZY = - yawX * sineZ + translatedY * cosineZ;
		const scaledX = ( yawX * cosineZ + translatedY * sineZ ) / radiusX;
		const scaledY = ( tiltZY * cosineX + yawZ * sineX ) / radiusY;
		const scaledZ = ( - tiltZY * sineX + yawZ * cosineX ) / radiusZ;
		const inverseLength = 1 / ( Math.hypot( scaledX, scaledY, scaledZ ) || 1 );

		for ( let index = 0; index < scoops.length; index ++ ) {

			const scoop = scoops[ index ]!;
			if ( ( scaledX * scoop.x + scaledY * scoop.y + scaledZ * scoop.z ) * inverseLength > scoop.cosine ) return true;

		}

		return false;

	};

}

// 苔の範囲と色の調整値（リファレンスに合わせてブラウザで調整した値）。
const MOSS_COVERAGE = {
	upMin: 0.25,
	upMax: 0.9,
	bandHeight: 0.14,
	bandVariation: 1,
	bandWeight: 0.9,
	concaveWeight: 0.8,
	placeWeight: 0.85,
	fbmWeight: 0.65,
	mottleEdge: 0.16,
	edge: 0.03,
	dotMin: 0.22,
	dotReach: 0.2,
	dotStrength: 0.9,
	lightMin: - 0.35,
	lightMax: 0.7,
	lightInset: 0.2,
	thresholdTop: 1,
	thresholdSlope: 0.95,
	clumpScale: 16,
	dotScale: 32,
};
const MOSS_TONE = { base: 0.72, baseGrey: 0.25, light: 1, lightBlue: 0.85 };

const pixelAxisCache = new Map<string, PixelAxisSamples>();
const textureCache = new Map<string, RockTexturePair>();

function getPixelAxisSamples( columns: number, rows: number, size: number ): PixelAxisSamples {

	const key = `${ columns }x${ rows }@${ size }`;
	const cached = pixelAxisCache.get( key );
	if ( cached !== undefined ) return cached;

	const x0 = new Uint16Array( size );
	const x1 = new Uint16Array( size );
	const tx = new Float32Array( size );
	const y0 = new Uint16Array( size );
	const y1 = new Uint16Array( size );
	const ty = new Float32Array( size );

	for ( let index = 0; index < size; index ++ ) {

		const gridX = index / size * columns;
		const gridY = index / size * rows;
		const floorX = Math.floor( gridX );
		const floorY = Math.floor( gridY );

		x0[ index ] = floorX;
		x1[ index ] = ( floorX + 1 ) % columns;
		tx[ index ] = smoothstep( 0, 1, gridX - floorX );
		y0[ index ] = floorY;
		y1[ index ] = ( floorY + 1 ) % rows;
		ty[ index ] = smoothstep( 0, 1, gridY - floorY );

	}

	const samples = { x0, x1, tx, y0, y1, ty };
	pixelAxisCache.set( key, samples );
	if ( pixelAxisCache.size > 32 ) pixelAxisCache.delete( pixelAxisCache.keys().next().value! );

	return samples;

}

function copyTextureData( texture: TextureData ): TextureData {

	return { ...texture, data: texture.data.slice() };

}

function copyTexturePair( textures: RockTexturePair ): RockTexturePair {

	return { albedo: copyTextureData( textures.albedo ), normal: copyTextureData( textures.normal ) };

}

function getMeshTextureKey( mesh: MeshData ): string {

	let hash = 2166136261;
	const values = [ ...mesh.positions, ...mesh.normals, ...mesh.uvs, ...mesh.indices ];

	for ( const value of values ) {
		hash = Math.imul( hash ^ Math.round( value * 4096 ), 16777619 );
	}

	return `${ mesh.positions.length / 3 }:${ mesh.indices.length / 3 }:${ hash >>> 0 }`;

}

function rasterizeRockSurfaceNormals( mesh: MeshData, size: number, normals: Float32Array ): void {

	const covered = new Uint8Array( size * size );

	for ( let offset = 0; offset < mesh.indices.length; offset += 3 ) {

		const firstVertex = mesh.indices[ offset ]!;
		const secondVertex = mesh.indices[ offset + 1 ]!;
		const thirdVertex = mesh.indices[ offset + 2 ]!;
		let firstU = mesh.uvs[ firstVertex * 2 ]!;
		const firstV = mesh.uvs[ firstVertex * 2 + 1 ]!;
		let secondU = mesh.uvs[ secondVertex * 2 ]!;
		const secondV = mesh.uvs[ secondVertex * 2 + 1 ]!;
		let thirdU = mesh.uvs[ thirdVertex * 2 ]!;
		const thirdV = mesh.uvs[ thirdVertex * 2 + 1 ]!;
		const minimumU = Math.min( firstU, secondU, thirdU );
		const maximumU = Math.max( firstU, secondU, thirdU );

		if ( maximumU - minimumU > 0.5 ) {
			if ( firstU <= 0.5 ) firstU += 1;
			if ( secondU <= 0.5 ) secondU += 1;
			if ( thirdU <= 0.5 ) thirdU += 1;
		}

		const determinant = ( secondV - thirdV ) * ( firstU - thirdU ) + ( thirdU - secondU ) * ( firstV - thirdV );
		if ( Math.abs( determinant ) < 1e-10 ) continue;

		const minimumX = Math.floor( Math.min( firstU, secondU, thirdU ) * size );
		const maximumX = Math.ceil( Math.max( firstU, secondU, thirdU ) * size );
		const minimumY = Math.max( 0, Math.floor( Math.min( firstV, secondV, thirdV ) * size ) );
		const maximumY = Math.min( size - 1, Math.ceil( Math.max( firstV, secondV, thirdV ) * size ) );
		const secondVMinusThirdV = secondV - thirdV;
		const thirdUMinusSecondU = thirdU - secondU;
		const thirdVMinusFirstV = thirdV - firstV;
		const firstUMinusThirdU = firstU - thirdU;
		const firstNormal = firstVertex * 3;
		const secondNormal = secondVertex * 3;
		const thirdNormal = thirdVertex * 3;

		for ( let y = minimumY; y <= maximumY; y ++ ) {

			const v = ( y + 0.5 ) / size;

			for ( let x = minimumX; x <= maximumX; x ++ ) {

				const u = ( x + 0.5 ) / size;
				const firstWeight = ( secondVMinusThirdV * ( u - thirdU ) + thirdUMinusSecondU * ( v - thirdV ) ) / determinant;
				const secondWeight = ( thirdVMinusFirstV * ( u - thirdU ) + firstUMinusThirdU * ( v - thirdV ) ) / determinant;
				const thirdWeight = 1 - firstWeight - secondWeight;
				if ( firstWeight < - 0.001 || secondWeight < - 0.001 || thirdWeight < - 0.001 ) continue;

				let normalX = 0;
				let normalY = 0;
				let normalZ = 0;
				normalX += mesh.normals[ firstNormal ]! * firstWeight;
				normalY += mesh.normals[ firstNormal + 1 ]! * firstWeight;
				normalZ += mesh.normals[ firstNormal + 2 ]! * firstWeight;
				normalX += mesh.normals[ secondNormal ]! * secondWeight;
				normalY += mesh.normals[ secondNormal + 1 ]! * secondWeight;
				normalZ += mesh.normals[ secondNormal + 2 ]! * secondWeight;
				normalX += mesh.normals[ thirdNormal ]! * thirdWeight;
				normalY += mesh.normals[ thirdNormal + 1 ]! * thirdWeight;
				normalZ += mesh.normals[ thirdNormal + 2 ]! * thirdWeight;
				const length = Math.hypot( normalX, normalY, normalZ ) || 1;
				const pixelX = ( ( x % size ) + size ) % size;
				const pixel = y * size + pixelX;
				const normalOffset = pixel * 3;

				if ( covered[ pixel ] === 0 ) {

					normals[ normalOffset ] = normalX / length;
					normals[ normalOffset + 1 ] = normalY / length;
					normals[ normalOffset + 2 ] = normalZ / length;
					covered[ pixel ] = 1;

				} else {

					normals[ normalOffset ] = normals[ normalOffset ]! + normalX / length;
					normals[ normalOffset + 1 ] = normals[ normalOffset + 1 ]! + normalY / length;
					normals[ normalOffset + 2 ] = normals[ normalOffset + 2 ]! + normalZ / length;

				}

			}

		}

	}

	let unfilledPixels: number[] = [];
	for ( let pixel = 0; pixel < covered.length; pixel ++ ) {
		if ( covered[ pixel ] === 0 ) unfilledPixels.push( pixel );
	}

	for ( let pass = 0; pass < 3; pass ++ ) {

		const previousCoverage = covered.slice();
		const nextUnfilledPixels: number[] = [];

		for ( const pixel of unfilledPixels ) {

			if ( previousCoverage[ pixel ] !== 0 ) continue;
			const y = Math.floor( pixel / size );
			const x = pixel - y * size;
			const above = y > 0 ? pixel - size : - 1;
			const below = y + 1 < size ? pixel + size : - 1;
			const left = y * size + ( x === 0 ? size - 1 : x - 1 );
			const right = y * size + ( x + 1 === size ? 0 : x + 1 );
			let adjacentCount = 0;
			if ( above >= 0 && previousCoverage[ above ] !== 0 ) adjacentCount ++;
			if ( below >= 0 && previousCoverage[ below ] !== 0 ) adjacentCount ++;
			if ( previousCoverage[ left ] !== 0 ) adjacentCount ++;
			if ( previousCoverage[ right ] !== 0 ) adjacentCount ++;
			if ( adjacentCount === 0 ) {
				nextUnfilledPixels.push( pixel );
				continue;
			}

			let normalX = 0;
			let normalY = 0;
			let normalZ = 0;
			if ( above >= 0 && previousCoverage[ above ] !== 0 ) {
				normalX += normals[ above * 3 ]! / adjacentCount;
				normalY += normals[ above * 3 + 1 ]! / adjacentCount;
				normalZ += normals[ above * 3 + 2 ]! / adjacentCount;
			}
			if ( below >= 0 && previousCoverage[ below ] !== 0 ) {
				normalX += normals[ below * 3 ]! / adjacentCount;
				normalY += normals[ below * 3 + 1 ]! / adjacentCount;
				normalZ += normals[ below * 3 + 2 ]! / adjacentCount;
			}
			if ( previousCoverage[ left ] !== 0 ) {
				normalX += normals[ left * 3 ]! / adjacentCount;
				normalY += normals[ left * 3 + 1 ]! / adjacentCount;
				normalZ += normals[ left * 3 + 2 ]! / adjacentCount;
			}
			if ( previousCoverage[ right ] !== 0 ) {
				normalX += normals[ right * 3 ]! / adjacentCount;
				normalY += normals[ right * 3 + 1 ]! / adjacentCount;
				normalZ += normals[ right * 3 + 2 ]! / adjacentCount;
			}

			const length = Math.hypot( normalX, normalY, normalZ ) || 1;
			const offset = pixel * 3;
			normals[ offset ] = normalX / length;
			normals[ offset + 1 ] = normalY / length;
			normals[ offset + 2 ] = normalZ / length;
			covered[ pixel ] = 1;

		}

		unfilledPixels = nextUnfilledPixels;
	}

	for ( let pixel = 0; pixel < covered.length; pixel ++ ) {

		if ( covered[ pixel ] === 0 ) continue;
		const offset = pixel * 3;
		const length = Math.hypot( normals[ offset ]!, normals[ offset + 1 ]!, normals[ offset + 2 ]! ) || 1;
		normals[ offset ] = normals[ offset ]! / length;
		normals[ offset + 1 ] = normals[ offset + 1 ]! / length;
		normals[ offset + 2 ] = normals[ offset + 2 ]! / length;

	}

}

function createSmoothedRockMossVertexNormals( mesh: MeshData, diameter: number ): Float32Array {

	const radius = Math.max( diameter * 0.04, 1e-6 );
	const radiusSquared = radius * radius;
	const buckets = new Map<string, number[]>();
	const bucketKey = ( x: number, y: number, z: number ): string => `${ x },${ y },${ z }`;
	const count = mesh.positions.length / 3;
	const minimum = [ Infinity, Infinity, Infinity ];
	const maximum = [ - Infinity, - Infinity, - Infinity ];
	for ( let vertex = 0; vertex < count; vertex ++ ) {

		const offset = vertex * 3;
		for ( let axis = 0; axis < 3; axis ++ ) {
			minimum[ axis ] = Math.min( minimum[ axis ]!, mesh.positions[ offset + axis ]! );
			maximum[ axis ] = Math.max( maximum[ axis ]!, mesh.positions[ offset + axis ]! );
		}
		const key = bucketKey( Math.floor( mesh.positions[ offset ]! / radius ), Math.floor( mesh.positions[ offset + 1 ]! / radius ), Math.floor( mesh.positions[ offset + 2 ]! / radius ) );
		const bucket = buckets.get( key ) ?? [];
		bucket.push( vertex );
		buckets.set( key, bucket );

	}
	const smoothed = new Float32Array( mesh.normals.length );
	for ( let vertex = 0; vertex < count; vertex ++ ) {

		const offset = vertex * 3;
		const x = mesh.positions[ offset ]!;
		const y = mesh.positions[ offset + 1 ]!;
		const z = mesh.positions[ offset + 2 ]!;
		const radialX = x - ( minimum[ 0 ]! + maximum[ 0 ]! ) * 0.5;
		const radialY = y - ( minimum[ 1 ]! + maximum[ 1 ]! ) * 0.5;
		const radialZ = z - ( minimum[ 2 ]! + maximum[ 2 ]! ) * 0.5;
		const radialLength = Math.hypot( radialX, radialY, radialZ ) || 1;
		const cellX = Math.floor( x / radius );
		const cellY = Math.floor( y / radius );
		const cellZ = Math.floor( z / radius );
		let normalX = 0;
		let normalY = 0;
		let normalZ = 0;
		let totalWeight = 0;
		for ( let dz = - 1; dz <= 1; dz ++ ) for ( let dy = - 1; dy <= 1; dy ++ ) for ( let dx = - 1; dx <= 1; dx ++ ) {

			const candidates = buckets.get( bucketKey( cellX + dx, cellY + dy, cellZ + dz ) );
			if ( candidates === undefined ) continue;
			for ( const candidate of candidates ) {

				const candidateOffset = candidate * 3;
				const deltaX = mesh.positions[ candidateOffset ]! - x;
				const deltaY = mesh.positions[ candidateOffset + 1 ]! - y;
				const deltaZ = mesh.positions[ candidateOffset + 2 ]! - z;
				const distanceSquared = deltaX * deltaX + deltaY * deltaY + deltaZ * deltaZ;
				if ( distanceSquared > radiusSquared ) continue;
				const weight = 1 - Math.sqrt( distanceSquared ) / radius;
				normalX += mesh.normals[ candidateOffset ]! * weight;
				normalY += mesh.normals[ candidateOffset + 1 ]! * weight;
				normalZ += mesh.normals[ candidateOffset + 2 ]! * weight;
				totalWeight += weight;

			}

		}
		if ( totalWeight === 0 ) {
			normalX = mesh.normals[ offset ]!;
			normalY = mesh.normals[ offset + 1 ]!;
			normalZ = mesh.normals[ offset + 2 ]!;
		}
		normalX = normalX * 0.25 + radialX / radialLength * 0.75;
		normalY = normalY * 0.25 + radialY / radialLength * 0.75;
		normalZ = normalZ * 0.25 + radialZ / radialLength * 0.75;
		const length = Math.hypot( normalX, normalY, normalZ ) || 1;
		smoothed[ offset ] = normalX / length;
		smoothed[ offset + 1 ] = normalY / length;
		smoothed[ offset + 2 ] = normalZ / length;

	}

	return smoothed;

}

function rasterizeRockMossSurface( mesh: MeshData, size: number, positions: Float32Array, normals: Float32Array, upFacing: Float32Array, smoothNormals: Float32Array, valid: Uint8Array ): void {

	for ( let offset = 0; offset < mesh.indices.length; offset += 3 ) {

		const firstVertex = mesh.indices[ offset ]!;
		const secondVertex = mesh.indices[ offset + 1 ]!;
		const thirdVertex = mesh.indices[ offset + 2 ]!;
		let firstU = mesh.uvs[ firstVertex * 2 ]!;
		const firstV = mesh.uvs[ firstVertex * 2 + 1 ]!;
		let secondU = mesh.uvs[ secondVertex * 2 ]!;
		const secondV = mesh.uvs[ secondVertex * 2 + 1 ]!;
		let thirdU = mesh.uvs[ thirdVertex * 2 ]!;
		const thirdV = mesh.uvs[ thirdVertex * 2 + 1 ]!;
		const minimumU = Math.min( firstU, secondU, thirdU );
		const maximumU = Math.max( firstU, secondU, thirdU );

		if ( maximumU - minimumU > 0.5 ) {
			if ( firstU <= 0.5 ) firstU += 1;
			if ( secondU <= 0.5 ) secondU += 1;
			if ( thirdU <= 0.5 ) thirdU += 1;
		}

		const determinant = ( secondV - thirdV ) * ( firstU - thirdU ) + ( thirdU - secondU ) * ( firstV - thirdV );
		if ( Math.abs( determinant ) < 1e-10 ) continue;

		const minimumX = Math.floor( Math.min( firstU, secondU, thirdU ) * size );
		const maximumX = Math.ceil( Math.max( firstU, secondU, thirdU ) * size );
		const minimumV = Math.max( 0, Math.floor( Math.min( firstV, secondV, thirdV ) * size ) );
		const maximumV = Math.min( size - 1, Math.ceil( Math.max( firstV, secondV, thirdV ) * size ) );
		const secondVMinusThirdV = secondV - thirdV;
		const thirdUMinusSecondU = thirdU - secondU;
		const thirdVMinusFirstV = thirdV - firstV;
		const firstUMinusThirdU = firstU - thirdU;
		const firstOffset = firstVertex * 3;
		const secondOffset = secondVertex * 3;
		const thirdOffset = thirdVertex * 3;

		for ( let y = minimumV; y <= maximumV; y ++ ) {

			const v = ( y + 0.5 ) / size;
			for ( let x = minimumX; x <= maximumX; x ++ ) {

				const u = ( x + 0.5 ) / size;
				const firstWeight = ( secondVMinusThirdV * ( u - thirdU ) + thirdUMinusSecondU * ( v - thirdV ) ) / determinant;
				const secondWeight = ( thirdVMinusFirstV * ( u - thirdU ) + firstUMinusThirdU * ( v - thirdV ) ) / determinant;
				const thirdWeight = 1 - firstWeight - secondWeight;
				if ( firstWeight < - 0.001 || secondWeight < - 0.001 || thirdWeight < - 0.001 ) continue;

				const pixel = y * size + ( ( x % size ) + size ) % size;
				if ( valid[ pixel ] !== 0 ) continue;

				const positionOffset = pixel * 3;
				let positionX = 0;
				let positionY = 0;
				let positionZ = 0;
				let normalX = 0;
				let normalY = 0;
				let normalZ = 0;
				let facingX = 0;
				let facingY = 0;
				let facingZ = 0;
				positionX += mesh.positions[ firstOffset ]! * firstWeight;
				positionY += mesh.positions[ firstOffset + 1 ]! * firstWeight;
				positionZ += mesh.positions[ firstOffset + 2 ]! * firstWeight;
				normalX += mesh.normals[ firstOffset ]! * firstWeight;
				normalY += mesh.normals[ firstOffset + 1 ]! * firstWeight;
				normalZ += mesh.normals[ firstOffset + 2 ]! * firstWeight;
				facingX += smoothNormals[ firstOffset ]! * firstWeight;
				facingY += smoothNormals[ firstOffset + 1 ]! * firstWeight;
				facingZ += smoothNormals[ firstOffset + 2 ]! * firstWeight;
				positionX += mesh.positions[ secondOffset ]! * secondWeight;
				positionY += mesh.positions[ secondOffset + 1 ]! * secondWeight;
				positionZ += mesh.positions[ secondOffset + 2 ]! * secondWeight;
				normalX += mesh.normals[ secondOffset ]! * secondWeight;
				normalY += mesh.normals[ secondOffset + 1 ]! * secondWeight;
				normalZ += mesh.normals[ secondOffset + 2 ]! * secondWeight;
				facingX += smoothNormals[ secondOffset ]! * secondWeight;
				facingY += smoothNormals[ secondOffset + 1 ]! * secondWeight;
				facingZ += smoothNormals[ secondOffset + 2 ]! * secondWeight;
				positionX += mesh.positions[ thirdOffset ]! * thirdWeight;
				positionY += mesh.positions[ thirdOffset + 1 ]! * thirdWeight;
				positionZ += mesh.positions[ thirdOffset + 2 ]! * thirdWeight;
				normalX += mesh.normals[ thirdOffset ]! * thirdWeight;
				normalY += mesh.normals[ thirdOffset + 1 ]! * thirdWeight;
				normalZ += mesh.normals[ thirdOffset + 2 ]! * thirdWeight;
				facingX += smoothNormals[ thirdOffset ]! * thirdWeight;
				facingY += smoothNormals[ thirdOffset + 1 ]! * thirdWeight;
				facingZ += smoothNormals[ thirdOffset + 2 ]! * thirdWeight;

				const normalLength = Math.hypot( normalX, normalY, normalZ ) || 1;
				const facingLength = Math.hypot( facingX, facingY, facingZ ) || 1;
				positions[ positionOffset ] = positionX;
				positions[ positionOffset + 1 ] = positionY;
				positions[ positionOffset + 2 ] = positionZ;
				normals[ positionOffset ] = normalX / normalLength;
				normals[ positionOffset + 1 ] = normalY / normalLength;
				normals[ positionOffset + 2 ] = normalZ / normalLength;
				upFacing[ pixel ] = facingY / facingLength;
				valid[ pixel ] = 1;

			}

		}

	}

}

function getMeshDiameter( mesh: MeshData ): number {

	const minimum = [ Infinity, Infinity, Infinity ];
	const maximum = [ - Infinity, - Infinity, - Infinity ];
	for ( let offset = 0; offset < mesh.positions.length; offset += 3 ) {
		for ( let axis = 0; axis < 3; axis ++ ) {
			minimum[ axis ] = Math.min( minimum[ axis ]!, mesh.positions[ offset + axis ]! );
			maximum[ axis ] = Math.max( maximum[ axis ]!, mesh.positions[ offset + axis ]! );
		}
	}

	return Math.max( maximum[ 0 ]! - minimum[ 0 ]!, maximum[ 1 ]! - minimum[ 1 ]!, maximum[ 2 ]! - minimum[ 2 ]!, 1e-6 );

}

export function createRockMossSurfaceSamples( seed: number, size: number, amount: number, mesh?: MeshData, minimumPositionY = 0, minimumNormalY = - 0.15, scoopShape?: { shape: RockHullShape; verticalOffset: number }, ridgeUvSegments: RockRidgeUvSegment[] = [], edgeHighlights?: Float32Array ): RockMossSurfaceSamples {

	const positions = new Float32Array( size * size * 3 );
	const normals = new Float32Array( size * size * 3 );
	const valid = new Uint8Array( size * size );
	const diameter = mesh === undefined ? 2 : getMeshDiameter( mesh );
	const radius = diameter * 0.5;

	for ( let y = 0; y < size; y ++ ) {
		const latitude = ( y / size - 0.5 ) * Math.PI;
		const latitudeCos = Math.cos( latitude );
		const latitudeSin = Math.sin( latitude );
		for ( let x = 0; x < size; x ++ ) {
			const longitude = ( x / size - 0.5 ) * Math.PI * 2;
			const offset = ( y * size + x ) * 3;
			const normalX = latitudeCos * Math.cos( longitude );
			const normalY = latitudeSin;
			const normalZ = latitudeCos * Math.sin( longitude );
			positions[ offset ] = normalX * radius;
			positions[ offset + 1 ] = normalY * radius;
			positions[ offset + 2 ] = normalZ * radius;
			normals[ offset ] = normalX;
			normals[ offset + 1 ] = normalY;
			normals[ offset + 2 ] = normalZ;
			if ( mesh === undefined ) valid[ y * size + x ] = 1;
		}
	}

	const upFacing = new Float32Array( size * size );
	if ( mesh !== undefined ) {
		const smoothNormals = createSmoothedRockMossVertexNormals( mesh, diameter );
		rasterizeRockMossSurface( mesh, size, positions, normals, upFacing, smoothNormals, valid );
	} else {
		for ( let pixel = 0; pixel < size * size; pixel ++ ) upFacing[ pixel ] = normals[ pixel * 3 + 1 ]!;
	}
	const surfaceEdges = edgeHighlights ?? createRockEdgeHighlightMap( ridgeUvSegments, size, diameter );
	const coverageData = createMossCoverageMap( seed, size, amount, positions, normals, upFacing, valid, diameter, minimumPositionY, minimumNormalY, scoopShape, surfaceEdges );

	return { positions, normals, upFacing, valid, coverage: coverageData.coverage, clumps: coverageData.clumps, activePixels: coverageData.activePixels, edgeHighlights: surfaceEdges, diameter };

}

function createMossCoverageMap( seed: number, size: number, amount: number, positions: Float32Array, normals: Float32Array, upFacing: Float32Array, valid: Uint8Array, diameter: number, minimumPositionY: number, minimumNormalY: number, scoopShape: { shape: RockHullShape; verticalOffset: number } | undefined, edgeHighlights: Float32Array ): { coverage: Float32Array; clumps: Float32Array; activePixels: Uint32Array } {

	const coverage = new Float32Array( size * size );
	const clumps = new Float32Array( size * size );
	if ( amount === 0 ) return { coverage, clumps, activePixels: new Uint32Array( 0 ) };
	const activePixels = new Uint32Array( size * size );
	let activePixelCount = 0;

	const MOSS = MOSS_COVERAGE;
	const threshold = MOSS.thresholdTop - amount * MOSS.thresholdSlope;
	const broadScale = 3.2 / diameter;
	const octaveScale = 6.4 / diameter;
	const clumpScale = MOSS.clumpScale / diameter;
	const fineClumpScale = MOSS.dotScale / diameter;
	let maximumY = minimumPositionY;
	const minimum = [ Infinity, Infinity, Infinity ];
	const maximum = [ - Infinity, - Infinity, - Infinity ];
	for ( let pixel = 0; pixel < valid.length; pixel ++ ) {
		if ( valid[ pixel ] !== 0 ) {

			const offset = pixel * 3;
			maximumY = Math.max( maximumY, positions[ offset + 1 ]! );
			for ( let axis = 0; axis < 3; axis ++ ) {

				minimum[ axis ] = Math.min( minimum[ axis ]!, positions[ offset + axis ]! );
				maximum[ axis ] = Math.max( maximum[ axis ]!, positions[ offset + axis ]! );

			}

		}
	}
	const noiseBounds = ( scale: number ) => ( {
		minimum: [ Math.floor( minimum[ 0 ]! * scale ) - 1, Math.floor( minimum[ 1 ]! * scale ) - 1, Math.floor( minimum[ 2 ]! * scale ) - 1 ] as [ number, number, number ],
		maximum: [ Math.ceil( maximum[ 0 ]! * scale ) + 1, Math.ceil( maximum[ 1 ]! * scale ) + 1, Math.ceil( maximum[ 2 ]! * scale ) + 1 ] as [ number, number, number ]
	} );
	const broadNoise = createNoise3D( seed + 241, noiseBounds( broadScale ) );
	const octaveNoise = createNoise3D( seed + 257, noiseBounds( octaveScale ) );
	const clumpNoise = createGradientNoise3D( seed + 271, noiseBounds( clumpScale ) );
	const fineClumpNoise = createGradientNoise3D( seed + 293, noiseBounds( fineClumpScale ) );
	const isConcave = createRockScoopTester( scoopShape );
	const aboveGroundHeight = Math.max( maximumY - minimumPositionY, diameter * 0.1 );

	for ( let y = 0; y < size; y ++ ) {
		for ( let x = 0; x < size; x ++ ) {

			const pixel = y * size + x;
			if ( valid[ pixel ] === 0 ) continue;
			const offset = pixel * 3;
			const positionX = positions[ offset ]!;
			const positionY = positions[ offset + 1 ]!;
			const positionZ = positions[ offset + 2 ]!;
			const normalY = normals[ offset + 1 ]!;
			const smoothNormalY = upFacing[ pixel ]!;
			if ( positionY <= minimumPositionY + 1e-6 ) continue;

			const up = smoothstep( MOSS.upMin, MOSS.upMax, smoothNormalY );
			const normalizedHeight = ( positionY - minimumPositionY ) / aboveGroundHeight;
			const concave = normalY < 0.3 && isConcave( positionX, positionY, positionZ );

			const broad = broadNoise( positionX * broadScale, positionY * broadScale, positionZ * broadScale );
			const octave = octaveNoise( positionX * octaveScale, positionY * octaveScale, positionZ * octaveScale );
			const fbm = broad * 0.62 + octave * 0.38;
			const mottle = clumpNoise( positionX * clumpScale, positionY * clumpScale, positionZ * clumpScale );
			const bandHeight = MOSS.bandHeight * ( 1 + clamp( fbm * 1.7, - 1, 1 ) * MOSS.bandVariation );
			const bandFacing = smoothstep( - 0.35, 0.05, normalY );
			const baseBand = ( 1 - smoothstep( bandHeight * 0.45, bandHeight, normalizedHeight ) ) * bandFacing;
			const dotsNoise = fineClumpNoise( positionX * fineClumpScale, positionY * fineClumpScale, positionZ * fineClumpScale );
			const place = Math.max( up, baseBand * MOSS.bandWeight, concave ? MOSS.concaveWeight : 0 );
			const signal = place * MOSS.placeWeight + fbm * MOSS.fbmWeight + mottle * MOSS.mottleEdge;
			const ridge = smoothstep( 0.035, 0.18, edgeHighlights[ pixel ]! );
			const ridgeSuppression = 1 - ridge * 0.98;
			const facing = concave ? 1 : smoothstep( minimumNormalY, minimumNormalY + 0.13, normalY );
			const burialFade = smoothstep( minimumPositionY, minimumPositionY + diameter * 0.004, positionY );
			const mask = facing * burialFade * ridgeSuppression;
			const solid = smoothstep( threshold - MOSS.edge, threshold + MOSS.edge, signal );
			const dots = smoothstep( MOSS.dotMin, MOSS.dotMin + 0.06, dotsNoise ) * smoothstep( threshold - MOSS.dotReach, threshold, signal );
			const patch = Math.max( solid, dots * MOSS.dotStrength ) * mask;
			const clumpCoverage = smoothstep( MOSS.lightMin, MOSS.lightMax, mottle ) * smoothstep( threshold, threshold + MOSS.lightInset, signal ) * patch;
			coverage[ pixel ] = patch;
			clumps[ pixel ] = clumpCoverage;
			if ( patch > 0 || clumpCoverage > 0 ) activePixels[ activePixelCount ++ ] = pixel;

		}
	}

	return { coverage, clumps, activePixels: activePixels.subarray( 0, activePixelCount ) };

}

export function createRockEdgeHighlightMap( segments: RockRidgeUvSegment[], size: number, rockSize: number ): Float32Array {

	const highlights = new Float32Array( size * size );
	const drawSegment = ( segment: RockRidgeUvSegment ): void => {

		let u0 = segment[ 0 ][ 0 ];
		let u1 = segment[ 1 ][ 0 ];
		if ( u1 - u0 > 0.5 ) u0 += 1;
		if ( u0 - u1 > 0.5 ) u1 += 1;
		const v0 = segment[ 0 ][ 1 ];
		const v1 = segment[ 1 ][ 1 ];
		const latitude = ( ( v0 + v1 ) * 0.5 - 0.5 ) * Math.PI;
		const scaleU = Math.max( rockSize * Math.PI * Math.cos( latitude ), rockSize * 0.04 );
		const scaleV = rockSize * Math.PI * 0.5;
		const endX = ( u1 - u0 ) * scaleU;
		const endY = ( v1 - v0 ) * scaleV;
		const lengthSquared = endX * endX + endY * endY;
		const highlightRadius = rockSize * 0.025;
		const highlightSigma = rockSize * 0.0125;
		const marginU = highlightRadius / scaleU;
		const marginV = highlightRadius / scaleV;
		const minimumX = Math.floor( ( Math.min( u0, u1 ) - marginU ) * size );
		const maximumX = Math.ceil( ( Math.max( u0, u1 ) + marginU ) * size );
		const minimumY = Math.max( 0, Math.floor( ( Math.min( v0, v1 ) - marginV ) * size ) );
		const maximumY = Math.min( size - 1, Math.ceil( ( Math.max( v0, v1 ) + marginV ) * size ) );

		for ( let pixelY = minimumY; pixelY <= maximumY; pixelY ++ ) {

			const v = ( pixelY + 0.5 ) / size;
			for ( let rawX = minimumX; rawX <= maximumX; rawX ++ ) {

				const pixelX = ( ( rawX % size ) + size ) % size;
				const u = ( rawX + 0.5 ) / size;
				const localX = ( u - u0 ) * scaleU;
				const localY = ( v - v0 ) * scaleV;
				const along = lengthSquared > 1e-12 ? clamp( ( localX * endX + localY * endY ) / lengthSquared, 0, 1 ) : 0;
				const distance = Math.hypot( localX - endX * along, localY - endY * along );
				const highlight = distance <= highlightRadius ? Math.exp( - 0.5 * ( distance / highlightSigma ) ** 2 ) : 0;
				const pixel = pixelY * size + pixelX;
				highlights[ pixel ] = Math.max( highlights[ pixel ]!, highlight );

			}

		}

	};

	for ( const segment of segments ) drawSegment( segment );

	return highlights;

}

export interface RockCrackSegment {
	u0: number;
	v0: number;
	u1: number;
	v1: number;
	width0: number;
	width1: number;
}

export interface RockCrackPoint {
	u: number;
	v: number;
}

export interface RockCrackPath {
	points: RockCrackPoint[];
	segments: RockCrackSegment[];
	branch: boolean;
}

function clamp( value: number, minimum: number, maximum: number ): number {

	return Math.max( minimum, Math.min( maximum, value ) );

}

function fract( value: number ): number {

	return value - Math.floor( value );

}

function smoothstep( minimum: number, maximum: number, value: number ): number {

	const amount = clamp( ( value - minimum ) / ( maximum - minimum ), 0, 1 );

	return amount * amount * ( 3 - 2 * amount );

}

function createRandom( seed: number ): () => number {

	let state = ( Math.floor( Math.abs( seed ) * 1000 ) + 0x6d2b79f5 ) >>> 0;

	return () => {

		state = ( state + 0x6d2b79f5 ) >>> 0;
		let value = state;
		value = Math.imul( value ^ value >>> 15, value | 1 );
		value ^= value + Math.imul( value ^ value >>> 7, value | 61 );

		return ( ( value ^ value >>> 14 ) >>> 0 ) / 4294967296;

	};

}

function hashGrid( seed: number, x: number, y: number ): number {

	let value = ( seed ^ Math.imul( x + 1, 0x9e3779b1 ) ^ Math.imul( y + 1, 0x85ebca6b ) ) >>> 0;
	value = Math.imul( value ^ value >>> 16, 0x7feb352d );
	value = Math.imul( value ^ value >>> 15, 0x846ca68b );
	value ^= value >>> 16;

	return value / 2147483648 - 1;

}

function createPeriodicNoise( seed: number, columns: number, rows: number, size: number ): NoiseField {

	const values = new Float32Array( columns * rows );

	for ( let y = 0; y < rows; y ++ ) {

		for ( let x = 0; x < columns; x ++ ) {

			values[ y * columns + x ] = hashGrid( seed, x, y );

		}

	}

	const sample = ( u: number, v: number ): number => {

		const gridX = u * columns;
		const gridY = v * rows;
		const x = Math.floor( gridX );
		const y = Math.floor( gridY );
		const nextX = ( x + 1 ) % columns;
		const nextY = ( y + 1 ) % rows;
		const amountX = smoothstep( 0, 1, gridX - x );
		const amountY = smoothstep( 0, 1, gridY - y );
		const top = values[ y * columns + x ]! * ( 1 - amountX ) + values[ y * columns + nextX ]! * amountX;
		const bottom = values[ nextY * columns + x ]! * ( 1 - amountX ) + values[ nextY * columns + nextX ]! * amountX;

		return top * ( 1 - amountY ) + bottom * amountY;

	};
	const sampleUnit = ( u: number, v: number ): number => {

		const gridX = u * columns;
		const gridY = v * rows;
		const x = Math.floor( gridX );
		const y = Math.floor( gridY );
		const nextX = x + 1 === columns ? 0 : x + 1;
		const nextY = y + 1 === rows ? 0 : y + 1;
		const amountX = smoothstep( 0, 1, gridX - x );
		const amountY = smoothstep( 0, 1, gridY - y );
		const top = values[ y * columns + x ]! * ( 1 - amountX ) + values[ y * columns + nextX ]! * amountX;
		const bottom = values[ nextY * columns + x ]! * ( 1 - amountX ) + values[ nextY * columns + nextX ]! * amountX;

		return top * ( 1 - amountY ) + bottom * amountY;

	};
	const { x0, x1, tx, y0, y1, ty } = getPixelAxisSamples( columns, rows, size );
	const fillPixelRow = ( y: number, output: Float64Array ): void => {

		const topOffset = y0[ y ]! * columns;
		const bottomOffset = y1[ y ]! * columns;
		const amountY = ty[ y ]!;

		for ( let x = 0; x < size; x ++ ) {

			const firstX = x0[ x ]!;
			const secondX = x1[ x ]!;
			const amountX = tx[ x ]!;
			const top = values[ topOffset + firstX ]! * ( 1 - amountX ) + values[ topOffset + secondX ]! * amountX;
			const bottom = values[ bottomOffset + firstX ]! * ( 1 - amountX ) + values[ bottomOffset + secondX ]! * amountX;

			output[ x ] = top * ( 1 - amountY ) + bottom * amountY;

		}

	};

	return Object.assign( sample, { fillPixelRow, sampleUnit } );

}

function createPeriodicNoise1D( seed: number, columns: number ): ( value: number ) => number {

	const values = new Float32Array( columns );

	for ( let x = 0; x < columns; x ++ ) {

		values[ x ] = hashGrid( seed, x, 0 );

	}

	return ( value: number ): number => {

		const grid = value * columns;
		const index = Math.floor( grid );
		const next = ( index + 1 ) % columns;
		const amount = smoothstep( 0, 1, grid - index );

		return values[ index ]! * ( 1 - amount ) + values[ next ]! * amount;

	};

}

function addCrackPath(
	start: RockCrackPoint,
	angle: number,
	length: number,
	steps: number,
	width: number,
	random: () => number,
	branch: boolean,
): RockCrackPath {

	const points: RockCrackPoint[] = [ start ];
	let point = start;
	let direction = angle;

	for ( let step = 0; step < steps; step ++ ) {

		direction += ( random() - 0.5 ) * 1.6;
		const next = {
			u: point.u + Math.cos( direction ) * length / steps,
			v: point.v + Math.sin( direction ) * length / steps,
		};

		points.push( next );
		point = next;

	}

	const widths = points.map( ( _, index ) => {

		if ( index === 0 || index === steps ) return 0;

		const progress = index / steps;
		const taper = Math.pow( Math.sin( progress * Math.PI ), 0.8 );
		const variation = 0.76 + 0.24 * ( Math.sin( start.u * 31.7 + start.v * 57.3 + index * 1.91 ) * 0.5 + 0.5 );

		return width * taper * variation;

	} );
	const segments = points.slice( 0, - 1 ).map( ( first, index ) => ( {
		u0: first.u,
		v0: first.v,
		u1: points[ index + 1 ]!.u,
		v1: points[ index + 1 ]!.v,
		width0: widths[ index ]!,
		width1: widths[ index + 1 ]!,
	} ) );

	return { points, segments, branch };

}

export function createRockCrackPaths( seed: number, dominantAngle: number, detailMask: ( u: number, v: number ) => number, frontUv?: RockCrackPoint ): RockCrackPath[] {

	const random = createRandom( seed + 907 );
	const paths: RockCrackPath[] = [];
	const count = 2 + Math.floor( random() * 3 );
	const frontPathCount = frontUv === undefined ? 0 : Math.ceil( count / 2 );

	for ( let index = 0; index < count; index ++ ) {

		let start = { u: random(), v: 0.32 + random() * 0.36 };
		for ( let attempt = 0; attempt < 8; attempt ++ ) {

			const candidate = index < frontPathCount
				? {
					u: ( frontUv!.u + ( random() - 0.5 ) * 0.16 + 1 ) % 1,
				v: clamp( frontUv!.v + ( random() - 0.5 ) * 0.12, 0.16, 0.84 ),
				}
				: { u: random(), v: 0.32 + random() * 0.36 };
			start = candidate;
			if ( detailMask( candidate.u, candidate.v ) >= 0.28 ) break;

		}

		const angle = index < frontPathCount
			? ( random() < 0.5 ? 0 : Math.PI ) + ( random() - 0.5 ) * 0.85
			: dominantAngle + ( random() - 0.5 ) * 1.8;
		const width = 0.0064 + random() * 0.0005;
		const length = 0.19 + random() * 0.1;
		const steps = 8 + Math.floor( random() * 5 );
		paths.push( addCrackPath( start, angle, length, steps, width, random, false ) );

	}

	return paths;

}

export function findRockFrontUv( mesh?: MeshData ): RockCrackPoint | undefined {

	if ( mesh === undefined ) return undefined;
	let frontUv: RockCrackPoint | undefined;
	let bestScore = - Infinity;
	const viewDirection: Vec3 = [ 0, 0.32, 0.95 ];
	const viewLength = Math.hypot( viewDirection[ 0 ], viewDirection[ 1 ], viewDirection[ 2 ] );

	for ( let triangle = 0; triangle < mesh.indices.length; triangle += 3 ) {

		const vertices = [ mesh.indices[ triangle ]!, mesh.indices[ triangle + 1 ]!, mesh.indices[ triangle + 2 ]! ];
		const first = vertices[ 0 ]! * 3;
		const second = vertices[ 1 ]! * 3;
		const third = vertices[ 2 ]! * 3;
		const ab: Vec3 = [ mesh.positions[ second ]! - mesh.positions[ first ]!, mesh.positions[ second + 1 ]! - mesh.positions[ first + 1 ]!, mesh.positions[ second + 2 ]! - mesh.positions[ first + 2 ]! ];
		const ac: Vec3 = [ mesh.positions[ third ]! - mesh.positions[ first ]!, mesh.positions[ third + 1 ]! - mesh.positions[ first + 1 ]!, mesh.positions[ third + 2 ]! - mesh.positions[ first + 2 ]! ];
		const normalZ = ab[ 0 ] * ac[ 1 ] - ab[ 1 ] * ac[ 0 ];
		const normalX = ab[ 1 ] * ac[ 2 ] - ab[ 2 ] * ac[ 1 ];
		const normalY = ab[ 2 ] * ac[ 0 ] - ab[ 0 ] * ac[ 2 ];
		const area = Math.hypot( normalX, normalY, normalZ ) * 0.5;
		const facing = ( normalX * viewDirection[ 0 ] + normalY * viewDirection[ 1 ] + normalZ * viewDirection[ 2 ] ) / Math.max( area * 2 * viewLength, 1e-8 );
		if ( facing < 0.55 ) continue;

		const uvs: [ number, number ][] = vertices.map( ( vertex ) => [ mesh.uvs[ vertex * 2 ]!, mesh.uvs[ vertex * 2 + 1 ]! ] );
		if ( Math.max( ...uvs.map( ( uv ) => uv[ 0 ] ) ) - Math.min( ...uvs.map( ( uv ) => uv[ 0 ] ) ) > 0.5 ) {
			for ( const uv of uvs ) if ( uv[ 0 ] <= 0.5 ) uv[ 0 ] = uv[ 0 ] + 1;
		}
		const score = area * facing;
		if ( score <= bestScore ) continue;

		frontUv = {
			u: ( uvs.reduce( ( total, uv ) => total + uv[ 0 ], 0 ) / 3 ) % 1,
			v: 0.5,
		};
		bestScore = score;

	}

	return frontUv;

}

function createCrackDistanceMap( size: number, paths: RockCrackPath[] ): { distances: Float32Array; sides: Int8Array } {

	const distances = new Float32Array( size * size );
	distances.fill( Infinity );
	const sides = new Int8Array( size * size );

	for ( const path of paths ) {

		for ( const segment of path.segments ) {

			const deltaU = segment.u1 - segment.u0;
			const deltaV = segment.v1 - segment.v0;
			const lengthSquared = deltaU * deltaU + deltaV * deltaV;
			const margin = Math.max( segment.width0, segment.width1 ) * 3.5 + 1 / size;

			for ( const shift of [ - 1, 0, 1 ] ) {

				const startU = segment.u0 + shift;
				const endU = segment.u1 + shift;
				const minimumX = Math.floor( ( Math.min( startU, endU ) - margin ) * size );
				const maximumX = Math.ceil( ( Math.max( startU, endU ) + margin ) * size );
				const minimumY = Math.max( 0, Math.floor( ( Math.min( segment.v0, segment.v1 ) - margin ) * size ) );
				const maximumY = Math.min( size - 1, Math.ceil( ( Math.max( segment.v0, segment.v1 ) + margin ) * size ) );

				for ( let y = minimumY; y <= maximumY; y ++ ) {

					for ( let x = minimumX; x <= maximumX; x ++ ) {

						const u = x / size;
						const v = y / size;
						const projection = clamp( ( ( u - startU ) * deltaU + ( v - segment.v0 ) * deltaV ) / lengthSquared, 0, 1 );
						const deltaX = u - startU - deltaU * projection;
						const deltaY = v - segment.v0 - deltaV * projection;
						const localWidth = Math.max( segment.width0 + ( segment.width1 - segment.width0 ) * projection, 0.00008 );
						const distance = ( deltaX * deltaX + deltaY * deltaY ) / ( localWidth * localWidth );
						const index = y * size + ( ( x % size ) + size ) % size;

						if ( distance < distances[ index ]! ) {

							distances[ index ] = distance;
							sides[ index ] = deltaU * deltaY - deltaV * deltaX >= 0 ? 1 : - 1;

						}

					}

				}

			}

		}

	}

	return { distances, sides };

}

function matchAlbedoMean( data: Uint8Array, pixelCount: number ): void {

	const target = [ 158, 168, 180 ];
	const total = [ 0, 0, 0 ];

	for ( let offset = 0; offset < data.length; offset += 4 ) {

		total[ 0 ]! += data[ offset ]!;
		total[ 1 ]! += data[ offset + 1 ]!;
		total[ 2 ]! += data[ offset + 2 ]!;

	}

	const adjustment = total.map( ( value, channel ) => target[ channel ]! - value / pixelCount );

	for ( let offset = 0; offset < data.length; offset += 4 ) {

		data[ offset ] = Math.round( clamp( data[ offset ]! + adjustment[ 0 ]!, 0, 255 ) );
		data[ offset + 1 ] = Math.round( clamp( data[ offset + 1 ]! + adjustment[ 1 ]!, 0, 255 ) );
		data[ offset + 2 ] = Math.round( clamp( data[ offset + 2 ]! + adjustment[ 2 ]!, 0, 255 ) );

	}

}

function getTextureFacetNormals( seed: number, mesh?: MeshData, scoopShape?: RockHullShape, scoopVerticalOffset = 0 ): Vec3[] {

	if ( mesh === undefined ) return createRockFacetNormals( seed );

	const clusters: { sum: Vec3; area: number }[] = [];
	let totalArea = 0;

	for ( let offset = 0; offset < mesh.indices.length; offset += 3 ) {

		const first = mesh.indices[ offset ]! * 3;
		const second = mesh.indices[ offset + 1 ]! * 3;
		const third = mesh.indices[ offset + 2 ]! * 3;
		const ab: Vec3 = [ mesh.positions[ second ]! - mesh.positions[ first ]!, mesh.positions[ second + 1 ]! - mesh.positions[ first + 1 ]!, mesh.positions[ second + 2 ]! - mesh.positions[ first + 2 ]! ];
		const ac: Vec3 = [ mesh.positions[ third ]! - mesh.positions[ first ]!, mesh.positions[ third + 1 ]! - mesh.positions[ first + 1 ]!, mesh.positions[ third + 2 ]! - mesh.positions[ first + 2 ]! ];
		const cross: Vec3 = [ ab[ 1 ] * ac[ 2 ] - ab[ 2 ] * ac[ 1 ], ab[ 2 ] * ac[ 0 ] - ab[ 0 ] * ac[ 2 ], ab[ 0 ] * ac[ 1 ] - ab[ 1 ] * ac[ 0 ] ];
		const area = Math.hypot( cross[ 0 ], cross[ 1 ], cross[ 2 ] ) * 0.5;
		if ( area <= 1e-9 ) continue;

		const center: Vec3 = [ ( mesh.positions[ first ]! + mesh.positions[ second ]! + mesh.positions[ third ]! ) / 3, ( mesh.positions[ first + 1 ]! + mesh.positions[ second + 1 ]! + mesh.positions[ third + 1 ]! ) / 3, ( mesh.positions[ first + 2 ]! + mesh.positions[ second + 2 ]! + mesh.positions[ third + 2 ]! ) / 3 ];
		if ( scoopShape !== undefined && isRockScoopInterior( center, scoopShape, scoopVerticalOffset ) ) continue;
		const normal: Vec3 = [ cross[ 0 ] / ( area * 2 ), cross[ 1 ] / ( area * 2 ), cross[ 2 ] / ( area * 2 ) ];
		const cluster = clusters.find( ( candidate ) => {

			const length = Math.hypot( candidate.sum[ 0 ], candidate.sum[ 1 ], candidate.sum[ 2 ] ) || 1;
			return ( normal[ 0 ] * candidate.sum[ 0 ] + normal[ 1 ] * candidate.sum[ 1 ] + normal[ 2 ] * candidate.sum[ 2 ] ) / length >= 0.995;

		} );

		if ( cluster === undefined ) {

			clusters.push( { sum: [ normal[ 0 ] * area, normal[ 1 ] * area, normal[ 2 ] * area ], area } );

		} else {

			cluster.sum[ 0 ] += normal[ 0 ] * area;
			cluster.sum[ 1 ] += normal[ 1 ] * area;
			cluster.sum[ 2 ] += normal[ 2 ] * area;
			cluster.area += area;

		}

		totalArea += area;

	}

	const normals = clusters
		.filter( ( cluster ) => cluster.area >= totalArea * 0.003 )
		.sort( ( first, second ) => second.area - first.area )
		.slice( 0, 36 )
		.map( ( cluster ) => {

			const length = Math.hypot( cluster.sum[ 0 ], cluster.sum[ 1 ], cluster.sum[ 2 ] ) || 1;
			return [ cluster.sum[ 0 ] / length, cluster.sum[ 1 ] / length, cluster.sum[ 2 ] / length ] as Vec3;

		} );

	for ( const normal of createRockFacetNormals( seed ) ) {

		if ( normals.length >= 24 ) break;
		if ( normals.some( ( candidate ) => candidate[ 0 ] * normal[ 0 ] + candidate[ 1 ] * normal[ 1 ] + candidate[ 2 ] * normal[ 2 ] > 0.995 ) ) continue;
		normals.push( normal );

	}

	return normals.length >= 20 ? normals : createRockFacetNormals( seed );

}

export function createRockTextures( seed: number, size = 1024, shapeSeed = seed, shapeMesh?: MeshData, shapeVariant?: string, scoopShape?: { shape: RockHullShape; verticalOffset: number }, ridgeUvSegments: RockRidgeUvSegment[] = [], mossOptions?: RockMossTextureOptions ): { albedo: TextureData; normal: TextureData } {

	const seedKey = Math.floor( Math.abs( seed ) * 1000 );
	const shapeKey = Math.floor( Math.abs( shapeSeed ) * 1000 );
	const mossAmount = mossOptions?.amount ?? 0;
	const mossColor = mossOptions?.color ?? DEFAULT_MOSS_COLOR;
	const mossMinimumNormalY = mossOptions?.minimumNormalY ?? - 0.15;
	const mossMinimumPositionY = mossOptions?.minimumPositionY ?? 0;
	if ( ! Number.isFinite( mossAmount ) || mossAmount < 0 || mossAmount > 1 ) throw new RangeError( 'Moss amount must be a finite value from 0 to 1' );
	if ( ! Number.isInteger( mossColor ) || mossColor < 0 || mossColor > 0xffffff ) throw new RangeError( 'Moss color must be a 24-bit integer' );
	if ( ! Number.isFinite( mossMinimumNormalY ) ) throw new RangeError( 'Moss surface normal threshold must be finite' );
	if ( ! Number.isFinite( mossMinimumPositionY ) ) throw new RangeError( 'Moss position threshold must be finite' );
	const meshKey = shapeVariant ?? ( shapeMesh === undefined ? 'analytic' : getMeshTextureKey( shapeMesh ) );
	let ridgeHash = 2166136261;
	for ( const segment of ridgeUvSegments ) for ( const point of segment ) for ( const value of point ) ridgeHash = Math.imul( ridgeHash ^ Math.round( value * 100000 ), 16777619 );
	const mossKey = mossAmount === 0 ? '' : `:moss:${ mossAmount.toFixed( 6 )}:${ mossColor}:${ mossMinimumNormalY.toFixed( 4 )}:${ mossMinimumPositionY.toFixed( 4 ) }`;
	const textureKey = `${ seedKey }:${ shapeKey }:${ size }:${ meshKey }:${ ridgeHash >>> 0 }${ mossKey }`;
	const cachedTextures = textureCache.get( textureKey );

	if ( cachedTextures !== undefined ) {

		textureCache.delete( textureKey );
		textureCache.set( textureKey, cachedTextures );

		return copyTexturePair( cachedTextures );

	}

	const seedOffset = seedKey + 419;
	const random = createRandom( seed );
	const facetRandom = createRandom( shapeSeed + 1439 );
	const chipRandom = createRandom( shapeSeed + 1867 );
	const directions: [ number, number ][] = [ [ 1, 0 ], [ 0, 1 ], [ 1, 1 ], [ 1, - 1 ], [ 2, 1 ], [ 2, - 1 ], [ 1, 2 ], [ 1, - 2 ] ];
	const direction = directions[ Math.floor( random() * directions.length ) ]!;
	const dominantAngle = Math.atan2( - direction[ 0 ], direction[ 1 ] );
	const bandCount = 3 + Math.floor( random() * 3 );
	const broadNoise = createPeriodicNoise( seedOffset + 13, 4, 4, size );
	const mediumNoise = createPeriodicNoise( seedOffset + 29, 9, 9, size );
	const warpNoise = createPeriodicNoise( seedOffset + 47, 3, 3, size );
	const bandNoise = createPeriodicNoise1D( seedOffset + 61, bandCount );
	const fineBandNoise = createPeriodicNoise1D( seedOffset + 73, bandCount * 5 );
	const detailMaskNoise = createPeriodicNoise( seedOffset + 113, 3, 3, size );
	const streakNoise = createPeriodicNoise( seedOffset + 127, 12, 48, size );
	const facetNormals = [ ...getTextureFacetNormals( shapeSeed, shapeMesh, scoopShape?.shape, scoopShape?.verticalOffset ), [ 0, - 1, 0 ] as Vec3 ];
	const facetNormalX: number[] = [];
	const facetNormalY: number[] = [];
	const facetNormalZ: number[] = [];
	for ( const normal of facetNormals ) {
		facetNormalX.push( normal[ 0 ] );
		facetNormalY.push( normal[ 1 ] );
		facetNormalZ.push( normal[ 2 ] );
	}
	const facetValues: Vec3[] = [];
	const facetHues: [ number, number, number ][] = [];
	const facetBrushes: [ number, number ][] = [];
	const stone: Vec3 = [ 158, 168, 181 ];

	for ( let facet = 0; facet < facetNormals.length; facet ++ ) {

		const valueOffset = 0.955 + facetRandom() * 0.09;
		facetValues.push( [ stone[ 0 ] * valueOffset, stone[ 1 ] * valueOffset, stone[ 2 ] * valueOffset ] );
		facetHues.push( [ ( facetRandom() - 0.5 ) * 4, ( facetRandom() - 0.5 ) * 4, ( facetRandom() - 0.5 ) * 5 ] );
		const brushAngle = facetRandom() * Math.PI;
		facetBrushes.push( [ Math.cos( brushAngle ), Math.sin( brushAngle ) ] );

	}

	const chips = Array.from( { length: 7 }, () => ( {
		u: chipRandom(),
		v: 0.16 + chipRandom() * 0.68,
		radiusX: 0.016 + chipRandom() * 0.007,
		radiusY: 0.011 + chipRandom() * 0.005,
		angle: chipRandom() * Math.PI,
	} ) ).map( ( chip ) => ( { ...chip, cosine: Math.cos( chip.angle ), sine: Math.sin( chip.angle ), reach: Math.max( chip.radiusX, chip.radiusY ) * 1.3 } ) );
	const chipsByRow = Array.from( { length: size }, ( _, y ) => chips.filter( ( chip ) => Math.abs( y / size - chip.v ) <= chip.reach ) );
	const detailMask = ( u: number, v: number ): number => smoothstep( - 0.25, 0.5, detailMaskNoise( u, v ) + 1 );
	const frontUv = findRockFrontUv( shapeMesh );
	const cracks = createRockCrackPaths( seed, dominantAngle, detailMask, frontUv );
	const crackDistances = createCrackDistanceMap( size, cracks );
	const longitudeCos = new Float32Array( size );
	const longitudeSin = new Float32Array( size );
	const latitudeCos = new Float32Array( size );
	const latitudeSin = new Float32Array( size );

	for ( let index = 0; index < size; index ++ ) {

		const longitude = ( index / size - 0.5 ) * Math.PI * 2;
		const latitude = ( index / size - 0.5 ) * Math.PI;
		longitudeCos[ index ] = Math.cos( longitude );
		longitudeSin[ index ] = Math.sin( longitude );
		latitudeCos[ index ] = Math.cos( latitude );
		latitudeSin[ index ] = Math.sin( latitude );

	}

	const surfaceNormals = new Float32Array( size * size * 3 );

	for ( let y = 0; y < size; y ++ ) {
		for ( let x = 0; x < size; x ++ ) {
			const offset = ( y * size + x ) * 3;
			surfaceNormals[ offset ] = latitudeCos[ y ]! * longitudeCos[ x ]!;
			surfaceNormals[ offset + 1 ] = latitudeSin[ y ]!;
			surfaceNormals[ offset + 2 ] = latitudeCos[ y ]! * longitudeSin[ x ]!;
		}
	}

	const edgeHighlightMap = createRockEdgeHighlightMap( ridgeUvSegments, size, scoopShape?.shape.size ?? 6.4 );
	let mossSurfaceSamples: RockMossSurfaceSamples | undefined;
	if ( mossAmount > 0 ) {
		mossSurfaceSamples = createRockMossSurfaceSamples( seedOffset, size, mossAmount, shapeMesh, mossMinimumPositionY, mossMinimumNormalY, scoopShape, ridgeUvSegments, edgeHighlightMap );
		surfaceNormals.set( mossSurfaceSamples.normals );
	} else if ( shapeMesh !== undefined ) {
		rasterizeRockSurfaceNormals( shapeMesh, size, surfaceNormals );
	}
	const mossCoverage = mossSurfaceSamples?.coverage;
	const mossClumps = mossSurfaceSamples?.clumps;
	const mossColorChannels = [ ( mossColor >>> 16 ) & 0xff, ( mossColor >>> 8 ) & 0xff, mossColor & 0xff ];
	const mossLuminance = mossColorChannels[ 0 ]! * 0.2126 + mossColorChannels[ 1 ]! * 0.7152 + mossColorChannels[ 2 ]! * 0.0722;
	const TONE = MOSS_TONE;
	const mossBaseChannels = mossColorChannels.map( ( channel ) => channel * TONE.base * ( 1 - TONE.baseGrey ) + mossLuminance * TONE.base * TONE.baseGrey );
	const mossClumpChannels = [ mossColorChannels[ 0 ]! * TONE.light, mossColorChannels[ 1 ]! * TONE.light, mossColorChannels[ 2 ]! * TONE.lightBlue ];

	const heightMap = new Float32Array( size * size );
	const albedoData = new Uint8Array( size * size * 4 );
	const normalData = new Uint8Array( size * size * 4 );
	const warpNoiseRow = new Float64Array( size );
	const broadNoiseRow = new Float64Array( size );
	const mediumNoiseRow = new Float64Array( size );
	const detailMaskNoiseRow = new Float64Array( size );

	for ( let y = 0; y < size; y ++ ) {

		const v = y / size;
		const poleFade = smoothstep( 0, 0.075, v ) * smoothstep( 0, 0.075, 1 - v );
		const rowOffset = y * size;
		const rowChips = chipsByRow[ y ]!;
		warpNoise.fillPixelRow( y, warpNoiseRow );
		broadNoise.fillPixelRow( y, broadNoiseRow );
		mediumNoise.fillPixelRow( y, mediumNoiseRow );
		detailMaskNoise.fillPixelRow( y, detailMaskNoiseRow );

		for ( let x = 0; x < size; x ++ ) {

			const u = x / size;
			const surfaceOffset = ( rowOffset + x ) * 3;
			const normalX = surfaceNormals[ surfaceOffset ]!;
			const normalY = surfaceNormals[ surfaceOffset + 1 ]!;
			const normalZ = surfaceNormals[ surfaceOffset + 2 ]!;
			let firstDot = - Infinity;
			let secondDot = - Infinity;
			let firstFacet = 0;
			let secondFacet = 0;

			for ( let facet = 0; facet < facetNormals.length; facet ++ ) {

				const dot = normalX * facetNormalX[ facet ]! + normalY * facetNormalY[ facet ]! + normalZ * facetNormalZ[ facet ]!;

				if ( dot > firstDot ) {

					secondDot = firstDot;
					secondFacet = firstFacet;
					firstDot = dot;
					firstFacet = facet;

				} else if ( dot > secondDot ) {

					secondDot = dot;
					secondFacet = facet;

				}

			}

			const facetGap = firstDot - secondDot;
			const facetBlend = smoothstep( 0.0005, 0.009, facetGap );
			const firstValue = facetValues[ firstFacet ]!;
			const secondValue = facetValues[ secondFacet ]!;
			const firstHue = facetHues[ firstFacet ]!;
			const secondHue = facetHues[ secondFacet ]!;
			const facetValue0 = secondValue[ 0 ] + ( firstValue[ 0 ] - secondValue[ 0 ] ) * facetBlend;
			const facetValue1 = secondValue[ 1 ] + ( firstValue[ 1 ] - secondValue[ 1 ] ) * facetBlend;
			const facetValue2 = secondValue[ 2 ] + ( firstValue[ 2 ] - secondValue[ 2 ] ) * facetBlend;
			const hue0 = secondHue[ 0 ] + ( firstHue[ 0 ] - secondHue[ 0 ] ) * facetBlend;
			const hue1 = secondHue[ 1 ] + ( firstHue[ 1 ] - secondHue[ 1 ] ) * facetBlend;
			const hue2 = secondHue[ 2 ] + ( firstHue[ 2 ] - secondHue[ 2 ] ) * facetBlend;
			const edgeHighlight = edgeHighlightMap[ rowOffset + x ]!;
			const warp = warpNoiseRow[ x ]!;
			const brushDirection = facetBrushes[ firstFacet ]!;
			const phase = fract( ( brushDirection[ 0 ] * u + brushDirection[ 1 ] * v ) * bandCount + warp * 0.09 );
			const strata = bandNoise( phase ) * 0.82 + fineBandNoise( fract( phase * 3 + warp * 0.24 ) ) * 0.18;
			const broad = broadNoiseRow[ x ]!;
			const medium = mediumNoiseRow[ x ]!;
			const detail = smoothstep( - 0.25, 0.5, detailMaskNoiseRow[ x ]! + 1 );
			const localizedStrata = strata * ( 0.25 + detail * 0.75 );
			const along = fract( brushDirection[ 0 ] * u + brushDirection[ 1 ] * v + warp * 0.015 );
			const across = fract( - brushDirection[ 1 ] * u + brushDirection[ 0 ] * v + warp * 0.02 );
			const fineStreak = ( 1 - smoothstep( 0.18, 0.75, streakNoise.sampleUnit( along, across ) + 1 ) ) * detail;
			const crackIndex = rowOffset + x;
			const crackDistance = Math.sqrt( crackDistances.distances[ crackIndex ]! );
			const crackCore = 1 - smoothstep( 0.12, 0.78, crackDistance );
			const crackEdge = smoothstep( 0.48, 0.82, crackDistance ) * ( 1 - smoothstep( 0.82, 1.55, crackDistance ) );
			const crackRim = crackDistances.sides[ crackIndex ]! > 0
				? smoothstep( 0.65, 0.92, crackDistance ) * ( 1 - smoothstep( 0.95, 1.6, crackDistance ) )
				: 0;
			const fineCrack = crackCore * poleFade;
			const fineCrackEdge = crackEdge * poleFade;
			const fineCrackRim = crackRim * poleFade;
			let chipCore = 0;
			let chipRim = 0;

			for ( const chip of rowChips ) {

				const deltaV = v - chip.v;
				const rawDeltaU = Math.abs( u - chip.u );
				const deltaU = Math.min( rawDeltaU, 1 - rawDeltaU );
				if ( deltaU > chip.reach ) continue;
				const cosine = chip.cosine;
				const sine = chip.sine;
				const chipX = ( deltaU * cosine + deltaV * sine ) / chip.radiusX;
				const chipY = ( - deltaU * sine + deltaV * cosine ) / chip.radiusY;
				const chipDistance = Math.hypot( chipX, chipY );
				const shadow = 1 - smoothstep( 0.52, 0.92, chipDistance );
				const rim = smoothstep( 0.72, 0.98, chipDistance ) * ( 1 - smoothstep( 0.98, 1.25, chipDistance ) ) * smoothstep( - 0.2, 0.5, chipX );

				chipCore = Math.max( chipCore, shadow );
				chipRim = Math.max( chipRim, rim );

			}

			const textureVariation = broad * 1.4 + medium * 0.7 + localizedStrata * 0.5 + chipRim * 2 - fineStreak * 0.9 - chipCore * 8 - fineCrack * 28 - fineCrackEdge * 3 + fineCrackRim * 10;
			const index = crackIndex;

			heightMap[ index ] = broad * 0.014 + medium * 0.008 - fineStreak * 0.0003 - chipCore * 0.004 + chipRim * 0.001 - fineCrack * 0.014 - fineCrackEdge * 0.002 + fineCrackRim * 0.006;
			albedoData[ index * 4 ] = Math.round( clamp( facetValue0 * ( 1 + edgeHighlight * 0.14 ) + textureVariation + hue0, 0, 255 ) );
			albedoData[ index * 4 + 1 ] = Math.round( clamp( facetValue1 * ( 1 + edgeHighlight * 0.14 ) + textureVariation + hue1, 0, 255 ) );
			albedoData[ index * 4 + 2 ] = Math.round( clamp( facetValue2 * ( 1 + edgeHighlight * 0.14 ) + textureVariation + hue2, 0, 255 ) );
			albedoData[ index * 4 + 3 ] = 255;

		}

	}

	matchAlbedoMean( albedoData, size * size );
	if ( mossCoverage !== undefined && mossClumps !== undefined ) {
		const activePixels = mossSurfaceSamples!.activePixels;
		for ( let active = 0; active < activePixels.length; active ++ ) {

			const pixel = activePixels[ active ]!;
			const coverage = mossCoverage[ pixel ]!;
			const clump = mossClumps[ pixel ]!;
			const offset = pixel * 4;
			for ( let channel = 0; channel < 3; channel ++ ) {
				const baseTone = albedoData[ offset + channel ]! * ( 1 - coverage ) + mossBaseChannels[ channel ]! * coverage;
				albedoData[ offset + channel ] = Math.round( baseTone * ( 1 - clump ) + mossClumpChannels[ channel ]! * clump );
			}
			heightMap[ pixel ] = heightMap[ pixel ]! + ( coverage * 0.00025 + clump * 0.0005 ) * mossSurfaceSamples!.diameter;

		}
	}

	for ( let y = 0; y < size; y ++ ) {

		const topRow = ( y === 0 ? 0 : y - 1 ) * size;
		const middleRow = y * size;
		const bottomRow = ( y + 1 === size ? size - 1 : y + 1 ) * size;

		for ( let x = 0; x < size; x ++ ) {

			const index = y * size + x;
			const left = x === 0 ? size - 1 : x - 1;
			const right = x + 1 === size ? 0 : x + 1;
			const topLeft = heightMap[ topRow + left ]!;
			const topCenter = heightMap[ topRow + x ]!;
			const topRight = heightMap[ topRow + right ]!;
			const middleLeft = heightMap[ middleRow + left ]!;
			const middleRight = heightMap[ middleRow + right ]!;
			const bottomLeft = heightMap[ bottomRow + left ]!;
			const bottomCenter = heightMap[ bottomRow + x ]!;
			const bottomRight = heightMap[ bottomRow + right ]!;
			const gradientX = ( topRight + 2 * middleRight + bottomRight - topLeft - 2 * middleLeft - bottomLeft ) / 8;
			const gradientY = ( bottomLeft + 2 * bottomCenter + bottomRight - topLeft - 2 * topCenter - topRight ) / 8;
			const normalX = - gradientX * size * 0.3;
			const normalY = - gradientY * size * 0.3;
			const inverseLength = 1 / Math.hypot( normalX, normalY, 1 );

			normalData[ index * 4 ] = Math.round( ( normalX * inverseLength * 0.5 + 0.5 ) * 255 );
			normalData[ index * 4 + 1 ] = Math.round( ( normalY * inverseLength * 0.5 + 0.5 ) * 255 );
			normalData[ index * 4 + 2 ] = Math.round( ( inverseLength * 0.5 + 0.5 ) * 255 );
			normalData[ index * 4 + 3 ] = 255;
			if ( mossCoverage !== undefined && mossCoverage[ index ]! > 0 ) {
				const flattening = mossCoverage[ index ]! * 0.16;
				const flattenedX = normalX * inverseLength * ( 1 - flattening );
				const flattenedY = normalY * inverseLength * ( 1 - flattening );
				const flattenedZ = inverseLength + ( 1 - inverseLength ) * ( 1 - flattening );
				const flattenedLength = Math.hypot( flattenedX, flattenedY, flattenedZ ) || 1;
				normalData[ index * 4 ] = Math.round( ( flattenedX / flattenedLength * 0.5 + 0.5 ) * 255 );
				normalData[ index * 4 + 1 ] = Math.round( ( flattenedY / flattenedLength * 0.5 + 0.5 ) * 255 );
				normalData[ index * 4 + 2 ] = Math.round( ( flattenedZ / flattenedLength * 0.5 + 0.5 ) * 255 );
			}

		}

	}

	const textures: RockTexturePair = {
		albedo: { width: size, height: size, data: albedoData, wrap: 'repeat', wrapS: 'repeat', wrapT: 'clamp' },
		normal: { width: size, height: size, data: normalData, wrap: 'repeat', wrapS: 'repeat', wrapT: 'clamp' },
	};
	textureCache.set( textureKey, copyTexturePair( textures ) );
	if ( textureCache.size > 4 ) textureCache.delete( textureCache.keys().next().value! );

	return textures;

}
