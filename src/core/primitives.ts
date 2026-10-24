import type { Color3, Vec3 } from './types';
import { MeshBuilder } from './meshBuilder';

function add( a: Vec3, b: Vec3 ): Vec3 {

	return [ a[ 0 ] + b[ 0 ], a[ 1 ] + b[ 1 ], a[ 2 ] + b[ 2 ] ];

}

function subtract( a: Vec3, b: Vec3 ): Vec3 {

	return [ a[ 0 ] - b[ 0 ], a[ 1 ] - b[ 1 ], a[ 2 ] - b[ 2 ] ];

}

function multiply( vector: Vec3, scalar: number ): Vec3 {

	return [ vector[ 0 ] * scalar, vector[ 1 ] * scalar, vector[ 2 ] * scalar ];

}

function cross( a: Vec3, b: Vec3 ): Vec3 {

	return [
		a[ 1 ] * b[ 2 ] - a[ 2 ] * b[ 1 ],
		a[ 2 ] * b[ 0 ] - a[ 0 ] * b[ 2 ],
		a[ 0 ] * b[ 1 ] - a[ 1 ] * b[ 0 ]
	];

}

function dot( a: Vec3, b: Vec3 ): number {

	return a[ 0 ] * b[ 0 ] + a[ 1 ] * b[ 1 ] + a[ 2 ] * b[ 2 ];

}

function getReferenceAxis( tangent: Vec3 ): Vec3 {

	const absolute = [ Math.abs( tangent[ 0 ] ), Math.abs( tangent[ 1 ] ), Math.abs( tangent[ 2 ] ) ];

	if ( absolute[ 0 ]! <= absolute[ 1 ]! && absolute[ 0 ]! <= absolute[ 2 ]! ) {

		return [ 1, 0, 0 ];

	} else if ( absolute[ 1 ]! <= absolute[ 2 ]! ) {

		return [ 0, 1, 0 ];

	}

	return [ 0, 0, 1 ];

}

function normalize( vector: Vec3 ): Vec3 {

	const length = Math.hypot( vector[ 0 ], vector[ 1 ], vector[ 2 ] );

	if ( length === 0 || ! Number.isFinite( length ) ) {

		throw new RangeError( 'Expected a finite, non-zero vector' );

	}

	return [ vector[ 0 ] / length, vector[ 1 ] / length, vector[ 2 ] / length ];

}

function getTubeFrames( spine: Vec3[] ): { tangent: Vec3; u: Vec3; v: Vec3 }[] {

	const frames: { tangent: Vec3; u: Vec3; v: Vec3 }[] = [];

	for ( let i = 0; i < spine.length; i ++ ) {

		let tangent: Vec3;

		if ( i === 0 ) {

			tangent = subtract( spine[ 1 ]!, spine[ 0 ]! );

		} else if ( i === spine.length - 1 ) {

			tangent = subtract( spine[ i ]!, spine[ i - 1 ]! );

		} else {

			tangent = subtract( spine[ i + 1 ]!, spine[ i - 1 ]! );

			if ( Math.hypot( tangent[ 0 ], tangent[ 1 ], tangent[ 2 ] ) === 0 ) {

				tangent = subtract( spine[ i + 1 ]!, spine[ i ]! );

			}

		}

		tangent = normalize( tangent );

		let u: Vec3;

		if ( i === 0 ) {

			u = normalize( cross( tangent, getReferenceAxis( tangent ) ) );

		} else {

			// 前フレームの法線を接線面へ射影し、リング間の捩れを抑える。
			const previousU = frames[ i - 1 ]!.u;
			const projected = subtract( previousU, multiply( tangent, dot( previousU, tangent ) ) );

			if ( Math.hypot( projected[ 0 ], projected[ 1 ], projected[ 2 ] ) <= 1e-8 ) {

				u = normalize( cross( tangent, getReferenceAxis( tangent ) ) );

			} else {

				u = normalize( projected );

			}

		}

		const v = normalize( cross( tangent, u ) );

		frames.push( { tangent, u, v } );

	}

	return frames;

}

