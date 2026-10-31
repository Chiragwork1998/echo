import { Type, type Static } from '@sinclair/typebox';

export const ErrorEnvelopeSchema = Type.Object(
  {
    code: Type.String(),
    message: Type.String(),
    retryable: Type.Boolean(),
    requestId: Type.String({ format: 'uuid' }),
  },
  { additionalProperties: false, $id: 'ErrorEnvelope' },
);

export type ErrorEnvelope = Static<typeof ErrorEnvelopeSchema>;

export const HealthResponseSchema = Type.Object(
  {
    status: Type.Union([Type.Literal('ok'), Type.Literal('degraded')]),
    version: Type.String(),
    dependencies: Type.Object(
      {
        database: Type.Union([Type.Literal('ok'), Type.Literal('unavailable')]),
      },
      { additionalProperties: false },
    ),
  },
  { additionalProperties: false, $id: 'HealthResponse' },
);

export const ConfigurationResponseSchema = Type.Object(
  {
    minimumSupportedClientVersion: Type.String(),
    policyVersions: Type.Object(
      {
        privacy: Type.String(),
        terms: Type.String(),
      },
      { additionalProperties: false },
    ),
    reflectionAvailable: Type.Literal(false),
    featureFlags: Type.Object(
      {
        backup: Type.Boolean(),
        reflection: Type.Boolean(),
      },
      { additionalProperties: false },
    ),
  },
  { additionalProperties: false, $id: 'ConfigurationResponse' },
);

const CredentialString = Type.String({ minLength: 1, maxLength: 8192 });
const EmailString = Type.String({ format: 'email', maxLength: 320 });

export const ExchangeRequestSchema = Type.Object(
  {
    provider: Type.Union([Type.Literal('apple'), Type.Literal('google')]),
    assertion: CredentialString,
  },
  { additionalProperties: false, $id: 'ExchangeRequest' },
);

export const MagicLinkRequestSchema = Type.Object(
  { email: EmailString },
  { additionalProperties: false, $id: 'MagicLinkRequest' },
);

export const MagicLinkVerifySchema = Type.Union(
  [
    Type.Object(
      { email: EmailString, token: CredentialString },
      { additionalProperties: false },
    ),
    Type.Object(
      { tokenHash: CredentialString },
      { additionalProperties: false },
    ),
  ],
  { $id: 'MagicLinkVerifyRequest' },
);

export const RefreshRequestSchema = Type.Object(
  { refreshToken: CredentialString },
  { additionalProperties: false, $id: 'RefreshRequest' },
);

export const LogoutRequestSchema = Type.Object(
  { refreshToken: CredentialString },
  { additionalProperties: false, $id: 'LogoutRequest' },
);

export const AccountSchema = Type.Object(
  {
    id: Type.String({ format: 'uuid' }),
    displayName: Type.Union([Type.String({ maxLength: 120 }), Type.Null()]),
    locale: Type.String(),
    timezone: Type.String(),
    createdAt: Type.String({ format: 'date-time' }),
    updatedAt: Type.String({ format: 'date-time' }),
  },
  { additionalProperties: false, $id: 'Account' },
);

export const CredentialResponseSchema = Type.Object(
  {
    accessToken: Type.String(),
    refreshToken: Type.String(),
    expiresIn: Type.Integer({ minimum: 1 }),
    tokenType: Type.Literal('Bearer'),
    account: AccountSchema,
  },
  { additionalProperties: false, $id: 'CredentialResponse' },
);

export const AcceptedResponseSchema = Type.Object(
  { accepted: Type.Literal(true) },
  { additionalProperties: false, $id: 'AcceptedResponse' },
);

export const LogoutResponseSchema = Type.Object(
  { loggedOut: Type.Literal(true) },
  { additionalProperties: false, $id: 'LogoutResponse' },
);

export const TranscriptionResponseSchema = Type.Object(
  {
    transcript: Type.String(),
    durationSeconds: Type.Number({ minimum: 0 }),
    language: Type.String({ minLength: 2, maxLength: 35 }),
  },
  { additionalProperties: false, $id: 'TranscriptionResponse' },
);

export const TranscriptionMultipartSchema = Type.Object(
  { audio: Type.String({ format: 'binary' }) },
  { additionalProperties: false, $id: 'TranscriptionMultipart' },
);

export const ProfilePatchSchema = Type.Partial(
  Type.Object(
    {
      displayName: Type.Union([
        Type.String({ minLength: 1, maxLength: 120 }),
        Type.Null(),
      ]),
      locale: Type.String({ minLength: 2, maxLength: 35 }),
      timezone: Type.String({ minLength: 1, maxLength: 100 }),
    },
    { additionalProperties: false },
  ),
  { additionalProperties: false, minProperties: 1, $id: 'ProfilePatch' },
);

export type ExchangeRequest = Static<typeof ExchangeRequestSchema>;
export type MagicLinkRequest = Static<typeof MagicLinkRequestSchema>;
export type MagicLinkVerifyRequest = Static<typeof MagicLinkVerifySchema>;
export type RefreshRequest = Static<typeof RefreshRequestSchema>;
export type LogoutRequest = Static<typeof LogoutRequestSchema>;
export type ProfilePatchRequest = Static<typeof ProfilePatchSchema>;
