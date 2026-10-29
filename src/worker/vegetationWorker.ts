import { generatePebblesData } from '../core/generators/pebbles';
import type { PebblesOptions } from '../core/generators/pebbles';
import { generateRockData } from '../core/generators/rock';
import type { RockOptions } from '../core/generators/rock';
import { generateTreeData } from '../core/generators/tree';
import type { TreeOptions } from '../core/generators/tree';
import { prepareVegetationAsset } from '../core/vegetationAssetPreparation';
import type { PreparedVegetationAsset } from '../core/vegetationAssetPreparation';
import { normalizePebblesGenerationOptions, normalizeRockGenerationOptions, normalizeTreeGenerationOptions } from '../core/vegetationGeneration';
import { generateGrassData } from '../core/generators/grass';
import type { GrassOptions } from '../core/generators/grass';
import { normalizeGrassGenerationOptions } from '../core/vegetationGeneration';
import type { VegetationWorkerRequest, VegetationWorkerResponse } from './protocol';

export function handleVegetationWorkerMessage( request: VegetationWorkerRequest ): VegetationWorkerResponse {

	try {

		if ( request.kind === 'tree' ) {

			const normalized = normalizeTreeGenerationOptions( request.options as TreeOptions, request.colors );
			const data = generateTreeData( normalized.options );
			return { id: request.id, prepared: prepareVegetationAsset( data, normalized.colors, request.impostorSize ) };

		}

		if ( request.kind === 'rock' ) {

			const normalized = normalizeRockGenerationOptions( request.options as RockOptions, request.colors );
			const data = generateRockData( normalized.options );
			return { id: request.id, prepared: prepareVegetationAsset( data, normalized.colors, request.impostorSize ) };

		}

		if ( request.kind === 'grass' ) {

			const normalized = normalizeGrassGenerationOptions( request.options as GrassOptions, request.colors );
			const data = generateGrassData( normalized.options );
			return { id: request.id, prepared: prepareVegetationAsset( data, normalized.colors, request.impostorSize ) };

		}

		const normalized = normalizePebblesGenerationOptions( request.options as PebblesOptions, request.colors );
		const data = generatePebblesData( normalized.options );
		return { id: request.id, prepared: prepareVegetationAsset( data, normalized.colors, request.impostorSize ) };

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

		const response = handleVegetationWorkerMessage( event.data );
		scope.postMessage( response, 'prepared' in response ? getPreparedTransferables( response.prepared ) : [] );

	} );

}