export function addTube(
	b: MeshBuilder,
	spine: Vec3[],
	radii: number[],
	sides: number,
	opts: { color: Color3; wind: ( t: number ) => number; capEnd: boolean },
): void {

	if ( spine.length < 2 ) {

		throw new RangeError( 'A tube needs at least two spine points' );

	}

	if ( radii.length !== spine.length ) {

		throw new RangeError( 'A tube needs one radius per spine point' );

	}

	if ( ! Number.isInteger( sides ) || sides < 3 ) {

		throw new RangeError( 'A tube needs at least three sides' );

	}

	for ( const radius of radii ) {

		if ( ! Number.isFinite( radius ) || radius < 0 ) {

			throw new RangeError( 'Tube radii must be finite and non-negative' );

		}

	}

	const frames = getTubeFrames( spine );
	const rings: Vec3[][] = [];
	const ringIndices: number[][] = [];
	const winds: number[] = [];
	const distances: number[] = [ 0 ];

	for ( let i = 1; i < spine.length; i ++ ) {

		const segment = subtract( spine[ i ]!, spine[ i - 1 ]! );
		distances.push( distances[ i - 1 ]! + Math.hypot( segment[ 0 ], segment[ 1 ], segment[ 2 ] ) );

	}

	const radiusSlopes = radii.map( ( radius, i ) => {

		const first = i === 0 ? 0 : i - 1;
		const last = i === radii.length - 1 ? i : i + 1;

		return ( radii[ last ]! - radii[ first ]! ) / ( distances[ last ]! - distances[ first ]! );

	} );

	for ( let i = 0; i < spine.length; i ++ ) {

		const t = i / ( spine.length - 1 );
		const radius = radii[ i ]!;
		const frame = frames[ i ]!;
		const ring: Vec3[] = [];
		const indices: number[] = [];

		winds.push( opts.wind( t ) );

		for ( let side = 0; side < sides; side ++ ) {

			const angle = side / sides * Math.PI * 2;
			const radial = add( multiply( frame.u, Math.cos( angle ) ), multiply( frame.v, Math.sin( angle ) ) );
			const normal = normalize( subtract( radial, multiply( frame.tangent, radiusSlopes[ i ]! ) ) );
			const position = add( spine[ i ]!, multiply( radial, radius ) );

			ring.push( position );
			indices.push( b.addVertex( position, normal, [ side / sides, t ], opts.color, winds[ i ]! ) );

		}

		rings.push( ring );
		ringIndices.push( indices );

	}

	for ( let segment = 0; segment < spine.length - 1; segment ++ ) {

		for ( let side = 0; side < sides; side ++ ) {

			const nextSide = ( side + 1 ) % sides;
			const a = ringIndices[ segment ]![ side ]!;
			const bIndex = ringIndices[ segment ]![ nextSide ]!;
			const c = ringIndices[ segment + 1 ]![ side ]!;
			const d = ringIndices[ segment + 1 ]![ nextSide ]!;

			b.addTriangle( a, bIndex, c );
			b.addTriangle( bIndex, d, c );

		}

	}

	if ( opts.capEnd ) {

		const endIndex = spine.length - 1;
		const frame = frames[ endIndex ]!;
		const capCenter = b.addVertex( spine[ endIndex ]!, frame.tangent, [ 0.5, 0.5 ], opts.color, winds[ endIndex ]! );
		const capRing: number[] = [];

		for ( let side = 0; side < sides; side ++ ) {

			const angle = side / sides * Math.PI * 2;
			const uv: [ number, number ] = [ 0.5 + Math.cos( angle ) * 0.5, 0.5 + Math.sin( angle ) * 0.5 ];

			capRing.push( b.addVertex( rings[ endIndex ]![ side ]!, frame.tangent, uv, opts.color, winds[ endIndex ]! ) );

		}

		for ( let side = 0; side < sides; side ++ ) {

			b.addTriangle( capCenter, capRing[ side ]!, capRing[ ( side + 1 ) % sides ]! );

		}

	}

}

