import { NextRequest, NextResponse } from 'next/server'
import { getPythonBackendUrl } from '@/lib/backend-url'

const BACKEND_URL = getPythonBackendUrl()

/**
 * GET /api/v1/meta-ads/switch-business
 * Returns available businesses and the currently active business/ad account
 */
export async function GET(request: NextRequest) {
    try {
        // Forward auth headers to backend
        const headers: HeadersInit = {
            'Content-Type': 'application/json',
        }

        const authHeader = request.headers.get('authorization')
        const cookieHeader = request.headers.get('cookie')

        if (authHeader) headers['authorization'] = authHeader
        if (cookieHeader) headers['cookie'] = cookieHeader

        const response = await fetch(`${BACKEND_URL}/api/v1/meta-ads/switch-business`, {
            method: 'GET',
            headers,
        })

        const data = await response.json()
        return NextResponse.json(data, { status: response.status })
    } catch (error) {
        console.error('Error in meta-ads switch-business GET:', error)
        return NextResponse.json(
            { error: 'Failed to fetch business info' },
            { status: 500 }
        )
    }
}

/**
 * POST /api/v1/meta-ads/switch-business
 * Switches to a different business portfolio and ad account
 */
export async function POST(request: NextRequest) {
    try {
        const body = await request.json()

        // Forward auth headers to backend
        const headers: HeadersInit = {
            'Content-Type': 'application/json',
        }

        const authHeader = request.headers.get('authorization')
        const cookieHeader = request.headers.get('cookie')

        if (authHeader) headers['authorization'] = authHeader
        if (cookieHeader) headers['cookie'] = cookieHeader

        const response = await fetch(`${BACKEND_URL}/api/v1/meta-ads/switch-business`, {
            method: 'POST',
            headers,
            body: JSON.stringify(body),
        })

        const data = await response.json()
        return NextResponse.json(data, { status: response.status })
    } catch (error) {
        console.error('Error in meta-ads switch-business POST:', error)
        return NextResponse.json(
            { error: 'Failed to switch business' },
            { status: 500 }
        )
    }
}

