export class OTPError extends Error {
  public readonly code: string;

  constructor(message: string, code: string) {
    super(message);
    this.name = new.target.name;
    this.code = code;
  }
}

export class OTPRateLimitExceededError extends OTPError {
  constructor(message = "OTP request rate limit exceeded.") {
    super(message, "OTP_RATE_LIMIT_EXCEEDED");
  }
}

export class OTPExpiredError extends OTPError {
  constructor(message = "OTP has expired or does not exist.") {
    super(message, "OTP_EXPIRED");
  }
}

export class OTPInvalidError extends OTPError {
  constructor(message = "OTP is invalid.") {
    super(message, "OTP_INVALID");
  }
}

export class OTPMaxAttemptsExceededError extends OTPError {
  constructor(message = "Maximum OTP verification attempts exceeded.") {
    super(message, "OTP_MAX_ATTEMPTS_EXCEEDED");
  }
}

export class OTPResendCooldownError extends OTPError {
  constructor(message = "OTP resend cooldown is active.") {
    super(message, "OTP_RESEND_COOLDOWN");
  }
}
