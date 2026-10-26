export function createColorUpdateScheduler( apply: ( colors: Record<string, string> ) => void ): ( part: string, color: string ) => void {

	let frameScheduled = false;
	let pendingColors: Record<string, string> = {};

	return ( part, color ) => {

		pendingColors[ part ] = color;

		if ( frameScheduled ) {
			return;
		}

		frameScheduled = true;
		requestAnimationFrame( () => {

			frameScheduled = false;
			const colors = pendingColors;
			pendingColors = {};
			apply( colors );

		} );

	};

}
