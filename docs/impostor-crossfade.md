# Impostor card crossfade

LOD4 impostors use a vertical yaw-facing card for side views and a horizontal footprint card for top views. The material fades between them with a stable screen-space dither and alpha test, so both cards stay in the opaque pass.

The default `vegetation` entry installs the WebGL `onBeforeCompile` shader. For `WebGPURenderer`, import `vegetation/webgpu` once before creating vegetation assets to register the TSL material factory. If that entry is not imported, LOD4 still renders with the standard material and both cards remain visible without view-angle fading.

The top card does not cast shadows. Vertical cards cast shadows in both LOD3 and LOD4, avoiding a horizontal sheet shadow when the camera looks down.
