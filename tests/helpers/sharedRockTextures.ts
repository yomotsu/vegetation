import { vi } from 'vitest';
import * as rockTextureModule from '../../src/core/rockTexture';

export function withSharedRockTextures<T>( run: () => T ): T {

	const textures = rockTextureModule.createRockTextures( 1 );
	const spy = vi.spyOn( rockTextureModule, 'createRockTextures' ).mockReturnValue( textures );

	try {

		return run();

	} finally {

		spy.mockRestore();

	}

}
