import { NextResponse } from 'next/server';

/**
 * Normalize a backend API response for consistent frontend error handling.
 * 
 * FastAPI HTTPException uses 'detail' for error messages, but our frontend
 * expects 'error'. This function normalizes the response format.
 * 
 * @param data - The parsed JSON response from the backend
 * @param statusCode - The HTTP status code from the backend response
 * @returns NextResponse with normalized format
 */
export function normalizeApiResponse(data: any, statusCode: number): NextResponse {
    // If response was successful, pass it through
    if (statusCode >= 200 && statusCode < 300) {
        return NextResponse.json(data, { status: statusCode });
    }

    // Normalize error responses: FastAPI HTTPException uses 'detail', we want 'error'
    const errorMessage = data.detail || data.error || data.message || 'Unknown error from API';

    return NextResponse.json(
        { success: false, error: errorMessage },
        { status: statusCode }
    );
}

/**
 * Create a standardized error response for proxy failures
 * 
 * @param error - The caught error
 * @param defaultMessage - Default message if error doesn't have a message
 * @param statusCode - HTTP status code (default 500)
 * @returns NextResponse with error format
 */
export function createErrorResponse(
    error: unknown,
    defaultMessage: string,
    statusCode: number = 500
): NextResponse {
    const message = error instanceof Error ? error.message : defaultMessage;
    return NextResponse.json(
        { success: false, error: message },
        { status: statusCode }
    );
}

/**
 * Create a timeout error response
 * 
 * @param contextMessage - Context about what was timing out
 * @returns NextResponse with 408 status
 */
export function createTimeoutResponse(contextMessage: string): NextResponse {
    return NextResponse.json(
        { success: false, error: contextMessage },
        { status: 408 }
    );
}
