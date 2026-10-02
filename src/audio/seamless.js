/**
 * Seamless looping.
 *
 * An AudioBufferSourceNode with `loop = true` is sample-accurate, so there is
 * never a gap at the loop point. But if a recording's last sample doesn't line
 * up with its first, the wrap is still heard as a click or a jump in texture.
 *
 * The fix is to fold the tail of the sound into its head with an
 * equal-power cross-fade. The result is `fade` samples shorter than the source,
 * and its last sample flows straight into its first.
 *
 *   source:  [ head ........................ | tail ]
 *   result:  [ head×fadeIn + tail×fadeOut ... ]
 */

/**
 * @param {Float32Array} src  Mono channel data.
 * @param {number} fade       Cross-fade length in samples.
 * @returns {Float32Array}
 */
export function crossfadeLoop(src, fade) {
  fade = Math.min(Math.floor(fade), Math.floor(src.length / 3));
  if (fade < 2) return src;

  const length = src.length - fade;
  const out = src.slice(0, length);
  for (let i = 0; i < fade; i++) {
    const x = ((i + 0.5) / fade) * (Math.PI / 2);
    // Equal-power curves keep uncorrelated material (noise, rain, surf) at a
    // constant loudness through the fade.
    out[i] = src[i] * Math.sin(x) + src[length + i] * Math.cos(x);
  }
  return out;
}

/**
 * AudioBuffer version of {@link crossfadeLoop}. It processes every channel and
 * returns a new buffer.
 *
 * @param {BaseAudioContext} ctx
 * @param {AudioBuffer} buffer
 * @param {number} fadeSeconds
 */
export function makeSeamless(ctx, buffer, fadeSeconds = 1) {
  const fade = Math.floor(fadeSeconds * buffer.sampleRate);
  if (fade < 2 || buffer.length < fade * 3) return buffer;

  const out = ctx.createBuffer(buffer.numberOfChannels, buffer.length - fade, buffer.sampleRate);
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    out.getChannelData(c).set(crossfadeLoop(buffer.getChannelData(c), fade));
  }
  return out;
}
