export type ApiSuccessResponse<T> = {
  success: true;
  message: string;
  data: T;
  meta?: Record<string, unknown>;
};

export type ApiFailedResponse = {
  success: false;
  message: string;
  error: {
    code: string;
    details?: unknown;
  };
};

export type ApiResponse<T> = ApiSuccessResponse<T> | ApiFailedResponse;

export function successResponse<T>(
  data: T,
  message = 'OK',
  meta?: Record<string, unknown>,
): ApiSuccessResponse<T> {
  return meta ? { success: true, message, data, meta } : { success: true, message, data };
}

export function failedResponse(
  message: string,
  code = 'INTERNAL_ERROR',
  details?: unknown,
): ApiFailedResponse {
  return {
    success: false,
    message,
    error: details === undefined ? { code } : { code, details },
  };
}
