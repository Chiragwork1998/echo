/**
 * Typed API errors that map to the standard `{ code, message, retryable,
 * requestId }` envelope. Keeping them out of the route handlers lets the
 * database layer signal domain conflicts without importing Fastify.
 */
export class ApiError extends Error {
  readonly statusCode: number;
  readonly code: string;
  readonly retryable: boolean;

  constructor(
    statusCode: number,
    code: string,
    message: string,
    retryable: boolean,
  ) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.code = code;
    this.retryable = retryable;
  }
}

export class IdempotencyKeyRequiredError extends ApiError {
  constructor() {
    super(
      400,
      'IDEMPOTENCY_KEY_REQUIRED',
      'The Idempotency-Key header is required.',
      false,
    );
  }
}

export class IdempotencyKeyInvalidError extends ApiError {
  constructor() {
    super(
      400,
      'IDEMPOTENCY_KEY_INVALID',
      'The Idempotency-Key header is invalid.',
      false,
    );
  }
}

export class IdempotencyKeyReusedError extends ApiError {
  constructor() {
    super(
      409,
      'IDEMPOTENCY_KEY_REUSED',
      'The Idempotency-Key was already used for a different request.',
      false,
    );
  }
}

export class IdempotencyInProgressError extends ApiError {
  constructor() {
    super(
      409,
      'IDEMPOTENCY_IN_PROGRESS',
      'A request with this Idempotency-Key is still processing.',
      true,
    );
  }
}

export class DeviceConflictError extends ApiError {
  constructor() {
    super(
      409,
      'DEVICE_CONFLICT',
      'The device identifier is not available.',
      false,
    );
  }
}

export class InvalidPublicKeyError extends ApiError {
  constructor() {
    super(
      400,
      'INVALID_PUBLIC_KEY',
      'The device public key is invalid.',
      false,
    );
  }
}

export class DeviceStoreUnavailableError extends ApiError {
  constructor() {
    super(
      503,
      'DEVICE_STORE_UNAVAILABLE',
      'Device management is unavailable.',
      true,
    );
  }
}