export function addCard(
	b: MeshBuilder,
	center: Vec3,
	right: Vec3,
	up: Vec3,
	uvRect: [ number, number, number, number ],
	normal: Vec3 | null,
	color: Color3,
	wind: number,
): void {

	const faceNormal = normal === null ? normalize( cross( right, up ) ) : normalize( normal );
	const negativeRight = multiply( right, -1 );
	const negativeUp = multiply( up, -1 );
	const corners = [
		add( add( center, negativeRight ), negativeUp ),
		add( add( center, right ), negativeUp ),
		add( add( center, right ), up ),
		add( add( center, negativeRight ), up )
	];
	const u0 = uvRect[ 0 ];
	const v0 = uvRect[ 1 ];
	const u1 = uvRect[ 2 ];
	const v1 = uvRect[ 3 ];
	const uvs: [ number, number ][] = [ [ u0, v0 ], [ u1, v0 ], [ u1, v1 ], [ u0, v1 ] ];
	const indices = corners.map( ( corner, i ) => b.addVertex( corner, faceNormal, uvs[ i ]!, color, wind ) );

	b.addTriangle( indices[ 0 ]!, indices[ 1 ]!, indices[ 2 ]! );
	b.addTriangle( indices[ 0 ]!, indices[ 2 ]!, indices[ 3 ]! );

}

const goldenRatio = ( 1 + Math.sqrt( 5 ) ) / 2;
const icosahedronVertices = ( [
	[ -1, goldenRatio, 0 ], [ 1, goldenRatio, 0 ], [ -1, -goldenRatio, 0 ], [ 1, -goldenRatio, 0 ],
	[ 0, -1, goldenRatio ], [ 0, 1, goldenRatio ], [ 0, -1, -goldenRatio ], [ 0, 1, -goldenRatio ],
	[ goldenRatio, 0, -1 ], [ goldenRatio, 0, 1 ], [ -goldenRatio, 0, -1 ], [ -goldenRatio, 0, 1 ]
] as Vec3[] ).map( ( vertex ) => normalize( vertex ) );

const icosahedronFaces: [ number, number, number ][] = [
	[ 0, 11, 5 ], [ 0, 5, 1 ], [ 0, 1, 7 ], [ 0, 7, 10 ], [ 0, 10, 11 ],
	[ 1, 5, 9 ], [ 5, 11, 4 ], [ 11, 10, 2 ], [ 10, 7, 6 ], [ 7, 1, 8 ],
	[ 3, 9, 4 ], [ 3, 4, 2 ], [ 3, 2, 6 ], [ 3, 6, 8 ], [ 3, 8, 9 ],
	[ 4, 9, 5 ], [ 2, 4, 11 ], [ 6, 2, 10 ], [ 8, 6, 7 ], [ 9, 8, 1 ]
];

interface RockPoint {
	direction: Vec3;
	position: Vec3;
	color: Color3;
	uv: [ number, number ];
	geometryKey: string;
	index?: number;
}

function getRockUv( direction: Vec3 ): [ number, number ] {

	return [
		Math.atan2( direction[ 2 ], direction[ 0 ] ) / ( Math.PI * 2 ) + 0.5,
		Math.asin( Math.max( -1, Math.min( 1, direction[ 1 ] ) ) ) / Math.PI + 0.5
	];

}

