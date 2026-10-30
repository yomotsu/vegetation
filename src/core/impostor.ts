import { linearToSrgbByte } from './color';
import { MeshBuilder } from './meshBuilder';
import type { Color3, ImpostorView, MeshData, PartDef, TextureData, VegetationData } from './types';

export const LOD3_IMPOSTOR_YAW_ANGLES = [ 0, Math.PI / 6, Math.PI / 3, Math.PI / 2, Math.PI * 2 / 3, Math.PI * 5 / 6 ] as const;

export function yawImpostorView( yaw: number ): ImpostorView {

	return { direction: [ Math.sin( yaw ), 0, Math.cos( yaw ) ], up: [ 0, 1, 0 ] };

}

export const LOD4_IMPOSTOR_VIEWS = [
	yawImpostorView( 0 ),
	{ direction: [ 0, 1, 0 ], up: [ 0, 0, - 1 ] },
] as const satisfies readonly ImpostorView[];

export const LOD3_IMPOSTOR_VIEWS = [
	...LOD3_IMPOSTOR_YAW_ANGLES.map( yawImpostorView ),
	LOD4_IMPOSTOR_VIEWS[ 1 ],
] as const satisfies readonly ImpostorView[];

export interface ImpostorFootprint {
	minX: number;
	maxX: number;
	minZ: number;
	maxZ: number;
}

function nextPowerOfTwo( value: number ): number {

	return 2 ** Math.ceil( Math.log2( Math.max( 1, value ) ) );

}

function getTileGrid( tileCount: number ): { columns: number; rows: number } {

	const capacity = nextPowerOfTwo( tileCount );
	const columns = nextPowerOfTwo( Math.ceil( Math.sqrt( capacity ) ) );
	return { columns, rows: capacity / columns };

}

const linearSrgb = new Float32Array( 256 );

for ( let i = 0; i < 256; i ++ ) {

	const value = i / 255;
	linearSrgb[ i ] = value <= 0.04045 ? value / 12.92 : ( ( value + 0.055 ) / 1.055 ) ** 2.4;

}

export function impostorPart( views: readonly ImpostorView[] = LOD4_IMPOSTOR_VIEWS, impostorFade?: boolean ): PartDef {

	return {
		name: 'impostor',
		defaultColor: 0xffffff,
		texture: 'impostor',
		impostorViews: views,
		...( impostorFade === undefined ? {} : { impostorFade } ),
		alphaTest: 0.5,
		doubleSided: true,
		flatShading: false,
	};

}

export function impostorLod3Part( views: readonly ImpostorView[] = LOD3_IMPOSTOR_VIEWS, impostorFade?: boolean ): PartDef {

	return {
		name: 'impostor-lod3',
		defaultColor: 0xffffff,
		texture: 'impostor-lod3',
		impostorViews: views,
		...( impostorFade === undefined ? {} : { impostorFade } ),
		alphaTest: 0.5,
		doubleSided: true,
		flatShading: false,
	};

}

export function impostorViewsForPart( part: PartDef ): readonly ImpostorView[] | undefined {

	if ( part.impostorViews !== undefined ) {

		return part.impostorViews;

	}

	return part.impostorYawAngles?.map( yawImpostorView );

}

