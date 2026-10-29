import { hexToLinear } from '../../src/core/color';
import { bakeImpostor, LOD4_IMPOSTOR_VIEWS } from '../../src/core/impostor';
import type { VegetationData } from '../../src/core/types';

export function topCardCoverageIou( data: VegetationData, size = 64 ): number {

	const colors = data.parts.map( ( part ) => hexToLinear( part.defaultColor ) );
	const topView = [ LOD4_IMPOSTOR_VIEWS[ 1 ]! ];
	const reference = bakeImpostor( data, colors, size, topView );
	const atlas = bakeImpostor( data, colors, size, LOD4_IMPOSTOR_VIEWS );
	const billboardData: VegetationData = {
		...data,
		lods: [ data.lods[ 4 ]!, ...data.lods.slice( 1 ) ],
		textures: { ...data.textures, impostor: atlas },
	};
	const candidate = bakeImpostor( billboardData, colors, size, topView );
	let intersection = 0;
	let union = 0;

	for ( let y = 0; y < size; y ++ ) {

		for ( let x = 0; x < size; x ++ ) {

			const referenceOpaque = reference.data[ ( y * size + x ) * 4 + 3 ]! >= 128;
			const candidateOpaque = candidate.data[ ( y * size + x ) * 4 + 3 ]! >= 128;

			if ( referenceOpaque && candidateOpaque ) {

				intersection ++;

			}
			if ( referenceOpaque || candidateOpaque ) {

				union ++;

			}

		}

	}

	return union === 0 ? 1 : intersection / union;

}
