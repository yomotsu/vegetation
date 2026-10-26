import type { MeshStandardMaterial, MeshStandardMaterialParameters } from 'three';

export type ImpostorMaterialFactory = ( parameters: MeshStandardMaterialParameters ) => MeshStandardMaterial;

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
