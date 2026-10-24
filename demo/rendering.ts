import {
	ACESFilmicToneMapping,
	Camera,
	Color,
	DirectionalLight,
	Fog,
	HemisphereLight,
	Mesh,
	MeshStandardMaterial,
	Object3D,
	PCFShadowMap,
	PlaneGeometry,
	Scene,
	SRGBColorSpace,
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

export function configurePreviewRenderer( renderer: PreviewRenderer ): void {

	renderer.outputColorSpace = SRGBColorSpace;
	renderer.toneMapping = ACESFilmicToneMapping;
	renderer.toneMappingExposure = 1.05;
	renderer.shadowMap.enabled = true;
	renderer.shadowMap.type = PCFShadowMap;

}

export function createPreviewScene(): {
	scene: Scene;
	ground: Mesh;
	hemisphere: HemisphereLight;
	sunlight: DirectionalLight;
} {

	const scene = new Scene();
	scene.background = new Color( '#c8e0e9' );
	scene.fog = new Fog( '#c8e0e9', 90, 190 );

	const ground = new Mesh(
		new PlaneGeometry( 200, 200 ),
		new MeshStandardMaterial( { color: '#708654', roughness: 1, metalness: 0 } ),
	);
	ground.rotation.x = - Math.PI / 2;
	ground.position.y = - 0.02;
	ground.receiveShadow = true;
	scene.add( ground );

	const hemisphere = new HemisphereLight( '#e7f5ff', '#637044', 1.8 );
	scene.add( hemisphere );

	const sunlight = new DirectionalLight( '#fff1d6', 3.2 );
	sunlight.position.set( - 12, 22, 12 );
	sunlight.castShadow = true;
	sunlight.shadow.mapSize.set( 2048, 2048 );
	sunlight.shadow.camera.left = - 42;
	sunlight.shadow.camera.right = 42;
	sunlight.shadow.camera.top = 42;
	sunlight.shadow.camera.bottom = - 42;
	sunlight.shadow.camera.near = 0.5;
	sunlight.shadow.camera.far = 90;
	sunlight.shadow.bias = - 0.00025;
	sunlight.shadow.normalBias = 0.025;
	sunlight.shadow.radius = 3;
	sunlight.shadow.autoUpdate = false;
	sunlight.shadow.needsUpdate = true;
	scene.add( sunlight );

	return { scene, ground, hemisphere, sunlight };

}

export function setPreviewShadowFlags( object: Object3D ): void {

	object.castShadow = true;
	object.receiveShadow = true;

}