function getFootprint( mesh: MeshData | undefined, fallbackRadius: number, minimumHeight: number ): { minX: number; maxX: number; minZ: number; maxZ: number } {

	if ( mesh === undefined || mesh.positions.length === 0 ) {

		return { minX: - fallbackRadius, maxX: fallbackRadius, minZ: - fallbackRadius, maxZ: fallbackRadius };

	}

	let minX = Infinity;
	let maxX = - Infinity;
	let minZ = Infinity;
	let maxZ = - Infinity;

	const includePoint = ( x: number, z: number ): void => {

		minX = Math.min( minX, x );
		maxX = Math.max( maxX, x );
		minZ = Math.min( minZ, z );
		maxZ = Math.max( maxZ, z );

	};

	for ( let index = 0; index < mesh.indices.length; index += 3 ) {

		for ( let edge = 0; edge < 3; edge ++ ) {

			const firstOffset = mesh.indices[ index + edge ]! * 3;
			const secondOffset = mesh.indices[ index + ( edge + 1 ) % 3 ]! * 3;
			const firstY = mesh.positions[ firstOffset + 1 ]!;
			const secondY = mesh.positions[ secondOffset + 1 ]!;

			if ( firstY >= minimumHeight ) includePoint( mesh.positions[ firstOffset ]!, mesh.positions[ firstOffset + 2 ]! );

			if ( ( firstY < minimumHeight && secondY > minimumHeight ) || ( firstY > minimumHeight && secondY < minimumHeight ) ) {

				const amount = ( minimumHeight - firstY ) / ( secondY - firstY );
				includePoint(
					mesh.positions[ firstOffset ]! + ( mesh.positions[ secondOffset ]! - mesh.positions[ firstOffset ]! ) * amount,
					mesh.positions[ firstOffset + 2 ]! + ( mesh.positions[ secondOffset + 2 ]! - mesh.positions[ firstOffset + 2 ]! ) * amount,
				);

			}

		}

	}

	if ( ! Number.isFinite( minX ) ) {

		for ( let index = 0; index < mesh.positions.length; index += 3 ) includePoint( mesh.positions[ index ]!, mesh.positions[ index + 2 ]! );

	}

	if ( ! Number.isFinite( minX ) ) return { minX: - fallbackRadius, maxX: fallbackRadius, minZ: - fallbackRadius, maxZ: fallbackRadius };

	return { minX, maxX, minZ, maxZ };

}

export function buildBillboard( bounds: { radius: number; height: number }, impostorPartIndex: number, lod0?: MeshData, topHeight = bounds.height * 0.75, includeTopCard = true, topFootprint?: ImpostorFootprint ): MeshData {

	const builder = new MeshBuilder();
	const radius = bounds.radius;
	const height = bounds.height;
	const normalWeight = Math.SQRT1_2;
	const color: Color3 = [ 1, 1, 1 ];
	const footprint = includeTopCard ? topFootprint ?? getFootprint( lod0, radius, topHeight ) : null;
	const tileGrid = getTileGrid( includeTopCard ? 2 : 1 );
	const tileRight = 1 / tileGrid.columns;
	const tileTop = 1 / tileGrid.rows;

	builder.beginGroup( impostorPartIndex );

	const a0 = builder.addVertex( [ - radius, 0, 0 ], [ 0, normalWeight, normalWeight ], [ 0, 0 ], color, 0, 0 );
	const a1 = builder.addVertex( [ radius, 0, 0 ], [ 0, normalWeight, normalWeight ], [ tileRight, 0 ], color, 0, 0 );
	const a2 = builder.addVertex( [ radius, height, 0 ], [ 0, normalWeight, normalWeight ], [ tileRight, tileTop ], color, 1, 0 );
	const a3 = builder.addVertex( [ - radius, height, 0 ], [ 0, normalWeight, normalWeight ], [ 0, tileTop ], color, 1, 0 );

	builder.addTriangle( a0, a1, a2 );
	builder.addTriangle( a0, a2, a3 );

	if ( footprint !== null ) {

		const top0 = builder.addVertex( [ footprint.minX, topHeight, footprint.maxZ ], [ 0, 1, 0 ], [ tileRight, 0 ], color, 0, 1 );
		const top1 = builder.addVertex( [ footprint.maxX, topHeight, footprint.maxZ ], [ 0, 1, 0 ], [ 2 * tileRight, 0 ], color, 0, 1 );
		const top2 = builder.addVertex( [ footprint.maxX, topHeight, footprint.minZ ], [ 0, 1, 0 ], [ 2 * tileRight, tileTop ], color, 0, 1 );
		const top3 = builder.addVertex( [ footprint.minX, topHeight, footprint.minZ ], [ 0, 1, 0 ], [ tileRight, tileTop ], color, 0, 1 );

		builder.addTriangle( top0, top1, top2 );
		builder.addTriangle( top0, top2, top3 );

	}

	return builder.build();

}

