import type { TextureData } from './types';

interface RockCell {
	u: number;
	v: number;
	tone: number;
	angle: number;
}

type NoiseField = ( u: number, v: number ) => number;

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

function createPeriodicNoise( seed: number, columns: number, rows: number ): NoiseField {

	const values = new Float32Array( columns * rows );

	for ( let y = 0; y < rows; y ++ ) {

		for ( let x = 0; x < columns; x ++ ) {

			values[ y * columns + x ] = hashGrid( seed, x, y );

		}

	}

	return ( u: number, v: number ): number => {

		const gridX = u * columns;
		const gridY = v * rows;
		const x = Math.floor( gridX );
		const y = Math.floor( gridY );
		const nextX = ( x + 1 ) % columns;
		const nextY = ( y + 1 ) % rows;
		const amountX = smoothstep( 0, 1, gridX - x );
		const amountY = smoothstep( 0, 1, gridY - y );
		const top = values[ ( y % rows ) * columns + x % columns ]! * ( 1 - amountX ) + values[ ( y % rows ) * columns + nextX ]! * amountX;
		const bottom = values[ nextY * columns + x % columns ]! * ( 1 - amountX ) + values[ nextY * columns + nextX ]! * amountX;

		return top * ( 1 - amountY ) + bottom * amountY;

	};

}

function createRockCells( seed: number ): RockCell[] {

	const random = createRandom( seed );
	const cells: RockCell[] = [];

	for ( let y = 0; y < 3; y ++ ) {

		for ( let x = 0; x < 3; x ++ ) {

			cells.push( {
				u: ( x + 0.5 + ( random() - 0.5 ) * 0.64 ) / 3,
				v: ( y + 0.5 + ( random() - 0.5 ) * 0.64 ) / 3,
				tone: ( random() - 0.5 ) * 13,
				angle: random() * Math.PI * 2,
			} );

		}

	}

	return cells;

}

function getCellDistances( u: number, v: number, cells: RockCell[] ): { cell: RockCell; first: number; second: number; dx: number; dy: number } {

	let firstSquared = Infinity;
	let secondSquared = Infinity;
	let nearestCell = cells[ 0 ]!;
	let nearestX = 0;
	let nearestY = 0;

	for ( const cell of cells ) {

		let dx = u - cell.u;
		let dy = v - cell.v;
		dx -= Math.round( dx );
		dy -= Math.round( dy );
		const distanceSquared = dx * dx + dy * dy;

		if ( distanceSquared < firstSquared ) {

			secondSquared = firstSquared;
			firstSquared = distanceSquared;
			nearestCell = cell;
			nearestX = dx * 3;
			nearestY = dy * 3;

		} else if ( distanceSquared < secondSquared ) {

			secondSquared = distanceSquared;

		}

	}

	return {
		cell: nearestCell,
		first: Math.sqrt( firstSquared ) * 3,
		second: Math.sqrt( secondSquared ) * 3,
		dx: nearestX,
		dy: nearestY,
	};

}

function sampleHeight( heightMap: Float32Array, size: number, x: number, y: number ): number {

	const wrappedX = ( x + size ) % size;
	const wrappedY = ( y + size ) % size;

	return heightMap[ wrappedY * size + wrappedX ]!;

}

