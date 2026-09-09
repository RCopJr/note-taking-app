import type { Context } from 'hono';
import type { ZodType } from 'zod/v4';
import type {
  ApiErrorCode,
  ApiErrorResponse,
} from '../shared/contracts.ts';

type ApiErrorStatus = 400 | 401 | 403 | 404 | 409 | 500 | 502 | 503;
export class ApiError extends Error {
  readonly status: ApiErrorStatus;
  readonly code: ApiErrorCode;
  readonly details?: unknown;

  constructor(status: ApiErrorStatus, code: ApiErrorCode, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

function validationDetails(error: { issues: ReadonlyArray<{ path: PropertyKey[]; message: string }> }) {
  return error.issues.map((issue) => ({
    path: issue.path.map(String).join('.'),
    message: issue.message,
  }));
}

export function parseInput<T>(schema: ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw new ApiError(
      400,
      'INVALID_REQUEST',
      'The request is invalid.',
      validationDetails(result.error),
    );
  }
  return result.data;
}

export async function parseJsonBody<T>(c: Context, schema: ZodType<T>): Promise<T> {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    throw new ApiError(400, 'INVALID_REQUEST', 'The request body must be valid JSON.');
  }
  return parseInput(schema, body);
}

export function errorResponse(c: Context, error: ApiError) {
  const body: ApiErrorResponse = {
    error: {
      code: error.code,
      message: error.message,
      ...(error.details === undefined ? {} : { details: error.details }),
    },
  };
  return c.json(body, error.status);
}