export function buildSixPlaneImpostor(
	height: number,
	radius: number,
	partIndex: number,
	lod0?: MeshData,
	topHeight = height * 0.25,
	options: { yawAngles?: readonly number[]; includeTopCard?: boolean; topFootprint?: ImpostorFootprint } = {},
): MeshData {

	const builder = new MeshBuilder();
	const normalWeight = Math.SQRT1_2;
	const color: Color3 = [ 1, 1, 1 ];
	const planeRadius = radius * 0.995;
	const yawAngles = options.yawAngles ?? LOD3_IMPOSTOR_YAW_ANGLES;
	const includeTopCard = options.includeTopCard ?? true;
	const tileCount = yawAngles.length + ( includeTopCard ? 1 : 0 );
	const tileGrid = getTileGrid( tileCount );
	const footprint = includeTopCard ? options.topFootprint ?? getFootprint( lod0, radius, topHeight ) : null;
	builder.beginGroup( partIndex );

	for ( let view = 0; view < yawAngles.length; view ++ ) {

		const yaw = yawAngles[ view ]!;
		const rightX = Math.cos( yaw );
		const rightZ = - Math.sin( yaw );
		const normal: [ number, number, number ] = [ Math.sin( yaw ) * normalWeight, normalWeight, Math.cos( yaw ) * normalWeight ];
		const tileX = view % tileGrid.columns;
		const tileY = Math.floor( view / tileGrid.columns );
		const tileStartU = tileX / tileGrid.columns;
		const tileEndU = ( tileX + 1 ) / tileGrid.columns;
		const tileStartV = tileY / tileGrid.rows;
		const tileEndV = ( tileY + 1 ) / tileGrid.rows;
		const a0 = builder.addVertex( [ - rightX * planeRadius, 0, - rightZ * planeRadius ], normal, [ tileStartU, tileStartV ], color, 0, 0 );
		const a1 = builder.addVertex( [ rightX * planeRadius, 0, rightZ * planeRadius ], normal, [ tileEndU, tileStartV ], color, 0, 0 );
		const a2 = builder.addVertex( [ rightX * planeRadius, height, rightZ * planeRadius ], normal, [ tileEndU, tileEndV ], color, 1, 0 );
		const a3 = builder.addVertex( [ - rightX * planeRadius, height, - rightZ * planeRadius ], normal, [ tileStartU, tileEndV ], color, 1, 0 );

		builder.addTriangle( a0, a1, a2 );
		builder.addTriangle( a0, a2, a3 );

	}

	if ( footprint !== null ) {

		const topTileX = yawAngles.length % tileGrid.columns;
		const topTileY = Math.floor( yawAngles.length / tileGrid.columns );
		const topTileStartU = topTileX / tileGrid.columns;
		const topTileEndU = ( topTileX + 1 ) / tileGrid.columns;
		const topTileStartV = topTileY / tileGrid.rows;
		const topTileEndV = ( topTileY + 1 ) / tileGrid.rows;
		const top0 = builder.addVertex( [ footprint.minX, topHeight, footprint.maxZ ], [ 0, 1, 0 ], [ topTileStartU, topTileStartV ], color, 0, 1 );
		const top1 = builder.addVertex( [ footprint.maxX, topHeight, footprint.maxZ ], [ 0, 1, 0 ], [ topTileEndU, topTileStartV ], color, 0, 1 );
		const top2 = builder.addVertex( [ footprint.maxX, topHeight, footprint.minZ ], [ 0, 1, 0 ], [ topTileEndU, topTileEndV ], color, 0, 1 );
		const top3 = builder.addVertex( [ footprint.minX, topHeight, footprint.minZ ], [ 0, 1, 0 ], [ topTileStartU, topTileEndV ], color, 0, 1 );

		builder.addTriangle( top0, top1, top2 );
		builder.addTriangle( top0, top2, top3 );

	}

	return builder.build();

}

interface ViewProjection {
	direction: [ number, number, number ];
	right: [ number, number, number ];
	up: [ number, number, number ];
	minRight: number;
	maxRight: number;
	minUp: number;
	maxUp: number;
}

type ImpostorViewInput = number | ImpostorView;

function resolveImpostorView( view: ImpostorViewInput ): ImpostorView {

	return typeof view === 'number' ? yawImpostorView( view ) : view;

}

function isIndexInRanges( index: number, ranges: readonly { start: number; count: number }[] | undefined ): boolean {

	return ranges?.some( ( range ) => index >= range.start && index < range.start + range.count ) ?? false;

}

