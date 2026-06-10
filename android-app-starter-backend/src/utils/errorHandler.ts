import type { Response } from 'express';
import type { ApiResponseDetails } from '../types/schemas.js';

export interface ApiResponse {
  success: boolean;
  code: string;
  message: string;
  details?: ApiResponseDetails;
}

interface ErrorDocumentationItem {
  httpStatus: number;
  description: string;
  solution: string;
}

export const createErrorResponse = (code: string, message: string, details: ApiResponseDetails | null = null) => {
  const response: ApiResponse = {
    success: false,
    code,
    message
  };

  if (details) {
    response.details = details;
  }

  return { response };
};

export const createSuccessResponse = (code: string, message: string, details: ApiResponseDetails | null = null) => {
  const response: ApiResponse = {
    success: true,
    code,
    message
  };

  if (details) {
    response.details = details;
  }

  return { response };
};

export const sendError = (
  res: Response,
  statusCode: number,
  code: string,
  message: string,
  details: ApiResponseDetails | null = null
) => {
  const { response } = createErrorResponse(code, message, details);
  return res.status(statusCode).json(response);
};

export const sendSuccess = (
  res: Response,
  statusCode: number,
  code: string,
  message: string,
  details: ApiResponseDetails | null = null
) => {
  const { response } = createSuccessResponse(code, message, details);
  return res.status(statusCode).json(response);
};

export const ErrorCodes = Object.freeze({
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  EMAIL_NOT_VERIFIED: 'EMAIL_NOT_VERIFIED',
  ACCOUNT_SUSPENDED: 'ACCOUNT_SUSPENDED',
  EMAIL_ALREADY_EXISTS: 'EMAIL_ALREADY_EXISTS',
  USER_ALREADY_EXISTS: 'USER_ALREADY_EXISTS',
  INVALID_RESET_TOKEN: 'INVALID_RESET_TOKEN',
  USER_NOT_FOUND: 'USER_NOT_FOUND',
  MISSING_RESET_DATA: 'MISSING_RESET_DATA',
  PASSWORD_RESET_EMAIL_SENT: 'PASSWORD_RESET_EMAIL_SENT',
  PASSWORD_RESET_SUCCESS: 'PASSWORD_RESET_SUCCESS',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  INVALID_EMAIL_FORMAT: 'INVALID_EMAIL_FORMAT',
  INVALID_PASSWORD: 'INVALID_PASSWORD',
  INVALID_NAME: 'INVALID_NAME',
  PASSWORD_REQUIRED: 'PASSWORD_REQUIRED',
  TOKEN_REQUIRED: 'TOKEN_REQUIRED',
  EMAIL_REQUIRED: 'EMAIL_REQUIRED',
  MISSING_REQUIRED_FIELDS: 'MISSING_REQUIRED_FIELDS',
  INVALID_ID_FORMAT: 'INVALID_ID_FORMAT',
  INVALID_DATE_FORMAT: 'INVALID_DATE_FORMAT',
  INVALID_PHONE_FORMAT: 'INVALID_PHONE_FORMAT',
  INVALID_BIRTH_DATE: 'INVALID_BIRTH_DATE',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  ACCESS_DENIED: 'ACCESS_DENIED',
  NOT_FOUND: 'NOT_FOUND',
  INTERNAL_SERVER_ERROR: 'INTERNAL_SERVER_ERROR',
  SEND_EMAIL_ERROR: 'SEND_EMAIL_ERROR'
} as const);

export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes];

export const ErrorDocumentation = Object.freeze({
  [ErrorCodes.INVALID_CREDENTIALS]: {
    httpStatus: 401,
    description: 'Invalid email or password provided',
    solution: 'Check the credentials and try again'
  },
  [ErrorCodes.EMAIL_NOT_VERIFIED]: {
    httpStatus: 403,
    description: 'Email address has not been verified',
    solution: 'Ask the user to confirm the email or resend confirmation'
  },
  [ErrorCodes.USER_NOT_FOUND]: {
    httpStatus: 404,
    description: 'The requested user does not exist',
    solution: 'Check the user id or email'
  },
  [ErrorCodes.ACCESS_DENIED]: {
    httpStatus: 403,
    description: 'The authenticated user cannot access this resource',
    solution: 'Use the owner account or adjust authorization rules'
  },
  [ErrorCodes.INVALID_ID_FORMAT]: {
    httpStatus: 400,
    description: 'The provided id is not a valid MongoDB ObjectId',
    solution: 'Provide a valid 24-character hex string'
  },
  [ErrorCodes.VALIDATION_ERROR]: {
    httpStatus: 422,
    description: 'Request validation failed',
    solution: 'Fix the request body according to the endpoint contract'
  }
} satisfies Partial<Record<ErrorCode, ErrorDocumentationItem>>);

export const getErrorDocumentation = (code: string): ErrorDocumentationItem => {
  const documentation = (ErrorDocumentation as Partial<Record<string, ErrorDocumentationItem>>)[code];
  return documentation || {
    httpStatus: 500,
    description: 'Unknown error',
    solution: 'Check server logs'
  };
};
