import { describe, expect, it, vi } from 'vitest';
import { createColorUpdateScheduler } from '../../demo/colorUpdateScheduler';

describe( 'demo color update scheduler', () => {

	it( 'coalesces color changes until the next animation frame', () => {

		let applyFrame: FrameRequestCallback = () => {};
		const requestFrame = vi.fn( ( callback: FrameRequestCallback ) => {
			applyFrame = callback;
			return 1;
		} );
		vi.stubGlobal( 'requestAnimationFrame', requestFrame );
		const apply = vi.fn();
		const schedule = createColorUpdateScheduler( apply );

		schedule( 'leaf', '#b5361c' );
		schedule( 'bark', '#855537' );

		expect( requestFrame ).toHaveBeenCalledOnce();
		expect( apply ).not.toHaveBeenCalled();

		applyFrame( 0 );

		expect( apply ).toHaveBeenCalledOnce();
		expect( apply ).toHaveBeenCalledWith( { leaf: '#b5361c', bark: '#855537' } );

		vi.unstubAllGlobals();

	} );

} );
