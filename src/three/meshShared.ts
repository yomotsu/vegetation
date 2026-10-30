import { Color } from 'three';
import type { ColorRepresentation } from 'three';
import type { VegetationAssetOptions } from './VegetationAsset';
import type { VegetationWorkerKind } from '../worker/protocol';
import { disposeVegetationWorkers as disposeVegetationWorkerPool } from '../worker/workerPool';
import { disposeInternalKTX2Loaders } from './ktx2Loader';

export function vegetationAssetOptions( options: Pick<VegetationAssetOptions, 'compressTextures' | 'ktx2Loader'> ): VegetationAssetOptions {

	return { compressTextures: options.compressTextures, ktx2Loader: options.ktx2Loader };

}

export function colorHex( color: ColorRepresentation | undefined, fallback: number ): number {

	return new Color( color ?? fallback ).getHex();

}

export function workerOptions( options: object ): Record<string, number | boolean | string> {

	return Object.fromEntries( Object.entries( options ).filter( ( entry ): entry is [ string, number | boolean | string ] => typeof entry[ 1 ] === 'number' || typeof entry[ 1 ] === 'boolean' || typeof entry[ 1 ] === 'string' ) );

}

export function workerRequest(
	kind: VegetationWorkerKind,
	options: object,
	colors: Record<string, number>,
): { kind: VegetationWorkerKind; options: Record<string, number | boolean | string>; colors: Record<string, number>; impostorSize: number } {

	return { kind, options: workerOptions( options ), colors, impostorSize: 128 };

}

export function disposeVegetationWorkers(): void {

	disposeVegetationWorkerPool();
	disposeInternalKTX2Loaders();

}
