import { FlowersMesh, generateFlowers, generateFlowersAsync } from '../meshes';
import type { FlowersMeshOptions } from '../meshes';
import { VegetationMesh } from '../VegetationMesh';
import type { FlowersVariety } from '../../core/generators/flowers';

export type FlowerMeshOptions = Omit<FlowersMeshOptions, 'variety'>;

export function generateFlower( variety: FlowersVariety, options: FlowerMeshOptions = {} ) {

	return generateFlowers( { ...options, variety } );

}

export function generateFlowerAsync( variety: FlowersVariety, options: FlowerMeshOptions = {} ) {

	return generateFlowersAsync( { ...options, variety } );

}

export function createFlowerLOD( variety: FlowersVariety, options: FlowerMeshOptions = {}, distances?: number[] ) {

	return FlowersMesh.createLOD( { ...options, variety }, distances );

}

export abstract class FlowerMesh extends VegetationMesh {

	protected constructor( variety: FlowersVariety, options: FlowerMeshOptions = {} ) {

		super( generateFlower( variety, options ), options.lod, true );

	}

}
