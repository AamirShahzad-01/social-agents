import { NextRequest, NextResponse } from 'next/server';

/**
 * POST /api/ai/content/strategist/voice/token
 * Returns API credentials and config for Gemini Live API voice agent
 */
export async function POST(request: NextRequest) {
    try {
        const apiKey = process.env.GOOGLE_API_KEY;

        if (!apiKey) {
            console.error('[Voice Token] No Google API key found in environment');
            return NextResponse.json(
                {
                    success: false,
                    error: 'Google API key not configured. Please set GOOGLE_API_KEY environment variable.',
                },
                { status: 500 }
            );
        }

        // Return the API key and configuration for Gemini Live API
        return NextResponse.json({
            success: true,
            apiKey,
            model: 'gemini-2.5-flash-native-audio-preview-12-2025',
            config: {
                systemInstruction: {
                    parts: [
                        {
                            text: `You are an expert social media content strategist and marketing advisor. 
You help users create engaging content strategies, write compelling posts, develop marketing campaigns, and optimize their social media presence.

Your expertise includes:
- Content ideation and planning
- Writing viral posts for Instagram, TikTok, Twitter/X, LinkedIn, YouTube
- Hashtag strategies and SEO optimization
- Audience engagement tactics
- Brand voice development
- Analytics interpretation and growth strategies

When users ask for help, provide actionable, specific advice. Be creative, enthusiastic, and supportive.
Keep responses conversational but professional.`,
                        },
                    ],
                },
                tools: [], // No tools needed
            },
        });
    } catch (error) {
        console.error('[Voice Token] Error:', error);
        return NextResponse.json(
            {
                success: false,
                error: error instanceof Error ? error.message : 'Failed to get voice credentials',
            },
            { status: 500 }
        );
    }
}
