import { describe, expect, it, vi } from 'vitest';

import {
  ErrorCodes,
  createErrorResponse,
  createSuccessResponse,
  getErrorDocumentation,
  sendError,
  sendSuccess
} from '../../../src/utils/errorHandler.js';

describe('errorHandler', () => {
  it('creates the default error contract', () => {
    expect(createErrorResponse(ErrorCodes.INVALID_CREDENTIALS, 'Invalid credentials')).toEqual({
      response: {
        success: false,
        code: ErrorCodes.INVALID_CREDENTIALS,
        message: 'Invalid credentials'
      }
    });
  });

  it('adds details only when provided', () => {
    expect(createSuccessResponse('OK', 'Done', { id: '123' })).toEqual({
      response: {
        success: true,
        code: 'OK',
        message: 'Done',
        details: { id: '123' }
      }
    });
  });

  it('sends standardized error and success responses', () => {
    const json = vi.fn();
    const status = vi.fn(() => ({ json }));
    const res = { status };

    sendError(res, 401, ErrorCodes.UNAUTHORIZED, 'Unauthorized');
    expect(status).toHaveBeenCalledWith(401);
    expect(json).toHaveBeenCalledWith({
      success: false,
      code: ErrorCodes.UNAUTHORIZED,
      message: 'Unauthorized'
    });

    sendSuccess(res, 200, 'OK', 'Done');
    expect(status).toHaveBeenCalledWith(200);
    expect(json).toHaveBeenCalledWith({
      success: true,
      code: 'OK',
      message: 'Done'
    });
  });

  it('returns documentation for known and unknown codes', () => {
    expect(getErrorDocumentation(ErrorCodes.ACCESS_DENIED).httpStatus).toBe(403);
    expect(getErrorDocumentation('NOT_MAPPED')).toEqual({
      httpStatus: 500,
      description: 'Unknown error',
      solution: 'Check server logs'
    });
  });
});
