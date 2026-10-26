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

const linearSrgb = new Float32Array( 256 );

for ( let i = 0; i < 256; i ++ ) {

	const value = i / 255;
	linearSrgb[ i ] = value <= 0.04045 ? value / 12.92 : ( ( value + 0.055 ) / 1.055 ) ** 2.4;

}

export function impostorPart(): PartDef {

	return {
		name: 'impostor',
		defaultColor: 0xffffff,
		texture: 'impostor',
		impostorViews: LOD4_IMPOSTOR_VIEWS,
		alphaTest: 0.5,
		doubleSided: true,
		flatShading: false,
	};

}

export function impostorLod3Part(): PartDef {

	return {
		name: 'impostor-lod3',
		defaultColor: 0xffffff,
		texture: 'impostor-lod3',
		impostorViews: LOD3_IMPOSTOR_VIEWS,
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

		const triangle = [ mesh.indices[ index ]!, mesh.indices[ index + 1 ]!, mesh.indices[ index + 2 ]! ];

		for ( let edge = 0; edge < 3; edge ++ ) {

			const firstOffset = triangle[ edge ]! * 3;
			const secondOffset = triangle[ ( edge + 1 ) % 3 ]! * 3;
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

export function buildBillboard( bounds: { radius: number; height: number }, impostorPartIndex: number, lod0?: MeshData, topHeight = bounds.height * 0.75 ): MeshData {

	const builder = new MeshBuilder();
	const radius = bounds.radius;
	const height = bounds.height;
	const normalWeight = Math.SQRT1_2;
	const color: Color3 = [ 1, 1, 1 ];
	const footprint = getFootprint( lod0, radius, topHeight );

	builder.beginGroup( impostorPartIndex );

	const a0 = builder.addVertex( [ - radius, 0, 0 ], [ 0, normalWeight, normalWeight ], [ 0, 0 ], color, 0, 0 );
	const a1 = builder.addVertex( [ radius, 0, 0 ], [ 0, normalWeight, normalWeight ], [ 0.5, 0 ], color, 0, 0 );
	const a2 = builder.addVertex( [ radius, height, 0 ], [ 0, normalWeight, normalWeight ], [ 0.5, 1 ], color, 1, 0 );
	const a3 = builder.addVertex( [ - radius, height, 0 ], [ 0, normalWeight, normalWeight ], [ 0, 1 ], color, 1, 0 );

	builder.addTriangle( a0, a1, a2 );
	builder.addTriangle( a0, a2, a3 );

	const top0 = builder.addVertex( [ footprint.minX, topHeight, footprint.maxZ ], [ 0, 1, 0 ], [ 0.5, 0 ], color, 0, 1 );
	const top1 = builder.addVertex( [ footprint.maxX, topHeight, footprint.maxZ ], [ 0, 1, 0 ], [ 1, 0 ], color, 0, 1 );
	const top2 = builder.addVertex( [ footprint.maxX, topHeight, footprint.minZ ], [ 0, 1, 0 ], [ 1, 1 ], color, 0, 1 );
	const top3 = builder.addVertex( [ footprint.minX, topHeight, footprint.minZ ], [ 0, 1, 0 ], [ 0.5, 1 ], color, 0, 1 );

	builder.addTriangle( top0, top1, top2 );
	builder.addTriangle( top0, top2, top3 );

	return builder.build();

}

export function buildSixPlaneImpostor( height: number, radius: number, partIndex: number, lod0?: MeshData, topHeight = height * 0.25 ): MeshData {

	const builder = new MeshBuilder();
	const normalWeight = Math.SQRT1_2;
	const color: Color3 = [ 1, 1, 1 ];
	const planeRadius = radius * 0.995;
	const footprint = getFootprint( lod0, radius, topHeight );
	builder.beginGroup( partIndex );

	for ( let view = 0; view < LOD3_IMPOSTOR_YAW_ANGLES.length; view ++ ) {

		const yaw = LOD3_IMPOSTOR_YAW_ANGLES[ view ]!;
		const rightX = Math.cos( yaw );
		const rightZ = - Math.sin( yaw );
		const normal: [ number, number, number ] = [ Math.sin( yaw ) * normalWeight, normalWeight, Math.cos( yaw ) * normalWeight ];
		const tileStart = view / LOD3_IMPOSTOR_VIEWS.length;
		const tileEnd = ( view + 1 ) / LOD3_IMPOSTOR_VIEWS.length;
		const a0 = builder.addVertex( [ - rightX * planeRadius, 0, - rightZ * planeRadius ], normal, [ tileStart, 0 ], color, 0, 0 );
		const a1 = builder.addVertex( [ rightX * planeRadius, 0, rightZ * planeRadius ], normal, [ tileEnd, 0 ], color, 0, 0 );
		const a2 = builder.addVertex( [ rightX * planeRadius, height, rightZ * planeRadius ], normal, [ tileEnd, 1 ], color, 1, 0 );
		const a3 = builder.addVertex( [ - rightX * planeRadius, height, - rightZ * planeRadius ], normal, [ tileStart, 1 ], color, 1, 0 );

		builder.addTriangle( a0, a1, a2 );
		builder.addTriangle( a0, a2, a3 );

	}

	const topTileStart = LOD3_IMPOSTOR_YAW_ANGLES.length / LOD3_IMPOSTOR_VIEWS.length;
	const topTileEnd = 1;
	const top0 = builder.addVertex( [ footprint.minX, topHeight, footprint.maxZ ], [ 0, 1, 0 ], [ topTileStart, 0 ], color, 0, 1 );
	const top1 = builder.addVertex( [ footprint.maxX, topHeight, footprint.maxZ ], [ 0, 1, 0 ], [ topTileEnd, 0 ], color, 0, 1 );
	const top2 = builder.addVertex( [ footprint.maxX, topHeight, footprint.minZ ], [ 0, 1, 0 ], [ topTileEnd, 1 ], color, 0, 1 );
	const top3 = builder.addVertex( [ footprint.minX, topHeight, footprint.minZ ], [ 0, 1, 0 ], [ topTileStart, 1 ], color, 0, 1 );

	builder.addTriangle( top0, top1, top2 );
	builder.addTriangle( top0, top2, top3 );

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

function createViewProjection( data: VegetationData, mesh: MeshData, input: ImpostorViewInput ): ViewProjection {

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

		minRight = - data.bounds.radius;
		maxRight = data.bounds.radius;
		minUp = 0;
		maxUp = data.bounds.height;

	} else {

		for ( let triangle = 0; triangle < mesh.indices.length; triangle += 3 ) {

			const projected: [ number, number ][] = [];

			for ( let corner = 0; corner < 3; corner ++ ) {

				const offset = mesh.indices[ triangle + corner ]! * 3;
				const x = mesh.positions[ offset ]!;
				const y = mesh.positions[ offset + 1 ]!;
				const z = mesh.positions[ offset + 2 ]!;
				projected.push( [ x * right[ 0 ] + y * right[ 1 ] + z * right[ 2 ], x * up[ 0 ] + y * up[ 1 ] + z * up[ 2 ] ] );

			}

			const area = ( projected[ 1 ]![ 0 ] - projected[ 0 ]![ 0 ] ) * ( projected[ 2 ]![ 1 ] - projected[ 0 ]![ 1 ] ) - ( projected[ 1 ]![ 1 ] - projected[ 0 ]![ 1 ] ) * ( projected[ 2 ]![ 0 ] - projected[ 0 ]![ 0 ] );

			if ( Math.abs( area ) < 1e-10 ) {

				continue;

			}

			for ( const [ projectedRight, projectedUp ] of projected ) {

				minRight = Math.min( minRight, projectedRight );
				maxRight = Math.max( maxRight, projectedRight );
				minUp = Math.min( minUp, projectedUp );
				maxUp = Math.max( maxUp, projectedUp );

			}

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

/** 指定した視線方向の正射影を横並びに焼きます。 */
export function bakeImpostor( data: VegetationData, colors: Color3[], size: number, viewInputs: readonly ImpostorViewInput[] = [ 0, Math.PI / 2 ] ): TextureData {

	if ( viewInputs.length === 0 || viewInputs.some( ( view ) => typeof view === 'number' ? ! Number.isFinite( view ) : false ) ) {

		throw new RangeError( 'Impostor views must contain finite directions' );

	}

	const width = size * viewInputs.length;
	const height = size;
	const image = new Uint8Array( width * height * 4 );
	const depthBuffer = new Float32Array( width * height );
	const mesh = data.lods[ 0 ]!;
	const lightX = 0.4 / Math.hypot( 0.4, 0.8, 0.45 );
	const lightY = 0.8 / Math.hypot( 0.4, 0.8, 0.45 );
	const lightZ = 0.45 / Math.hypot( 0.4, 0.8, 0.45 );

	depthBuffer.fill( - Infinity );

	for ( let view = 0; view < viewInputs.length; view ++ ) {

		const projection = createViewProjection( data, mesh, viewInputs[ view ]! );

		for ( const group of mesh.groups ) {

			const partIndex = group.partIndex;
			const part = data.parts[ partIndex ]!;
			const materialColor = colors[ partIndex ]!;
			const texture = part.texture === null ? null : data.textures[ part.texture ] ?? null;

			for ( let i = group.start; i < group.start + group.count; i += 3 ) {

				rasterizeTriangle( data, mesh, i, size, width, view, projection, image, depthBuffer, materialColor, part.alphaTest, texture, lightX, lightY, lightZ );

			}

		}

	}

	dilateEdges( image, width, size, height, viewInputs.length );

	return { width, height, data: image };

}

function rasterizeTriangle(
	data: VegetationData,
	mesh: MeshData,
	triangleStart: number,
	size: number,
	imageWidth: number,
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
	const projectRight = ( x: number, y: number, z: number ) => ( x * projection.right[ 0 ] + y * projection.right[ 1 ] + z * projection.right[ 2 ] - projection.minRight ) / ( projection.maxRight - projection.minRight ) * size;
	const projectUp = ( x: number, y: number, z: number ) => ( x * projection.up[ 0 ] + y * projection.up[ 1 ] + z * projection.up[ 2 ] - projection.minUp ) / ( projection.maxUp - projection.minUp ) * size;
	const x0 = projectRight( xWorld0, yWorld0, zWorld0 );
	const x1 = projectRight( xWorld1, yWorld1, zWorld1 );
	const x2 = projectRight( xWorld2, yWorld2, zWorld2 );
	const y0 = projectUp( xWorld0, yWorld0, zWorld0 );
	const y1 = projectUp( xWorld1, yWorld1, zWorld1 );
	const y2 = projectUp( xWorld2, yWorld2, zWorld2 );
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
	const viewOffset = view * size;

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

function dilateEdges( image: Uint8Array, width: number, size: number, height: number, viewCount: number ): void {

	for ( let view = 0; view < viewCount; view ++ ) {

		for ( let y = 0; y < height; y ++ ) {

			for ( let x = 0; x < size; x ++ ) {

				const pixelIndex = y * width + view * size + x;
				const imageOffset = pixelIndex * 4;

				if ( image[ imageOffset + 3 ] !== 0 ) {

					continue;

				}

				let copied = false;

				for ( let dy = - 1; dy <= 1 && ! copied; dy ++ ) {

					for ( let dx = - 1; dx <= 1; dx ++ ) {

						if ( dx === 0 && dy === 0 ) {

							continue;

						}

						const neighborX = x + dx;
						const neighborY = y + dy;

						if ( neighborX < 0 || neighborX >= size || neighborY < 0 || neighborY >= height ) {

							continue;

						}

						const neighborIndex = ( neighborY * width + view * size + neighborX ) * 4;

						if ( image[ neighborIndex + 3 ] !== 255 ) {

							continue;

						}

						image[ imageOffset ] = image[ neighborIndex ]!;
						image[ imageOffset + 1 ] = image[ neighborIndex + 1 ]!;
						image[ imageOffset + 2 ] = image[ neighborIndex + 2 ]!;
						copied = true;
						break;

					}

				}

			}

		}

	}

}