export function addRockShell(
	b: MeshBuilder,
	frequency: number,
	radiusAt: ( dir: Vec3 ) => number,
	opts: { color: ( dir: Vec3 ) => Color3; center: Vec3; scale: Vec3; flat: boolean },
): void {

	if ( ! Number.isInteger( frequency ) || frequency < 1 ) {

		throw new RangeError( 'Rock frequency must be a positive integer' );

	}

	if ( opts.scale.some( ( component ) => ! Number.isFinite( component ) || component === 0 ) ) {

		throw new RangeError( 'Rock scale components must be finite and non-zero' );

	}

	const smoothPoints = new Map<string, RockPoint>();
	const smoothNormals = new Map<string, Vec3>();
	const smoothTriangles: [ RockPoint, RockPoint, RockPoint ][] = [];

	// 各面を重心座標で分割し、変位後の面積法線を共有点へ加算する。

	for ( const [ firstIndex, secondIndex, thirdIndex ] of icosahedronFaces ) {

		let a = icosahedronVertices[ firstIndex ]!;
		let c = icosahedronVertices[ secondIndex ]!;
		let d = icosahedronVertices[ thirdIndex ]!;

		if ( dot( cross( subtract( c, a ), subtract( d, a ) ), add( add( a, c ), d ) ) < 0 ) {

			[ c, d ] = [ d, c ];

		}

		const rows: RockPoint[][] = [];

		for ( let i = 0; i <= frequency; i ++ ) {

			const row: RockPoint[] = [];

			for ( let j = 0; j <= frequency - i; j ++ ) {

				const direction = normalize( [
					a[ 0 ] * ( frequency - i - j ) + c[ 0 ] * i + d[ 0 ] * j,
					a[ 1 ] * ( frequency - i - j ) + c[ 1 ] * i + d[ 1 ] * j,
					a[ 2 ] * ( frequency - i - j ) + c[ 2 ] * i + d[ 2 ] * j
				] );
				const geometryKey = direction.map( ( component ) => component.toFixed( 10 ) ).join( ',' );
				const uv = getRockUv( direction );
				const pointKey = `${ geometryKey }:${ uv[ 0 ].toFixed( 10 ) }:${ uv[ 1 ].toFixed( 10 ) }`;
				let point = opts.flat ? undefined : smoothPoints.get( pointKey );

				if ( point === undefined ) {

					const radius = radiusAt( direction );
					const position: Vec3 = [
						opts.center[ 0 ] + direction[ 0 ] * radius * opts.scale[ 0 ],
						opts.center[ 1 ] + direction[ 1 ] * radius * opts.scale[ 1 ],
						opts.center[ 2 ] + direction[ 2 ] * radius * opts.scale[ 2 ]
					];
					point = {
						direction,
						position,
						color: opts.color( direction ),
						uv,
						geometryKey,
					};

					if ( ! opts.flat ) {

						smoothPoints.set( pointKey, point );

						if ( ! smoothNormals.has( geometryKey ) ) {

							smoothNormals.set( geometryKey, [ 0, 0, 0 ] );

						}

					}

				}

				row.push( point );

			}

			rows.push( row );

		}

		const emitTriangle = ( first: RockPoint, second: RockPoint, third: RockPoint ): void => {

			if ( opts.flat ) {

				const faceNormal = normalize( cross( subtract( second.position, first.position ), subtract( third.position, first.position ) ) );
				const firstVertex = b.addVertex( first.position, faceNormal, first.uv, first.color, 0 );
				const secondVertex = b.addVertex( second.position, faceNormal, second.uv, second.color, 0 );
				const thirdVertex = b.addVertex( third.position, faceNormal, third.uv, third.color, 0 );

				b.addTriangle( firstVertex, secondVertex, thirdVertex );

			} else {

				const areaNormal = cross( subtract( second.position, first.position ), subtract( third.position, first.position ) );

				for ( const point of [ first, second, third ] ) {

					const sum = smoothNormals.get( point.geometryKey )!;

					sum[ 0 ] += areaNormal[ 0 ];
					sum[ 1 ] += areaNormal[ 1 ];
					sum[ 2 ] += areaNormal[ 2 ];

				}

				smoothTriangles.push( [ first, second, third ] );

			}

		};

		for ( let i = 0; i < frequency; i ++ ) {

			for ( let j = 0; j < frequency - i; j ++ ) {

				emitTriangle( rows[ i ]![ j ]!, rows[ i + 1 ]![ j ]!, rows[ i ]![ j + 1 ]! );

				if ( i + j < frequency - 1 ) {

					emitTriangle( rows[ i + 1 ]![ j ]!, rows[ i + 1 ]![ j + 1 ]!, rows[ i ]![ j + 1 ]! );

				}

			}

		}

	}

	if ( ! opts.flat ) {

		for ( const point of smoothPoints.values() ) {

			point.index = b.addVertex( point.position, normalize( smoothNormals.get( point.geometryKey )! ), point.uv, point.color, 0 );

		}

		for ( const [ first, second, third ] of smoothTriangles ) {

			b.addTriangle( first.index!, second.index!, third.index! );

		}

	}

}