function matchAlbedoMean( data: Uint8Array, pixelCount: number ): void {

	const target = [ 80.31, 95.08, 102.47 ];
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

export function createRockTextures( seed: number, size = 256 ): { albedo: TextureData; normal: TextureData } {

	const seedOffset = Math.floor( Math.abs( seed ) * 1000 ) + 419;
	const cells = createRockCells( seed );
	const warpU = createPeriodicNoise( seedOffset + 13, 3, 3 );
	const warpV = createPeriodicNoise( seedOffset + 29, 3, 3 );
	const horizontalStreaks = createPeriodicNoise( seedOffset + 47, 54, 9 );
	const verticalStreaks = createPeriodicNoise( seedOffset + 61, 9, 54 );
	const horizontalChisel = createPeriodicNoise( seedOffset + 73, 72, 36 );
	const verticalChisel = createPeriodicNoise( seedOffset + 89, 36, 72 );
	const heightMap = new Float32Array( size * size );
	const albedoData = new Uint8Array( size * size * 4 );
	const normalData = new Uint8Array( size * size * 4 );

	for ( let y = 0; y < size; y ++ ) {

		for ( let x = 0; x < size; x ++ ) {

			const u = x / size;
			const v = y / size;
			const warpedU = fract( u + warpU( u, v ) * 0.05 );
			const warpedV = fract( v + warpV( u, v ) * 0.05 );
			const nearest = getCellDistances( warpedU, warpedV, cells );
			const gap = nearest.second - nearest.first;
			const plate = smoothstep( 0.012, 0.16, gap );
			const crack = 1 - smoothstep( 0.014, 0.11, gap );
			const interior = smoothstep( 0.045, 0.18, gap );
			const horizontal = horizontalStreaks( warpedU, warpedV );
			const vertical = verticalStreaks( warpedU, warpedV );
			const cosine = Math.cos( nearest.cell.angle );
			const sine = Math.sin( nearest.cell.angle );
			const orientation = cosine * cosine;
			const streak = ( horizontal * orientation + vertical * ( 1 - orientation ) ) * interior;
			const chisel = ( horizontalChisel( warpedU, warpedV ) * orientation + verticalChisel( warpedU, warpedV ) * ( 1 - orientation ) ) * interior;
			const bevel = ( nearest.dx * cosine + nearest.dy * sine ) * 16;
			const brightness = nearest.cell.tone + bevel + streak * 5.5 - crack * 28;
			const index = y * size + x;

			heightMap[ index ] = 0.25 + plate * 0.55 + chisel * 0.2;
			albedoData[ index * 4 ] = Math.round( clamp( 84 + brightness * 0.93, 0, 255 ) );
			albedoData[ index * 4 + 1 ] = Math.round( clamp( 99.3 + brightness, 0, 255 ) );
			albedoData[ index * 4 + 2 ] = Math.round( clamp( 106.3 + brightness * 1.05, 0, 255 ) );
			albedoData[ index * 4 + 3 ] = 255;

		}

	}

	matchAlbedoMean( albedoData, size * size );

	for ( let y = 0; y < size; y ++ ) {

		for ( let x = 0; x < size; x ++ ) {

			const index = y * size + x;
			const gradientX = (
				sampleHeight( heightMap, size, x + 1, y - 1 ) +
				2 * sampleHeight( heightMap, size, x + 1, y ) +
				sampleHeight( heightMap, size, x + 1, y + 1 ) -
				sampleHeight( heightMap, size, x - 1, y - 1 ) -
				2 * sampleHeight( heightMap, size, x - 1, y ) -
				sampleHeight( heightMap, size, x - 1, y + 1 )
			) / 8;
			const gradientY = (
				sampleHeight( heightMap, size, x - 1, y + 1 ) +
				2 * sampleHeight( heightMap, size, x, y + 1 ) +
				sampleHeight( heightMap, size, x + 1, y + 1 ) -
				sampleHeight( heightMap, size, x - 1, y - 1 ) -
				2 * sampleHeight( heightMap, size, x, y - 1 ) -
				sampleHeight( heightMap, size, x + 1, y - 1 )
			) / 8;
			const normalX = - gradientX * size * 0.05;
			const normalY = - gradientY * size * 0.05;
			const inverseLength = 1 / Math.hypot( normalX, normalY, 1 );

			normalData[ index * 4 ] = Math.round( ( normalX * inverseLength * 0.5 + 0.5 ) * 255 );
			normalData[ index * 4 + 1 ] = Math.round( ( normalY * inverseLength * 0.5 + 0.5 ) * 255 );
			normalData[ index * 4 + 2 ] = Math.round( ( inverseLength * 0.5 + 0.5 ) * 255 );
			normalData[ index * 4 + 3 ] = 255;

		}

	}

	return {
		albedo: { width: size, height: size, data: albedoData, wrap: 'repeat' },
		normal: { width: size, height: size, data: normalData, wrap: 'repeat' },
	};

}
