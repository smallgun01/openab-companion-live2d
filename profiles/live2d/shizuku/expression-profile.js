/**
 * Shizuku has no native .exp3.json catalog in the official runtime bundle.
 *
 * P2b-1 therefore makes the downgrade explicit: tagged emotions resolve to
 * neutral until a model-specific artistic recipe or native expression is
 * deliberately calibrated and added.
 */
export const EMOTION_MAP = Object.freeze({
  neutral: Object.freeze({
    static: Object.freeze({
      PARAM_MOUTH_OPEN_Y: 0,
      PARAM_MOUTH_FORM: 0,
    }),
  }),
});

export const NEUTRAL_BASELINE = EMOTION_MAP.neutral.static;
