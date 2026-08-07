/**
 * Shizuku has no native .exp3.json catalog in the official runtime bundle.
 * These are deliberately conservative parameter recipes derived from the
 * model's DisplayInfo and shipped motion curves. They remain candidates until
 * the human visual calibration gate accepts each semantic state.
 */
export const NEUTRAL_BASELINE = Object.freeze({
  PARAM_EYE_L_OPEN: 1,
  PARAM_EYE_R_OPEN: 1,
  PARAM_EYE_BALL_X: 0,
  PARAM_EYE_BALL_Y: 0,
  PARAM_BROW_L_Y: 0,
  PARAM_BROW_R_Y: 0,
  PARAM_BROW_L_ANGLE: 0,
  PARAM_BROW_R_ANGLE: 0,
  PARAM_BROW_L_FORM: 0,
  PARAM_BROW_R_FORM: 0,
  PARAM_MOUTH_OPEN_Y: 0,
  PARAM_MOUTH_FORM: 0,
  PARAM_TERE: 0,
  PARAM_ANGLE_X: 0,
  PARAM_ANGLE_Y: 0,
  PARAM_ANGLE_Z: 0,
  PARAM_BODY_X: 0,
  PARAM_BODY_Y: 0,
  PARAM_BODY_Z: 0,
  // Rest-pose calibration. Human visual review accepted the primary right-arm
  // control at -1: it lowers the hand without disturbing the supported
  // expression catalog. Keep this model rigging data out of shared runtime.
  PARAM_ARM_R: -1,
  PARAM_ARM_02_L_01: -0.25,
  PARAM_ARM_02_L_02: -1,
  PARAM_HAND_02_L: -1,
  PARAM_ARM_02_R_01: -1,
  PARAM_ARM_02_R_02: -1,
  PARAM_HAND_02_R: -1,
});

export const EMOTION_MAP = Object.freeze({
  neutral: Object.freeze({ static: Object.freeze({}) }),
  joy: Object.freeze({
    static: Object.freeze({
      PARAM_EYE_L_OPEN: 1.15, PARAM_EYE_R_OPEN: 1.15,
      PARAM_BROW_L_Y: 0.15, PARAM_BROW_R_Y: 0.15,
      PARAM_MOUTH_FORM: 0.65, PARAM_MOUTH_OPEN_Y: 0.15, PARAM_TERE: 0.55,
      PARAM_BODY_Y: 1.5,
    }),
  }),
  sadness: Object.freeze({
    static: Object.freeze({
      PARAM_EYE_L_OPEN: 0.58, PARAM_EYE_R_OPEN: 0.58,
      PARAM_BROW_L_Y: 0.22, PARAM_BROW_R_Y: 0.22,
      PARAM_BROW_L_ANGLE: -0.35, PARAM_BROW_R_ANGLE: -0.35,
      PARAM_BROW_L_FORM: -0.2, PARAM_BROW_R_FORM: -0.2,
      PARAM_MOUTH_FORM: -0.7, PARAM_ANGLE_Y: -4, PARAM_BODY_Y: -2,
    }),
  }),
  anger: Object.freeze({
    static: Object.freeze({
      PARAM_EYE_L_OPEN: 0.65, PARAM_EYE_R_OPEN: 0.65,
      PARAM_BROW_L_Y: -0.35, PARAM_BROW_R_Y: -0.35,
      PARAM_BROW_L_ANGLE: -0.7, PARAM_BROW_R_ANGLE: -0.7,
      PARAM_BROW_L_FORM: -0.8, PARAM_BROW_R_FORM: -0.8,
      PARAM_MOUTH_FORM: -0.5, PARAM_MOUTH_OPEN_Y: 0.12,
      PARAM_ANGLE_Y: -3, PARAM_BODY_Y: 2,
    }),
  }),
  surprise: Object.freeze({
    static: Object.freeze({
      PARAM_EYE_L_OPEN: 1.35, PARAM_EYE_R_OPEN: 1.35,
      PARAM_BROW_L_Y: 0.6, PARAM_BROW_R_Y: 0.6,
      PARAM_BROW_L_ANGLE: 0.2, PARAM_BROW_R_ANGLE: 0.2,
      PARAM_MOUTH_OPEN_Y: 0.72, PARAM_MOUTH_FORM: 0, PARAM_BODY_Y: -2,
    }),
  }),
  fear: Object.freeze({
    static: Object.freeze({
      PARAM_EYE_L_OPEN: 1.22, PARAM_EYE_R_OPEN: 1.22,
      PARAM_BROW_L_Y: 0.42, PARAM_BROW_R_Y: 0.42,
      PARAM_BROW_L_ANGLE: -0.2, PARAM_BROW_R_ANGLE: -0.2,
      PARAM_BROW_L_FORM: 0.45, PARAM_BROW_R_FORM: 0.45,
      PARAM_MOUTH_OPEN_Y: 0.3, PARAM_MOUTH_FORM: -0.28, PARAM_BODY_Y: -3,
    }),
  }),
  disgust: Object.freeze({
    static: Object.freeze({
      PARAM_EYE_L_OPEN: 0.5, PARAM_EYE_R_OPEN: 0.5,
      PARAM_BROW_L_Y: -0.45, PARAM_BROW_R_Y: -0.45,
      PARAM_BROW_L_ANGLE: -0.4, PARAM_BROW_R_ANGLE: -0.4,
      PARAM_BROW_L_FORM: -0.65, PARAM_BROW_R_FORM: -0.65,
      PARAM_MOUTH_FORM: -0.65, PARAM_MOUTH_OPEN_Y: 0.08, PARAM_ANGLE_Z: 6,
    }),
  }),
  smirk: Object.freeze({
    static: Object.freeze({
      PARAM_EYE_L_OPEN: 0.82, PARAM_EYE_R_OPEN: 0.9,
      PARAM_BROW_L_Y: 0.3, PARAM_BROW_R_Y: 0,
      PARAM_MOUTH_FORM: 0.45, PARAM_ANGLE_Z: -5, PARAM_BODY_X: 2,
    }),
  }),
  // A local UI state, not a Jellii-emitted tag. It must be calibrated with
  // the same model-specific discipline because the app invokes it directly.
  thinking: Object.freeze({
    static: Object.freeze({
      PARAM_EYE_L_OPEN: 0.85, PARAM_EYE_R_OPEN: 0.85,
      PARAM_EYE_BALL_X: 0.3, PARAM_EYE_BALL_Y: 0.25,
      PARAM_BROW_L_Y: 0.15, PARAM_BROW_R_Y: 0.28,
      PARAM_MOUTH_FORM: 0.1, PARAM_MOUTH_OPEN_Y: 0.05, PARAM_ANGLE_Z: -2,
    }),
  }),
});
