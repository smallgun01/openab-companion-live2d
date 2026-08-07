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

/** Whether the active profile advertises an operational (not merely rigged) capability. */
export function supportsCapability(name) {
  return activeProfile.capabilities?.[name] === true;
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
  const allowedEngineOptions = new Set(['idleMotionGroup', 'breathDepth']);
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
  for (const [name, motion] of Object.entries(profile?.nativeMotions || {})) {
    if (!motion?.group) errors.push(`nativeMotions.${name} requires a motion group`);
    if (!Number.isInteger(motion?.index) || motion.index < 0) {
      errors.push(`nativeMotions.${name} requires a non-negative integer index`);
    }
    if (typeof motion?.loop !== 'boolean') errors.push(`nativeMotions.${name} requires a boolean loop policy`);
    if ('autoplay' in motion && typeof motion.autoplay !== 'boolean') {
      errors.push(`nativeMotions.${name} autoplay must be a boolean when declared`);
    }
  }
  if ('parameter' in (profile?.idle || {}) && typeof profile.idle.parameter !== 'boolean') {
    errors.push('idle.parameter must be a boolean when declared');
  }
  if ('partOpacity' in (profile?.idle || {})) {
    if (!profile.idle.partOpacity || typeof profile.idle.partOpacity !== 'object' || Array.isArray(profile.idle.partOpacity)) {
      errors.push('idle.partOpacity must be an object when declared');
    } else {
      for (const [partId, opacity] of Object.entries(profile.idle.partOpacity)) {
        if (!partId || typeof opacity !== 'number' || opacity < 0 || opacity > 1) {
          errors.push('idle.partOpacity entries require a non-empty part ID and opacity from 0 to 1');
        }
      }
    }
  }
  if ('idleMotionGroup' in (profile?.engineOptions || {})
    && (typeof profile.engineOptions.idleMotionGroup !== 'string' || !profile.engineOptions.idleMotionGroup)) {
    errors.push('engineOptions.idleMotionGroup must be a non-empty string when declared');
  }
  if ('breathDepth' in (profile?.engineOptions || {})
    && (typeof profile.engineOptions.breathDepth !== 'number'
      || profile.engineOptions.breathDepth < 0 || profile.engineOptions.breathDepth > 1)) {
    errors.push('engineOptions.breathDepth must be a number from 0 to 1 when declared');
  }
  for (const key of Object.keys(profile?.engineOptions || {})) {
    if (!allowedEngineOptions.has(key)) errors.push(`engineOptions.${key} is not supported by this adapter`);
  }
  for (const [name, binding] of Object.entries(profile?.bindings || {})) {
    if (!binding?.id) errors.push(`${name}: Cubism parameter id is required`);
    if (!Array.isArray(binding?.range) || binding.range.length !== 2 || binding.range[0] > binding.range[1]) {
      errors.push(`${name}: range must be [min, max]`);
    }
  }
  return { valid: errors.length === 0, errors };
}
