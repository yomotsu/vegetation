import type { PreparedVegetationAsset } from '../core/vegetationAssetPreparation';
import type { TextureData } from '../core/types';
import type { UastcEncodeOptions } from '../core/uastc';

export type VegetationWorkerKind = 'broadleaf-tree' | 'willow-tree' | 'pine-tree' | 'fir-tree' | 'bush' | 'rock' | 'pebbles' | 'grass' | 'flowers';

export interface VegetationGenerateRequest {
	id: number;
	task: 'generate';
	kind: VegetationWorkerKind;
	options: Record<string, number | boolean | string>;
	colors: Record<string, number>;
	impostorSize: number;
}

export interface VegetationEncodeRequest {
	id: number;
	task: 'encode';
	texture: TextureData;
	options: UastcEncodeOptions;
}

export type VegetationWorkerRequest = VegetationGenerateRequest | VegetationEncodeRequest;

export interface VegetationGenerateResponse {
	id: number;
	task: 'generate';
	prepared: PreparedVegetationAsset;
}

export interface VegetationEncodeResponse {
	id: number;
	task: 'encode';
	buffer: ArrayBuffer;
	encodeTimeMs: number;
}

export type VegetationWorkerSuccessResponse = VegetationGenerateResponse | VegetationEncodeResponse;

export type VegetationWorkerResponse = VegetationWorkerSuccessResponse | { id: number; error: { name: string; message: string } };
