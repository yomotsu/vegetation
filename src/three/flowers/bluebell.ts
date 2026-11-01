import { createFlowerLOD, FlowerMesh, generateFlower, generateFlowerAsync } from './common';
import type { FlowerMeshOptions } from './common';

export type BluebellMeshOptions = FlowerMeshOptions;

export function generateBluebell( options: BluebellMeshOptions = {} ) {

	return generateFlower( 'bluebell', options );

}

export function generateBluebellAsync( options: BluebellMeshOptions = {} ) {

	return generateFlowerAsync( 'bluebell', options );

}

export class BluebellMesh extends FlowerMesh {

	constructor( options: BluebellMeshOptions = {} ) {

		super( 'bluebell', options );

	}

	static createLOD( options: BluebellMeshOptions = {}, distances?: number[] ) {

		return createFlowerLOD( 'bluebell', options, distances );

	}

}
