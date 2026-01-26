/**
 * Credentials Status Endpoint
 * GET /api/credentials/status
 *
 * Proxies to Python backend with server-side authentication
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { getPythonBackendUrl } from '@/lib/backend-url'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
    try {
        // Authenticate user server-side
        const supabase = await createServerClient()
        const { data: { session } } = await supabase.auth.getSession()

        if (!session) {
            return NextResponse.json(
                { error: 'Unauthorized' },
                {
                    status: 401,
                    headers: {
                        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
                    },
                }
            )
        }

        // Forward to Python backend with auth token
        const backendUrl = getPythonBackendUrl()
        const response = await fetch(`${backendUrl}/api/v1/credentials/status`, {
            method: 'GET',
            cache: 'no-store',
            headers: {
                'Authorization': `Bearer ${session.access_token}`,
                'Content-Type': 'application/json',
            },
        })

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}))
            return NextResponse.json(
                { error: errorData.detail || 'Failed to get status' },
                {
                    status: response.status,
                    headers: {
                        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
                    },
                }
            )
        }

        const data = await response.json()
        return NextResponse.json(data, {
            headers: {
                'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
            },
        })
    } catch (error) {
        console.error('Credentials status error:', error)
        return NextResponse.json(
            { error: 'Failed to check status' },
            {
                status: 500,
                headers: {
                    'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
                },
            }
        )
    }
}
