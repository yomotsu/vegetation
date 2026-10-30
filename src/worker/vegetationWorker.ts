import type { PebblesOptions } from '../core/generators/pebbles';
import type { RockOptions } from '../core/generators/rock';
import type { TreeOptions } from '../core/generators/tree';
import { prepareVegetationAsset } from '../core/vegetationAssetPreparation';
import type { PreparedVegetationAsset } from '../core/vegetationAssetPreparation';
import type { GrassOptions } from '../core/generators/grass';
import type { FlowersOptions } from '../core/generators/flowers';
import type { BroadleafTreeOptions } from '../core/trees/broadleaf';
import type { WillowTreeOptions } from '../core/trees/willow';
import type { PineTreeOptions } from '../core/trees/pine';
import type { BushOptions } from '../core/trees/bush';
import type { VegetationData } from '../core/types';
import type { NormalizedVegetationGeneration } from '../core/generationOptions';
import { encodeUastcTexture } from '../core/uastc';
import { writeUastcKtx2 } from '../core/ktx2';
import type { VegetationWorkerKind, VegetationWorkerRequest, VegetationWorkerResponse } from './protocol';

interface WorkerGenerator {
	normalize: ( options: Record<string, number | boolean | string>, colors: Record<string, number> ) => NormalizedVegetationGeneration<unknown>;
	generate: ( options: unknown ) => VegetationData;
}

function createWorkerGenerator<Options>(
	generate: ( options: Options ) => VegetationData,
	normalize: ( options: Options, colors: Record<string, number> ) => NormalizedVegetationGeneration<Options>,
): WorkerGenerator {

	return {
		normalize: ( options, colors ) => normalize( options as unknown as Options, colors ),
		generate: ( options ) => generate( options as Options ),
	};

}

const generatorLoaders: Record<VegetationWorkerKind, () => Promise<WorkerGenerator>> = {
	tree: async () => {
		const [ generator, options ] = await Promise.all( [ import( '../core/generators/tree' ), import( '../core/generationOptions/tree' ) ] );
		return createWorkerGenerator<TreeOptions>( generator.generateTreeData, options.normalizeTreeGenerationOptions );
	},
	'broadleaf-tree': async () => {
		const generator = await import( '../core/trees/broadleaf' );
		return createWorkerGenerator<BroadleafTreeOptions>( generator.generateBroadleafTreeData, generator.normalizeBroadleafTreeGenerationOptions );
	},
	'willow-tree': async () => {
		const generator = await import( '../core/trees/willow' );
		return createWorkerGenerator<WillowTreeOptions>( generator.generateWillowTreeData, generator.normalizeWillowTreeGenerationOptions );
	},
	'pine-tree': async () => {
		const generator = await import( '../core/trees/pine' );
		return createWorkerGenerator<PineTreeOptions>( generator.generatePineTreeData, generator.normalizePineTreeGenerationOptions );
	},
	bush: async () => {
		const generator = await import( '../core/trees/bush' );
		return createWorkerGenerator<BushOptions>( generator.generateBushData, generator.normalizeBushGenerationOptions );
	},
	rock: async () => {
		const [ generator, options ] = await Promise.all( [ import( '../core/generators/rock' ), import( '../core/generationOptions/rock' ) ] );
		return createWorkerGenerator<RockOptions>( generator.generateRockData, options.normalizeRockGenerationOptions );
	},
	pebbles: async () => {
		const [ generator, options ] = await Promise.all( [ import( '../core/generators/pebbles' ), import( '../core/generationOptions/pebbles' ) ] );
		return createWorkerGenerator<PebblesOptions>( generator.generatePebblesData, options.normalizePebblesGenerationOptions );
	},
	grass: async () => {
		const [ generator, options ] = await Promise.all( [ import( '../core/generators/grass' ), import( '../core/generationOptions/grass' ) ] );
		return createWorkerGenerator<GrassOptions>( generator.generateGrassData, options.normalizeGrassGenerationOptions );
	},
	flowers: async () => {
		const [ generator, options ] = await Promise.all( [ import( '../core/generators/flowers' ), import( '../core/generationOptions/flowers' ) ] );
		return createWorkerGenerator<FlowersOptions>( generator.generateFlowersData, options.normalizeFlowersGenerationOptions );
	},
};

export async function handleVegetationWorkerMessage( request: VegetationWorkerRequest ): Promise<VegetationWorkerResponse> {

	try {

		if ( request.task === 'encode' ) {

			const start = performance.now();
			const encoded = encodeUastcTexture( request.texture, request.options );
			const buffer = writeUastcKtx2( encoded );
			return { id: request.id, task: 'encode', buffer, encodeTimeMs: performance.now() - start };

		}

		const generator = await generatorLoaders[ request.kind ]();
		const normalized = generator.normalize( request.options, request.colors );
		const data = generator.generate( normalized.options );
		return { id: request.id, task: 'generate', prepared: prepareVegetationAsset( data, normalized.colors, request.impostorSize ) };

	} catch ( error ) {

		const typedError = error instanceof Error ? error : new Error( String( error ) );
		return { id: request.id, error: { name: typedError.name, message: typedError.message } };

	}

}

export function getPreparedTransferables( prepared: PreparedVegetationAsset ): Transferable[] {

	const transferables = new Set<ArrayBuffer>();
	const visited = new Set<object>();

	function collect( value: unknown ): void {

		if ( value === null || typeof value !== 'object' ) return;
		if ( value instanceof ArrayBuffer ) {
			transferables.add( value );
			return;
		}
		if ( ArrayBuffer.isView( value ) ) {
			if ( value.buffer instanceof ArrayBuffer ) transferables.add( value.buffer );
			return;
		}
		if ( visited.has( value ) ) return;
		visited.add( value );

		for ( const nested of Object.values( value ) ) collect( nested );

	}

	collect( prepared );
	return [ ...transferables ];

}

interface WorkerScope {
	addEventListener: ( type: 'message', listener: ( event: MessageEvent<VegetationWorkerRequest> ) => void ) => void;
	postMessage: ( message: VegetationWorkerResponse, transfer: Transferable[] ) => void;
}

const workerCandidate = globalThis as unknown as Partial<WorkerScope> & { document?: unknown };

if ( workerCandidate.document === undefined && typeof workerCandidate.addEventListener === 'function' && typeof workerCandidate.postMessage === 'function' ) {

	const scope = workerCandidate as WorkerScope;
	scope.addEventListener( 'message', ( event ) => {

		void handleVegetationWorkerMessage( event.data ).then( ( response ) => {
			if ( 'error' in response ) {
				scope.postMessage( response, [] );
			} else if ( response.task === 'encode' ) {
				scope.postMessage( response, [ response.buffer ] );
			} else {
				scope.postMessage( response, getPreparedTransferables( response.prepared ) );
			}
		} );

	} );

}
