import type { Material } from 'three';

interface MaterialState {
	transparent: boolean;
	opacity: number;
	depthWrite: boolean;
	alphaTest: number;
	needsUpdate: boolean | undefined;
}

export interface ColliderMaterialController {
	show: ( materials: Iterable<Material>, opacity: number ) => void;
	restore: () => void;
}

export function createColliderMaterialController(): ColliderMaterialController {

	const previous = new Map<Material, MaterialState>();

	function show( materials: Iterable<Material>, opacity: number ): void {

		for ( const material of new Set( materials ) ) {

			if ( ! previous.has( material ) ) {

				previous.set( material, {
					transparent: material.transparent,
					opacity: material.opacity,
					depthWrite: material.depthWrite,
					alphaTest: material.alphaTest,
					needsUpdate: Reflect.get( material, 'needsUpdate' ) as boolean | undefined,
				} );

			}

			const state = previous.get( material )!;
			if ( state.alphaTest > 0 && state.opacity > 0 ) {

				// 不透明度を下げても葉の元の切り抜き形状を保ちます。
				material.alphaTest = state.alphaTest * opacity / state.opacity;

			}

			material.transparent = true;
			material.opacity = opacity;
			material.depthWrite = false;
			material.needsUpdate = true;

		}

	}

	function restore(): void {

		for ( const [ material, state ] of previous ) {

			material.transparent = state.transparent;
			material.opacity = state.opacity;
			material.depthWrite = state.depthWrite;
			material.alphaTest = state.alphaTest;
			Reflect.set( material, 'needsUpdate', state.needsUpdate );
			material.needsUpdate = true;

		}

		previous.clear();

	}

	return { show, restore };

}
