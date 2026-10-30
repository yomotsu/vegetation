declare module 'three/examples/jsm/libs/ktx-parse.module.js' {
	export interface KTX2Level {
		levelData: Uint8Array;
		uncompressedByteLength: number;
	}

	export interface KTX2Sample {
		bitOffset: number;
		bitLength: number;
		channelType: number;
	}

	export interface KTX2DataFormatDescriptor {
		colorModel: number;
		colorPrimaries: number;
		transferFunction: number;
		samples: KTX2Sample[];
	}

	export interface KTX2Container {
		vkFormat: number;
		supercompressionScheme: number;
		levels: KTX2Level[];
		dataFormatDescriptor: KTX2DataFormatDescriptor[];
	}

	export function read( data: Uint8Array ): KTX2Container;
}
