/**
 * Model-profile boundary for the Live2D runtime.
 *
 * A profile is declarative data.  Application modules must address semantic
 * bindings (for example `blink.left`), never Cubism parameter IDs directly.
 */

import { JELLYFISH_GIRL_PROFILE } from '../profiles/live2d/jellyfish-girl/model-profile.js';
export { JELLYFISH_GIRL_PROFILE };

let activeProfile = JELLYFISH_GIRL_PROFILE;

export function getActiveProfile() {
  return activeProfile;
}

export function getBinding(name) {
  return activeProfile.bindings[name] || null;
}

export function requireBinding(name) {
  const binding = getBinding(name);
  if (!binding) throw new Error(`Active Live2D profile lacks required binding: ${name}`);
  return binding;
}

/**
 * Returns a deterministic, machine-readable result.  This is intentionally
 * structural validation only; artistic calibration remains a human decision.
 */
export function validateProfile(profile = activeProfile) {
  const errors = [];
  if (!profile || profile.schemaVersion !== 1) errors.push('schemaVersion must be 1');
  if (!profile?.id) errors.push('profile id is required');
  if (!profile?.assets?.model) errors.push('assets.model is required');
  for (const [name, binding] of Object.entries(profile?.bindings || {})) {
    if (!binding?.id) errors.push(`${name}: Cubism parameter id is required`);
    if (!Array.isArray(binding?.range) || binding.range.length !== 2 || binding.range[0] > binding.range[1]) {
      errors.push(`${name}: range must be [min, max]`);
    }
  }
  return { valid: errors.length === 0, errors };
}
