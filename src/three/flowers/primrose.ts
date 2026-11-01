import { createFlowerLOD, FlowerMesh, generateFlower, generateFlowerAsync } from './common';
import type { FlowerMeshOptions } from './common';

export type PrimroseMeshOptions = FlowerMeshOptions;

export function generatePrimrose( options: PrimroseMeshOptions = {} ) {

	return generateFlower( 'primrose', options );

}

export function generatePrimroseAsync( options: PrimroseMeshOptions = {} ) {

	return generateFlowerAsync( 'primrose', options );

}

export class PrimroseMesh extends FlowerMesh {

	constructor( options: PrimroseMeshOptions = {} ) {

		super( 'primrose', options );

	}

	static createLOD( options: PrimroseMeshOptions = {}, distances?: number[] ) {

		return createFlowerLOD( 'primrose', options, distances );

	}

}