function createViewProjection( bounds: VegetationData['bounds'], mesh: MeshData, input: ImpostorViewInput, excludedIndexRanges: readonly { start: number; count: number }[] = [] ): ViewProjection {

	const view = resolveImpostorView( input );
	const directionLength = Math.hypot( ...view.direction );

	if ( ! Number.isFinite( directionLength ) || directionLength === 0 || view.direction.some( ( component ) => ! Number.isFinite( component ) ) ) {

		throw new RangeError( 'Impostor view direction must be finite and nonzero' );

	}

	const direction = view.direction.map( ( component ) => component / directionLength ) as [ number, number, number ];
	let upReference = view.up ?? [ 0, 1, 0 ];

	if ( upReference.some( ( component ) => ! Number.isFinite( component ) ) || Math.hypot( ...upReference ) === 0 ) {

		throw new RangeError( 'Impostor view up direction must be finite and nonzero' );

	}

	let right: [ number, number, number ] = [
		upReference[ 1 ] * direction[ 2 ] - upReference[ 2 ] * direction[ 1 ],
		upReference[ 2 ] * direction[ 0 ] - upReference[ 0 ] * direction[ 2 ],
		upReference[ 0 ] * direction[ 1 ] - upReference[ 1 ] * direction[ 0 ],
	];
	let rightLength = Math.hypot( ...right );

	if ( rightLength < 1e-8 && view.up === undefined ) {

		upReference = direction[ 1 ] >= 0 ? [ 0, 0, - 1 ] : [ 0, 0, 1 ];
		right = [
			upReference[ 1 ] * direction[ 2 ] - upReference[ 2 ] * direction[ 1 ],
			upReference[ 2 ] * direction[ 0 ] - upReference[ 0 ] * direction[ 2 ],
			upReference[ 0 ] * direction[ 1 ] - upReference[ 1 ] * direction[ 0 ],
		];
		rightLength = Math.hypot( ...right );

	}

	if ( rightLength < 1e-8 ) {

		throw new RangeError( 'Impostor view up direction cannot be parallel to its view direction' );

	}

	right = right.map( ( component ) => component / rightLength ) as [ number, number, number ];
	const up: [ number, number, number ] = [
		direction[ 1 ] * right[ 2 ] - direction[ 2 ] * right[ 1 ],
		direction[ 2 ] * right[ 0 ] - direction[ 0 ] * right[ 2 ],
		direction[ 0 ] * right[ 1 ] - direction[ 1 ] * right[ 0 ],
	];
	let minRight = Infinity;
	let maxRight = - Infinity;
	let minUp = Infinity;
	let maxUp = - Infinity;

	if ( Math.abs( direction[ 1 ] ) < 1e-8 && Math.abs( up[ 1 ] ) > 1 - 1e-8 ) {

		minRight = - bounds.radius;
		maxRight = bounds.radius;
		minUp = 0;
		maxUp = bounds.height;

	} else {

		for ( let triangle = 0; triangle < mesh.indices.length; triangle += 3 ) {

			if ( isIndexInRanges( triangle, excludedIndexRanges ) ) continue;

			const offset0 = mesh.indices[ triangle ]! * 3;
			const offset1 = mesh.indices[ triangle + 1 ]! * 3;
			const offset2 = mesh.indices[ triangle + 2 ]! * 3;
			const right0 = mesh.positions[ offset0 ]! * right[ 0 ] + mesh.positions[ offset0 + 1 ]! * right[ 1 ] + mesh.positions[ offset0 + 2 ]! * right[ 2 ];
			const right1 = mesh.positions[ offset1 ]! * right[ 0 ] + mesh.positions[ offset1 + 1 ]! * right[ 1 ] + mesh.positions[ offset1 + 2 ]! * right[ 2 ];
			const right2 = mesh.positions[ offset2 ]! * right[ 0 ] + mesh.positions[ offset2 + 1 ]! * right[ 1 ] + mesh.positions[ offset2 + 2 ]! * right[ 2 ];
			const up0 = mesh.positions[ offset0 ]! * up[ 0 ] + mesh.positions[ offset0 + 1 ]! * up[ 1 ] + mesh.positions[ offset0 + 2 ]! * up[ 2 ];
			const up1 = mesh.positions[ offset1 ]! * up[ 0 ] + mesh.positions[ offset1 + 1 ]! * up[ 1 ] + mesh.positions[ offset1 + 2 ]! * up[ 2 ];
			const up2 = mesh.positions[ offset2 ]! * up[ 0 ] + mesh.positions[ offset2 + 1 ]! * up[ 1 ] + mesh.positions[ offset2 + 2 ]! * up[ 2 ];
			const area = ( right1 - right0 ) * ( up2 - up0 ) - ( up1 - up0 ) * ( right2 - right0 );

			if ( Math.abs( area ) < 1e-10 ) {

				continue;

			}

			minRight = Math.min( minRight, right0, right1, right2 );
			maxRight = Math.max( maxRight, right0, right1, right2 );
			minUp = Math.min( minUp, up0, up1, up2 );
			maxUp = Math.max( maxUp, up0, up1, up2 );

		}

	}

	if ( ! Number.isFinite( minRight ) || ! Number.isFinite( maxRight ) ) {

		minRight = - 0.5;
		maxRight = 0.5;

	} else if ( maxRight - minRight < 1e-8 ) {

		minRight -= 0.5;
		maxRight += 0.5;

	}
	if ( ! Number.isFinite( minUp ) || ! Number.isFinite( maxUp ) ) {

		minUp = - 0.5;
		maxUp = 0.5;

	} else if ( maxUp - minUp < 1e-8 ) {

		minUp -= 0.5;
		maxUp += 0.5;

	}

	return { direction, right, up, minRight, maxRight, minUp, maxUp };

}

