// Small helpers for changing three.js's built-in shaders without replacing them.

/**
 * Adds a shader change to a material on top of any it already has, and keeps three.js's program cache apart for it.
 * @template {import('three').Material} M
 * @param {M} material
 * @param {string} key unique per kind of change (goes into the program cache key)
 * @param {(shader: any, renderer: any) => void} fn changes shader.vertexShader / fragmentShader / uniforms
 * @returns {M}
 */
export function patchShader(material, key, fn) {
  const before = material.onBeforeCompile,
    keyFn = material.customProgramCacheKey;
  material.onBeforeCompile = function (shader, renderer) {
    if (before) before.call(this, shader, renderer);
    fn(shader, renderer);
  };
  material.customProgramCacheKey = function () {
    return (keyFn ? keyFn.call(this) : '') + '|' + key;
  };
  material.needsUpdate = true;
  return material;
}

/**
 * Inserts code right after `#include <include>` in a shader source. Warns and leaves the source as it is if the
 * include is missing (three.js changed its chunks).
 * @param {string} src
 * @param {string} include chunk name, e.g. 'normal_fragment_maps'
 * @param {string} code
 * @param {string} [owner] who asks, for the warning
 */
export function insertAfterInclude(src, include, code, owner = 'shader patch') {
  const tag = `#include <${include}>`;
  if (!src.includes(tag)) {
    console.warn(`${owner}: no ${tag} in this shader`);
    return src;
  }
  return src.replace(tag, tag + '\n' + code);
}
