import { linearToSrgbByte } from './color';
import { MeshBuilder } from './meshBuilder';
import type { Color3, MeshData, PartDef, TextureData, VegetationData } from './types';

export const LOD3_IMPOSTOR_YAW_ANGLES = [ 0, Math.PI / 6, Math.PI / 3, Math.PI / 2, Math.PI * 2 / 3, Math.PI * 5 / 6 ] as const;

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
		alphaTest: 0.5,
		doubleSided: true,
		flatShading: false,
	};

}

export function buildBillboard( bounds: { radius: number; height: number }, impostorPartIndex: number ): MeshData {

	const builder = new MeshBuilder();
	const radius = bounds.radius;
	const height = bounds.height;
	const normalWeight = Math.SQRT1_2;
	const color: Color3 = [ 1, 1, 1 ];

	builder.beginGroup( impostorPartIndex );

	const a0 = builder.addVertex( [ - radius, 0, 0 ], [ 0, normalWeight, normalWeight ], [ 0, 0 ], color, 0 );
	const a1 = builder.addVertex( [ radius, 0, 0 ], [ 0, normalWeight, normalWeight ], [ 1, 0 ], color, 0 );
	const a2 = builder.addVertex( [ radius, height, 0 ], [ 0, normalWeight, normalWeight ], [ 1, 1 ], color, 1 );
	const a3 = builder.addVertex( [ - radius, height, 0 ], [ 0, normalWeight, normalWeight ], [ 0, 1 ], color, 1 );

	builder.addTriangle( a0, a1, a2 );
	builder.addTriangle( a0, a2, a3 );

	return builder.build();

}

export function buildSixPlaneImpostor( height: number, radius: number, partIndex: number ): MeshData {

	const builder = new MeshBuilder();
	const normalWeight = Math.SQRT1_2;
	const color: Color3 = [ 1, 1, 1 ];
	const planeRadius = radius * 0.995;
	builder.beginGroup( partIndex );

	for ( let view = 0; view < LOD3_IMPOSTOR_YAW_ANGLES.length; view ++ ) {

		const yaw = LOD3_IMPOSTOR_YAW_ANGLES[ view ]!;
		const rightX = Math.cos( yaw );
		const rightZ = - Math.sin( yaw );
		const normal: [ number, number, number ] = [ Math.sin( yaw ) * normalWeight, normalWeight, Math.cos( yaw ) * normalWeight ];
		const tileStart = view / LOD3_IMPOSTOR_YAW_ANGLES.length;
		const tileEnd = ( view + 1 ) / LOD3_IMPOSTOR_YAW_ANGLES.length;
		const a0 = builder.addVertex( [ - rightX * planeRadius, 0, - rightZ * planeRadius ], normal, [ tileStart, 0 ], color, 0 );
		const a1 = builder.addVertex( [ rightX * planeRadius, 0, rightZ * planeRadius ], normal, [ tileEnd, 0 ], color, 0 );
		const a2 = builder.addVertex( [ rightX * planeRadius, height, rightZ * planeRadius ], normal, [ tileEnd, 1 ], color, 1 );
		const a3 = builder.addVertex( [ - rightX * planeRadius, height, - rightZ * planeRadius ], normal, [ tileStart, 1 ], color, 1 );

		builder.addTriangle( a0, a1, a2 );
		builder.addTriangle( a0, a2, a3 );

	}

	return builder.build();

}

/** 指定した yaw ごとの画像を横に並べたアトラスを作ります。 */
export function bakeImpostor( data: VegetationData, colors: Color3[], size: number, viewYawAngles: readonly number[] = [ 0, Math.PI / 2 ] ): TextureData {

	if ( viewYawAngles.length === 0 || viewYawAngles.some( ( angle ) => ! Number.isFinite( angle ) ) ) {
		throw new RangeError( 'Impostor views must contain finite yaw angles' );
	}

	const width = size * viewYawAngles.length;
	const height = size;
	const image = new Uint8Array( width * height * 4 );
	const depthBuffer = new Float32Array( width * height );
	const mesh = data.lods[ 0 ]!;
	const lightX = 0.4 / Math.hypot( 0.4, 0.8, 0.45 );
	const lightY = 0.8 / Math.hypot( 0.4, 0.8, 0.45 );
	const lightZ = 0.45 / Math.hypot( 0.4, 0.8, 0.45 );

	depthBuffer.fill( - Infinity );

	for ( let view = 0; view < viewYawAngles.length; view ++ ) {

		for ( const group of mesh.groups ) {

			const partIndex = group.partIndex;
			const part = data.parts[ partIndex ]!;
			const materialColor = colors[ partIndex ]!;
			const texture = part.texture === null ? null : data.textures[ part.texture ] ?? null;

			for ( let i = group.start; i < group.start + group.count; i += 3 ) {

				rasterizeTriangle( data, mesh, i, size, width, view, viewYawAngles[ view ]!, image, depthBuffer, materialColor, part.alphaTest, texture, lightX, lightY, lightZ );

			}

		}

	}

	dilateEdges( image, width, size, height, viewYawAngles.length );

	return { width, height, data: image };

}

function rasterizeTriangle(
	data: VegetationData,
	mesh: MeshData,
	triangleStart: number,
	size: number,
	imageWidth: number,
	view: number,
	yaw: number,
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
	const centerOffset = data.bounds.radius;
	const sine = Math.sin( yaw );
	const cosine = Math.cos( yaw );
	const x0 = ( ( xWorld0 * cosine - zWorld0 * sine ) + centerOffset ) / ( centerOffset * 2 ) * size;
	const x1 = ( ( xWorld1 * cosine - zWorld1 * sine ) + centerOffset ) / ( centerOffset * 2 ) * size;
	const x2 = ( ( xWorld2 * cosine - zWorld2 * sine ) + centerOffset ) / ( centerOffset * 2 ) * size;
	// 行 0 が地面なので、ワールドの高さをそのまま下から上へ写す。
	const y0 = yWorld0 / data.bounds.height * size;
	const y1 = yWorld1 / data.bounds.height * size;
	const y2 = yWorld2 / data.bounds.height * size;
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
	const depth0 = xWorld0 * sine + zWorld0 * cosine;
	const depth1 = xWorld1 * sine + zWorld1 * cosine;
	const depth2 = xWorld2 * sine + zWorld2 * cosine;
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
