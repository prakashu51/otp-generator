import type { OTPChannel } from "../core/otp.types.js";

export interface VerificationLinkParamNames {
  token?: string;
  identifier?: string;
  intent?: string;
  type?: string;
}

export interface BuildVerificationLinkOptions {
  baseUrl: string;
  token: string;
  identifier: string;
  intent?: string;
  type?: OTPChannel;
  paramNames?: VerificationLinkParamNames;
  extraParams?: Record<string, string | number | boolean | null | undefined>;
}

export interface BuildTokenDeliveryPayloadOptions extends BuildVerificationLinkOptions {
  expiresIn: number;
}

export interface TokenDeliveryPayload {
  type?: OTPChannel;
  identifier: string;
  intent?: string;
  token: string;
  expiresIn: number;
  link: string;
}

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

export function buildTokenDeliveryPayload(
  options: BuildTokenDeliveryPayloadOptions,
): TokenDeliveryPayload {
  return {
    type: options.type,
    identifier: options.identifier,
    intent: options.intent,
    token: options.token,
    expiresIn: options.expiresIn,
    link: buildVerificationLink(options),
  };
}
