/**
 * Credentials Status Endpoint
 * GET /api/credentials/status
 *
 * Proxies to Python backend with server-side authentication
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { getPythonBackendUrl } from '@/lib/backend-url'

export async function GET(req: NextRequest) {
    try {
        // Authenticate user server-side
        const supabase = await createServerClient()
        const { data: { session } } = await supabase.auth.getSession()

        if (!session) {
            return NextResponse.json(
                { error: 'Unauthorized' },
                { status: 401 }
            )
        }

        // Forward to Python backend with auth token
        const backendUrl = getPythonBackendUrl()
        const response = await fetch(`${backendUrl}/api/v1/credentials/status`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${session.access_token}`,
                'Content-Type': 'application/json',
            },
        })

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}))
            return NextResponse.json(
                { error: errorData.detail || 'Failed to get status' },
                { status: response.status }
            )
        }

        const data = await response.json()
        // Debug: log the response from Python backend
        console.log('[Credentials Status] Backend response:', JSON.stringify(data, null, 2))
        return NextResponse.json(data)
    } catch (error) {
        console.error('Credentials status error:', error)
        return NextResponse.json(
            { error: 'Failed to check status' },
            { status: 500 }
        )
    }
}
