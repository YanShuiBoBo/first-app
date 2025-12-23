import { NextResponse } from 'next/server';

export type ApiResponse<T = any> = {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: any;
  };
};

export function successResponse<T>(data: T, status = 200) {
  return NextResponse.json<ApiResponse<T>>(
    { success: true, data },
    { status }
  );
}

export function errorResponse(
  message: string,
  code = 'INTERNAL_ERROR',
  status = 500,
  details?: any
) {
  return NextResponse.json<ApiResponse>(
    {
      success: false,
      error: { code, message, details }
    },
    { status }
  );
}