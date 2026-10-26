import type { Material, MeshPhysicalMaterialParameters, MeshStandardMaterial, MeshStandardMaterialParameters } from 'three';

export type ImpostorMaterialParameters = MeshStandardMaterialParameters & Pick<MeshPhysicalMaterialParameters, 'specularIntensity' | 'ior'>;

export type VegetationMaterial = Material & Pick<MeshStandardMaterial,
	'color' | 'map' | 'normalMap' | 'roughness' | 'metalness' | 'emissive' | 'emissiveIntensity' | 'alphaTest' | 'alphaToCoverage' | 'transparent' | 'vertexColors' | 'flatShading' | 'side' | 'wireframe'
>;

export type ImpostorMaterialFactory = ( parameters: ImpostorMaterialParameters ) => VegetationMaterial;

let impostorMaterialFactory: ImpostorMaterialFactory | null = null;

export function registerImpostorMaterialFactory( factory: ImpostorMaterialFactory ): () => void {

	const previousFactory = impostorMaterialFactory;
	impostorMaterialFactory = factory;

	return () => {

		if ( impostorMaterialFactory === factory ) {

			impostorMaterialFactory = previousFactory;

		}

	};

}

export function getImpostorMaterialFactory(): ImpostorMaterialFactory | null {

	return impostorMaterialFactory;

}
