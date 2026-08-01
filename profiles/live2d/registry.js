/**
 * The canonical catalog of shipped Live2D model profiles.
 *
 * Adding a model is explicit: import its profile here.  The renderer never
 * discovers model directories, so a stray asset cannot become active by
 * accident.
 */
import { JELLYFISH_GIRL_PROFILE } from './jellyfish-girl/model-profile.js';
import { SHIZUKU_PROFILE } from './shizuku/model-profile.js';

const profiles = Object.freeze([
  JELLYFISH_GIRL_PROFILE,
  SHIZUKU_PROFILE,
]);

export const DEFAULT_PROFILE_ID = JELLYFISH_GIRL_PROFILE.id;

const profilesById = new Map(profiles.map((profile) => [profile.id, profile]));

export function listProfiles() {
  return profiles;
}

export function getProfile(profileId) {
  const profile = profilesById.get(profileId);
  if (!profile) throw new Error(`Unknown Live2D profile: ${profileId}`);
  return profile;
}