export function getImpostorProjectionWindow( bounds: VegetationData['bounds'], mesh: MeshData, view: ImpostorView ): Pick<ViewProjection, 'minRight' | 'maxRight' | 'minUp' | 'maxUp'> {

	const projection = createViewProjection( bounds, mesh, view );
	return {
		minRight: projection.minRight,
		maxRight: projection.maxRight,
		minUp: projection.minUp,
		maxUp: projection.maxUp,
	};

}

/** 指定した視線方向の正射影を横並びに焼きます。 */
export function bakeImpostor( data: VegetationData, colors: Color3[], size: number, viewInputs: readonly ImpostorViewInput[] = [ 0, Math.PI / 2 ] ): TextureData {

	if ( viewInputs.length === 0 || viewInputs.some( ( view ) => typeof view === 'number' ? ! Number.isFinite( view ) : false ) ) {

		throw new RangeError( 'Impostor views must contain finite directions' );

	}

	const rasterSize = nextPowerOfTwo( Math.max( 4, size ) );
	const tileGrid = getTileGrid( viewInputs.length );
	const width = rasterSize * tileGrid.columns;
	const height = rasterSize * tileGrid.rows;
	const image = new Uint8Array( width * height * 4 );
	const depthBuffer = new Float32Array( width * height );
	const mesh = data.lods[ 0 ]!;
	const excludedIndexRanges = data.parts.flatMap( ( part ) => part.impostorBakeExcludeIndexRanges ?? [] );
	const lightX = 0.4 / Math.hypot( 0.4, 0.8, 0.45 );
	const lightY = 0.8 / Math.hypot( 0.4, 0.8, 0.45 );
	const lightZ = 0.45 / Math.hypot( 0.4, 0.8, 0.45 );

	depthBuffer.fill( - Infinity );

	for ( let view = 0; view < viewInputs.length; view ++ ) {

		const excludesBakeRanges = resolveImpostorView( viewInputs[ view ]! ).excludesBakeRanges === true;
		const projection = createViewProjection( data.bounds, mesh, viewInputs[ view ]!, excludesBakeRanges ? excludedIndexRanges : [] );

		for ( const group of mesh.groups ) {

			const partIndex = group.partIndex;
			const part = data.parts[ partIndex ]!;
			const materialColor = colors[ partIndex ]!;
			const texture = part.texture === null ? null : data.textures[ part.texture ] ?? null;

			for ( let i = group.start; i < group.start + group.count; i += 3 ) {

				if ( excludesBakeRanges && isIndexInRanges( i, part.impostorBakeExcludeIndexRanges ) ) continue;

				rasterizeTriangle( data, mesh, i, rasterSize, width, tileGrid.columns, view, projection, image, depthBuffer, materialColor, part.alphaTest, texture, lightX, lightY, lightZ );

			}

		}

	}

	dilateEdges( image, width, rasterSize, viewInputs.length, tileGrid.columns );

	return { width, height, data: image };

}

