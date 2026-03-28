import type {
  BuildOtpDeliveryPayloadOptions,
  BuildTokenDeliveryPayloadOptions,
  BuildVerificationLinkOptions,
  OTPDeliveryRequest,
} from "../core/otp.types.js";

export function buildVerificationLink(options: BuildVerificationLinkOptions): string {
  const {
    baseUrl,
    token,
    identifier,
    intent,
    type,
    paramNames,
    extraParams,
  } = options;

  if (!baseUrl?.trim()) {
    throw new TypeError("baseUrl is required.");
  }

  if (!token?.trim()) {
    throw new TypeError("token is required.");
  }

  if (!identifier?.trim()) {
    throw new TypeError("identifier is required.");
  }

  const url = new URL(baseUrl);
  const tokenParam = paramNames?.token ?? "token";
  const identifierParam = paramNames?.identifier ?? "identifier";
  const intentParam = paramNames?.intent ?? "intent";
  const typeParam = paramNames?.type ?? "type";

  url.searchParams.set(tokenParam, token);
  url.searchParams.set(identifierParam, identifier);

  if (intent?.trim()) {
    url.searchParams.set(intentParam, intent);
  }

  if (type?.trim()) {
    url.searchParams.set(typeParam, type);
  }

  if (extraParams) {
    for (const [key, value] of Object.entries(extraParams)) {
      if (value === undefined || value === null) {
        continue;
      }

      url.searchParams.set(key, String(value));
    }
  }

  return url.toString();
}

export function buildOtpDeliveryPayload(
  options: BuildOtpDeliveryPayloadOptions,
): OTPDeliveryRequest {
  return {
    credentialKind: "otp",
    type: options.type,
    identifier: options.identifier,
    intent: options.intent,
    otp: options.otp,
    expiresIn: options.expiresIn,
    metadata: options.metadata,
  };
}

export function buildTokenDeliveryPayload(
  options: BuildTokenDeliveryPayloadOptions,
): OTPDeliveryRequest {
  return {
    credentialKind: "token",
    type: options.type ?? "token",
    identifier: options.identifier,
    intent: options.intent,
    token: options.token,
    expiresIn: options.expiresIn,
    metadata: options.metadata,
    link: buildVerificationLink(options),
  };
}
