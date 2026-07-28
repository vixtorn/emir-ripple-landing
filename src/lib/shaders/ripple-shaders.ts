export const rippleVertexShader = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

export const rippleFragmentShader = /* glsl */ `
uniform sampler2D uBaseTexture;
uniform sampler2D uHelmetTexture;
uniform sampler2D uTrailTexture;
varying vec2 vUv;

void main() {
  vec4 base = texture2D(uBaseTexture, vUv);
  vec4 helmet = texture2D(uHelmetTexture, vUv);
  float trailMask = clamp(texture2D(uTrailTexture, vUv).r, 0.0, 1.0);
  gl_FragColor = mix(base, helmet, trailMask);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;
