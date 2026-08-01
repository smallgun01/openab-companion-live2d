/**
 * Model-profile boundary for the Live2D runtime.
 *
 * A profile is declarative data.  Application modules must address semantic
 * bindings (for example `blink.left`), never Cubism parameter IDs directly.
 */

import {
  DEFAULT_PROFILE_ID,
  getProfile,
  listProfiles,
} from '../profiles/live2d/registry.js';
export { JELLYFISH_GIRL_PROFILE } from '../profiles/live2d/jellyfish-girl/model-profile.js';
export { DEFAULT_PROFILE_ID, listProfiles };

let activeProfile = getProfile(DEFAULT_PROFILE_ID);

export function getActiveProfile() {
  return activeProfile;
}

/**
 * Select the profile used by subsequent renderer initialization.
 *
 * This deliberately accepts only a registry ID. Unknown IDs throw instead of
 * silently selecting a different body, which would make configuration faults
 * look like a valid companion state.
 */
export function setActiveProfile(profileId) {
  activeProfile = getProfile(profileId);
  return activeProfile;
}

/** Return the expression catalog owned by the active model profile. */
export function getActiveExpressionProfile() {
  return activeProfile.expressions;
}

/**
 * Resolve a semantic expression key against the active profile's declared
 * capabilities. Profiles are the authority: a catalog entry alone must never
 * enable an expression the model did not explicitly advertise.
 */
export function resolveSupportedExpression(expressionKey) {
  const supported = activeProfile.capabilities?.expressions || [];
  const catalog = activeProfile.expressions?.catalog || {};
  return supported.includes(expressionKey) && catalog[expressionKey]
    ? expressionKey
    : 'neutral';
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
  if (!profile?.expressions?.catalog?.neutral) errors.push('neutral expression catalog is required');
  if (!Array.isArray(profile?.capabilities?.expressions) || !profile.capabilities.expressions.includes('neutral')) {
    errors.push('capabilities.expressions must include neutral');
  }
  for (const expression of profile?.capabilities?.expressions || []) {
    if (!profile?.expressions?.catalog?.[expression]) {
      errors.push(`capabilities.expressions declares missing catalog entry: ${expression}`);
    }
  }
  for (const [name, binding] of Object.entries(profile?.bindings || {})) {
    if (!binding?.id) errors.push(`${name}: Cubism parameter id is required`);
    if (!Array.isArray(binding?.range) || binding.range.length !== 2 || binding.range[0] > binding.range[1]) {
      errors.push(`${name}: range must be [min, max]`);
    }
  }
  return { valid: errors.length === 0, errors };
}
