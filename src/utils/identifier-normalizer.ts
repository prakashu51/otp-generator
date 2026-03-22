import type {
  IdentifierNormalizationConfig,
  OTPPayload,
} from "../core/otp.types.js";

const DEFAULT_IDENTIFIER_NORMALIZATION: Required<IdentifierNormalizationConfig> = {
  trim: true,
  lowercase: true,
  preserveCaseFor: ["sms", "token"],
};

export function normalizePayloadIdentifier(
  payload: OTPPayload,
  config?: IdentifierNormalizationConfig,
): OTPPayload {
  const resolvedConfig = resolveNormalizationConfig(config);
  let identifier = payload.identifier;

  if (resolvedConfig.trim) {
    identifier = identifier.trim();
  }

  const preserveCase = resolvedConfig.preserveCaseFor.includes(payload.type);

  if (resolvedConfig.lowercase && !preserveCase) {
    identifier = identifier.toLowerCase();
  }

  return {
    ...payload,
    identifier,
  };
}

function resolveNormalizationConfig(
  config?: IdentifierNormalizationConfig,
): Required<IdentifierNormalizationConfig> {
  return {
    ...DEFAULT_IDENTIFIER_NORMALIZATION,
    ...config,
    preserveCaseFor: config?.preserveCaseFor ?? DEFAULT_IDENTIFIER_NORMALIZATION.preserveCaseFor,
  };
}
