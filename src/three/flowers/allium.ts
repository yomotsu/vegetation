import { createFlowerLOD, FlowerMesh, generateFlower, generateFlowerAsync } from './common';
import type { FlowerMeshOptions } from './common';

export type AlliumMeshOptions = FlowerMeshOptions;

export function generateAllium( options: AlliumMeshOptions = {} ) {

	return generateFlower( 'allium', options );

}

export function generateAlliumAsync( options: AlliumMeshOptions = {} ) {

	return generateFlowerAsync( 'allium', options );

}

export class AlliumMesh extends FlowerMesh {

	constructor( options: AlliumMeshOptions = {} ) {

		super( 'allium', options );

	}

	static createLOD( options: AlliumMeshOptions = {}, distances?: number[] ) {

		return createFlowerLOD( 'allium', options, distances );

	}

}
