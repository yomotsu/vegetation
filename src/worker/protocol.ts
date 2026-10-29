import type { PreparedVegetationAsset } from '../core/vegetationAssetPreparation';

export type VegetationWorkerKind = 'tree' | 'rock' | 'pebbles';

export interface VegetationWorkerRequest {
	id: number;
	kind: VegetationWorkerKind;
	options: Record<string, number | boolean>;
	colors: Record<string, number>;
	impostorSize: number;
}

export type VegetationWorkerResponse =
	| { id: number; prepared: PreparedVegetationAsset }
	| { id: number; error: { name: string; message: string } };