export function extractImpostorViews( texture: TextureData, sourceViews: readonly ImpostorViewInput[], targetViews: readonly ImpostorViewInput[] ): TextureData | null {

	if ( targetViews.length === 0 || targetViews.length > sourceViews.length ) return null;

	const sourceGrid = getTileGrid( sourceViews.length );
	const targetGrid = getTileGrid( targetViews.length );
	const tileSize = texture.width / sourceGrid.columns;
	if ( ! Number.isInteger( tileSize ) || texture.height !== tileSize * sourceGrid.rows ) return null;

	const sourceIndices = targetViews.map( ( targetInput ) => {
		const targetView = resolveImpostorView( targetInput );
		return sourceViews.findIndex( ( sourceInput ) => {
			const sourceView = resolveImpostorView( sourceInput );
			const sourceUp = sourceView.up ?? [ 0, 1, 0 ];
			const targetUp = targetView.up ?? [ 0, 1, 0 ];
			return sourceView.direction[ 0 ] === targetView.direction[ 0 ] &&
				sourceView.direction[ 1 ] === targetView.direction[ 1 ] &&
				sourceView.direction[ 2 ] === targetView.direction[ 2 ] &&
				sourceUp[ 0 ] === targetUp[ 0 ] &&
				sourceUp[ 1 ] === targetUp[ 1 ] &&
				sourceUp[ 2 ] === targetUp[ 2 ];
		} );
	} );

	if ( sourceIndices.some( ( index ) => index < 0 ) ) return null;

	const width = tileSize * targetGrid.columns;
	const height = tileSize * targetGrid.rows;
	const image = new Uint8Array( width * height * 4 );

	for ( let targetIndex = 0; targetIndex < sourceIndices.length; targetIndex ++ ) {

		const sourceIndex = sourceIndices[ targetIndex ]!;
		const sourceX = ( sourceIndex % sourceGrid.columns ) * tileSize;
		const sourceY = Math.floor( sourceIndex / sourceGrid.columns ) * tileSize;
		const targetX = ( targetIndex % targetGrid.columns ) * tileSize;
		const targetY = Math.floor( targetIndex / targetGrid.columns ) * tileSize;

		for ( let y = 0; y < tileSize; y ++ ) {

			const sourceOffset = ( ( sourceY + y ) * texture.width + sourceX ) * 4;
			const targetOffset = ( ( targetY + y ) * width + targetX ) * 4;
			image.set( texture.data.subarray( sourceOffset, sourceOffset + tileSize * 4 ), targetOffset );

		}

	}

	return { width, height, data: image };

}

