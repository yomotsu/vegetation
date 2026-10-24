import {
	ACESFilmicToneMapping,
	Camera,
	PCFShadowMap,
	Scene,
	SRGBColorSpace,
	WebGLRenderer,
} from 'three';

export interface PreviewRenderer {
	domElement: HTMLCanvasElement;
	outputColorSpace: string;
	toneMapping: number;
	toneMappingExposure: number;
	shadowMap: { enabled: boolean; type: number };
	setPixelRatio: ( value: number ) => void;
	setSize: ( width: number, height: number, updateStyle?: boolean ) => void;
	render: ( scene: Scene, camera: Camera ) => void;
}

export function createRenderer(): PreviewRenderer {

	const renderer = new WebGLRenderer( { antialias: true } );
	renderer.outputColorSpace = SRGBColorSpace;
	renderer.toneMapping = ACESFilmicToneMapping;
	renderer.toneMappingExposure = 1.05;
	renderer.shadowMap.enabled = true;
	renderer.shadowMap.type = PCFShadowMap;

	return renderer;

}