function rasterizeTriangle(
	data: VegetationData,
	mesh: MeshData,
	triangleStart: number,
	size: number,
	imageWidth: number,
	tileColumns: number,
	view: number,
	projection: ViewProjection,
	image: Uint8Array,
	depthBuffer: Float32Array,
	materialColor: Color3,
	alphaTest: number,
	texture: TextureData | null,
	lightX: number,
	lightY: number,
	lightZ: number
): void {

	const index0 = mesh.indices[ triangleStart ]!;
	const index1 = mesh.indices[ triangleStart + 1 ]!;
	const index2 = mesh.indices[ triangleStart + 2 ]!;
	const position0 = index0 * 3;
	const position1 = index1 * 3;
	const position2 = index2 * 3;
	const xWorld0 = mesh.positions[ position0 ]!;
	const yWorld0 = mesh.positions[ position0 + 1 ]!;
	const zWorld0 = mesh.positions[ position0 + 2 ]!;
	const xWorld1 = mesh.positions[ position1 ]!;
	const yWorld1 = mesh.positions[ position1 + 1 ]!;
	const zWorld1 = mesh.positions[ position1 + 2 ]!;
	const xWorld2 = mesh.positions[ position2 ]!;
	const yWorld2 = mesh.positions[ position2 + 1 ]!;
	const zWorld2 = mesh.positions[ position2 + 2 ]!;
	const x0 = ( xWorld0 * projection.right[ 0 ] + yWorld0 * projection.right[ 1 ] + zWorld0 * projection.right[ 2 ] - projection.minRight ) / ( projection.maxRight - projection.minRight ) * size;
	const x1 = ( xWorld1 * projection.right[ 0 ] + yWorld1 * projection.right[ 1 ] + zWorld1 * projection.right[ 2 ] - projection.minRight ) / ( projection.maxRight - projection.minRight ) * size;
	const x2 = ( xWorld2 * projection.right[ 0 ] + yWorld2 * projection.right[ 1 ] + zWorld2 * projection.right[ 2 ] - projection.minRight ) / ( projection.maxRight - projection.minRight ) * size;
	const y0 = ( xWorld0 * projection.up[ 0 ] + yWorld0 * projection.up[ 1 ] + zWorld0 * projection.up[ 2 ] - projection.minUp ) / ( projection.maxUp - projection.minUp ) * size;
	const y1 = ( xWorld1 * projection.up[ 0 ] + yWorld1 * projection.up[ 1 ] + zWorld1 * projection.up[ 2 ] - projection.minUp ) / ( projection.maxUp - projection.minUp ) * size;
	const y2 = ( xWorld2 * projection.up[ 0 ] + yWorld2 * projection.up[ 1 ] + zWorld2 * projection.up[ 2 ] - projection.minUp ) / ( projection.maxUp - projection.minUp ) * size;
	const denominator = ( y1 - y2 ) * ( x0 - x2 ) + ( x2 - x1 ) * ( y0 - y2 );

	if ( denominator === 0 ) {

		return;

	}

	// 画素中心を使って外接範囲を切り詰め、bounds の端も画像内に収める。
	const minX = Math.max( 0, Math.ceil( Math.min( x0, x1, x2 ) - 0.5 ) );
	const maxX = Math.min( size - 1, Math.floor( Math.max( x0, x1, x2 ) - 0.5 ) );
	const minY = Math.max( 0, Math.ceil( Math.min( y0, y1, y2 ) - 0.5 ) );
	const maxY = Math.min( size - 1, Math.floor( Math.max( y0, y1, y2 ) - 0.5 ) );
	const textureWidth = texture?.width ?? 0;
	const textureHeight = texture?.height ?? 0;
	const textureData = texture?.data;
	const color0 = index0 * 3;
	const color1 = index1 * 3;
	const color2 = index2 * 3;
	const normal0 = index0 * 3;
	const normal1 = index1 * 3;
	const normal2 = index2 * 3;
	const uv0 = index0 * 2;
	const uv1 = index1 * 2;
	const uv2 = index2 * 2;
	const depth0 = xWorld0 * projection.direction[ 0 ] + yWorld0 * projection.direction[ 1 ] + zWorld0 * projection.direction[ 2 ];
	const depth1 = xWorld1 * projection.direction[ 0 ] + yWorld1 * projection.direction[ 1 ] + zWorld1 * projection.direction[ 2 ];
	const depth2 = xWorld2 * projection.direction[ 0 ] + yWorld2 * projection.direction[ 1 ] + zWorld2 * projection.direction[ 2 ];
	const inverseDenominator = 1 / denominator;
	const viewOffset = Math.floor( view / tileColumns ) * size * imageWidth + ( view % tileColumns ) * size;

	for ( let y = minY; y <= maxY; y ++ ) {

		for ( let x = minX; x <= maxX; x ++ ) {

			const pixelX = x + 0.5;
			const pixelY = y + 0.5;
			const weight0 = ( ( y1 - y2 ) * ( pixelX - x2 ) + ( x2 - x1 ) * ( pixelY - y2 ) ) * inverseDenominator;
			const weight1 = ( ( y2 - y0 ) * ( pixelX - x2 ) + ( x0 - x2 ) * ( pixelY - y2 ) ) * inverseDenominator;
			const weight2 = 1 - weight0 - weight1;

			if ( weight0 < 0 || weight1 < 0 || weight2 < 0 ) {

				continue;

			}

			const pixelIndex = y * imageWidth + viewOffset + x;
			const pixelDepth = weight0 * depth0 + weight1 * depth1 + weight2 * depth2;

			if ( pixelDepth <= depthBuffer[ pixelIndex ]! ) {

				continue;

			}

			let textureRed = 1;
			let textureGreen = 1;
			let textureBlue = 1;

			if ( textureData !== undefined ) {

				const u = weight0 * mesh.uvs[ uv0 ]! + weight1 * mesh.uvs[ uv1 ]! + weight2 * mesh.uvs[ uv2 ]!;
				const v = weight0 * mesh.uvs[ uv0 + 1 ]! + weight1 * mesh.uvs[ uv1 + 1 ]! + weight2 * mesh.uvs[ uv2 + 1 ]!;
				const textureX = Math.min( textureWidth - 1, Math.max( 0, Math.floor( u * textureWidth ) ) );
				// TextureData の v=0 は row 0（画像下端）に揃える。
				const textureY = Math.min( textureHeight - 1, Math.max( 0, Math.floor( v * textureHeight ) ) );
				const textureOffset = ( textureY * textureWidth + textureX ) * 4;
				const alpha = textureData[ textureOffset + 3 ]! / 255;

				if ( alpha < alphaTest ) {

					continue;

				}

				textureRed = linearSrgb[ textureData[ textureOffset ]! ]!;
				textureGreen = linearSrgb[ textureData[ textureOffset + 1 ]! ]!;
				textureBlue = linearSrgb[ textureData[ textureOffset + 2 ]! ]!;

			}

			const red = ( weight0 * mesh.colors[ color0 ]! + weight1 * mesh.colors[ color1 ]! + weight2 * mesh.colors[ color2 ]! ) * materialColor[ 0 ] * textureRed;
			const green = ( weight0 * mesh.colors[ color0 + 1 ]! + weight1 * mesh.colors[ color1 + 1 ]! + weight2 * mesh.colors[ color2 + 1 ]! ) * materialColor[ 1 ] * textureGreen;
			const blue = ( weight0 * mesh.colors[ color0 + 2 ]! + weight1 * mesh.colors[ color1 + 2 ]! + weight2 * mesh.colors[ color2 + 2 ]! ) * materialColor[ 2 ] * textureBlue;
			const normalX = weight0 * mesh.normals[ normal0 ]! + weight1 * mesh.normals[ normal1 ]! + weight2 * mesh.normals[ normal2 ]!;
			const normalY = weight0 * mesh.normals[ normal0 + 1 ]! + weight1 * mesh.normals[ normal1 + 1 ]! + weight2 * mesh.normals[ normal2 + 1 ]!;
			const normalZ = weight0 * mesh.normals[ normal0 + 2 ]! + weight1 * mesh.normals[ normal1 + 2 ]! + weight2 * mesh.normals[ normal2 + 2 ]!;
			const inverseNormalLength = 1 / Math.hypot( normalX, normalY, normalZ );
			const diffuse = Math.max( 0, ( normalX * lightX + normalY * lightY + normalZ * lightZ ) * inverseNormalLength );
			const lighting = 0.35 + 0.65 * diffuse;
			const imageOffset = pixelIndex * 4;

			image[ imageOffset ] = linearToSrgbByte( red * lighting );
			image[ imageOffset + 1 ] = linearToSrgbByte( green * lighting );
			image[ imageOffset + 2 ] = linearToSrgbByte( blue * lighting );
			image[ imageOffset + 3 ] = 255;
			depthBuffer[ pixelIndex ] = pixelDepth;

		}

	}

}

function dilateEdges( image: Uint8Array, width: number, size: number, viewCount: number, tileColumns: number ): void {

	for ( let view = 0; view < viewCount; view ++ ) {

		const viewX = ( view % tileColumns ) * size;
		const viewY = Math.floor( view / tileColumns ) * size;
		let minimumX = size;
		let minimumY = size;
		let maximumX = - 1;
		let maximumY = - 1;

		for ( let y = 0; y < size; y ++ ) {

			for ( let x = 0; x < size; x ++ ) {

				const sourceIndex = ( ( viewY + y ) * width + viewX + x ) * 4;
				if ( image[ sourceIndex + 3 ] === 0 ) continue;
				minimumX = Math.min( minimumX, x );
				minimumY = Math.min( minimumY, y );
				maximumX = Math.max( maximumX, x );
				maximumY = Math.max( maximumY, y );

			}

		}

		if ( maximumX < 0 ) continue;
		const startX = Math.max( 0, minimumX - 1 );
		const startY = Math.max( 0, minimumY - 1 );
		const endX = Math.min( size - 1, maximumX + 1 );
		const endY = Math.min( size - 1, maximumY + 1 );

		for ( let y = startY; y <= endY; y ++ ) {

			for ( let x = startX; x <= endX; x ++ ) {

				const pixelIndex = ( ( viewY + y ) * width + viewX + x ) * 4;
				if ( image[ pixelIndex + 3 ] !== 0 ) continue;

				for ( let neighborY = Math.max( startY, y - 1 ); neighborY <= Math.min( endY, y + 1 ); neighborY ++ ) {

					let copied = false;
					for ( let neighborX = Math.max( startX, x - 1 ); neighborX <= Math.min( endX, x + 1 ); neighborX ++ ) {
						if ( neighborX === x && neighborY === y ) continue;
						const neighborIndex = ( ( viewY + neighborY ) * width + viewX + neighborX ) * 4;
						if ( image[ neighborIndex + 3 ] === 0 ) continue;
						image[ pixelIndex ] = image[ neighborIndex ]!;
						image[ pixelIndex + 1 ] = image[ neighborIndex + 1 ]!;
						image[ pixelIndex + 2 ] = image[ neighborIndex + 2 ]!;
						copied = true;
						break;
					}

					if ( copied ) break;

				}

			}

		}

	}

}
