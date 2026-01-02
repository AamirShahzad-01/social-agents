"""
Auth API Routes
Production-ready OAuth2 endpoints for social platform authentication
Supports: Facebook, Instagram, LinkedIn, Twitter, TikTok, YouTube
"""
import logging
from datetime import datetime, timezone, timedelta
from typing import Literal
from urllib.parse import urlencode

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import JSONResponse, RedirectResponse
from pydantic import BaseModel

from ...services import (
    create_oauth_state,
    verify_oauth_state,
    social_service,
    db_select,
    db_insert,
    db_upsert,
    verify_jwt
)
from ...config import settings

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/auth", tags=["Authentication"])

Platform = Literal["facebook", "instagram", "linkedin", "twitter", "tiktok", "youtube"]

# OAuth URLs for each platform
OAUTH_URLS = {
    "twitter": "https://twitter.com/i/oauth2/authorize",
    "linkedin": "https://www.linkedin.com/oauth/v2/authorization",
    "facebook": "https://www.facebook.com/v21.0/dialog/oauth",
    "instagram": "https://www.facebook.com/v21.0/dialog/oauth",
    "tiktok": "https://www.tiktok.com/v2/auth/authorize/",
    "youtube": "https://accounts.google.com/o/oauth2/v2/auth",
}

# OAuth scopes for each platform
SCOPES = {
    "twitter": ["tweet.write", "tweet.read", "users.read", "offline.access"],
    "linkedin": ["openid", "profile", "email", "w_member_social"],
    "facebook": [
        "public_profile",
        "pages_show_list",
        "pages_read_engagement",
        "pages_manage_posts",
        "pages_manage_metadata",
        "instagram_basic",
        "instagram_manage_insights",
        "instagram_manage_comments",
        "business_management",
        "ads_management",
        "ads_read",
    ],
    "instagram": [
        "public_profile",
        "pages_show_list",
        "pages_read_engagement",
        "pages_manage_posts",
        "instagram_basic",
        "instagram_content_publish",
        "instagram_manage_comments",
    ],
    "tiktok": ["user.info.basic", "video.upload", "video.publish"],
    "youtube": [
        "https://www.googleapis.com/auth/youtube.upload",
        "https://www.googleapis.com/auth/youtube.readonly",
        "https://www.googleapis.com/auth/youtube.force-ssl",
        "https://www.googleapis.com/auth/userinfo.profile",
    ],
}


def get_error_redirect(error_code: str) -> str:
    """Generate error redirect URL"""
    return f"{settings.APP_URL}/settings?tab=accounts&oauth_error={error_code}"


def get_success_redirect(platform: str) -> str:
    """Generate success redirect URL"""
    return f"{settings.APP_URL}/settings?tab=accounts&oauth_success={platform}"


@router.post("/oauth/{platform}/initiate")
async def initiate_oauth(platform: Platform, request: Request):
    """
    Initiate OAuth flow for a supported platform
    
    - Validates user authentication and permissions
    - Creates CSRF state and PKCE parameters
    - Returns authorization URL for redirect
    """
    try:
        # Authenticate user
        auth_header = request.headers.get("authorization")
        if not auth_header or not auth_header.startswith("Bearer "):
            raise HTTPException(status_code=401, detail="Unauthorized")
        
        token = auth_header.split(" ", 1)[1]
        jwt_result = await verify_jwt(token)
        
        if not jwt_result.get("success") or not jwt_result.get("user"):
            raise HTTPException(status_code=401, detail="Invalid token")
        
        user = jwt_result["user"]
        workspace_id = user.get("workspaceId")
        
        if not workspace_id:
            raise HTTPException(status_code=400, detail="No workspace found")
        
        # Validate platform
        if platform not in OAUTH_URLS:
            raise HTTPException(status_code=400, detail="Invalid platform")
        
        # Get platform credentials
        client_id, client_secret = settings.get_oauth_credentials(platform)
        
        if not client_id:
            raise HTTPException(status_code=500, detail=f"{platform.title()} is not configured")
        
        # Build callback URL using BACKEND_URL for OAuth redirects
        callback_url = settings.get_oauth_callback_url(platform)
        
        # Create OAuth state
        ip_address = request.headers.get("x-forwarded-for", "").split(",")[0].strip()
        user_agent = request.headers.get("user-agent")
        
        # PKCE is not supported by Facebook/Instagram
        use_pkce = platform not in ["facebook", "instagram"]
        
        oauth_state = await create_oauth_state(
            workspace_id=workspace_id,
            platform=platform,
            ip_address=ip_address,
            user_agent=user_agent,
            use_pkce=use_pkce
        )
        
        # Build authorization URL
        params = {
            "response_type": "code",
            "state": oauth_state.state,
        }
        
        # Platform-specific parameters
        if platform == "twitter":
            params["client_id"] = client_id
            params["redirect_uri"] = callback_url
            params["code_challenge"] = oauth_state.code_challenge
            params["code_challenge_method"] = "S256"
            params["scope"] = " ".join(SCOPES[platform])
            
        elif platform == "linkedin":
            params["client_id"] = client_id
            params["redirect_uri"] = callback_url
            params["scope"] = " ".join(SCOPES[platform])
            
        elif platform in ["facebook", "instagram"]:
            # Both use Facebook OAuth
            params["client_id"] = client_id
            params["redirect_uri"] = callback_url
            params["scope"] = ",".join(SCOPES[platform])
            params["display"] = "popup"
            
        elif platform == "tiktok":
            params["client_key"] = client_id
            params["redirect_uri"] = callback_url
            params["scope"] = ",".join(SCOPES[platform])
            params["code_challenge"] = oauth_state.code_challenge
            params["code_challenge_method"] = "S256"
            
        elif platform == "youtube":
            params["client_id"] = client_id
            params["redirect_uri"] = callback_url
            params["scope"] = " ".join(SCOPES[platform])
            params["access_type"] = "offline"
            params["prompt"] = "consent"
            params["code_challenge"] = oauth_state.code_challenge
            params["code_challenge_method"] = "S256"
        
        oauth_url = f"{OAUTH_URLS[platform]}?{urlencode(params)}"
        
        # Create response with PKCE verifier cookie
        response = JSONResponse({
            "success": True,
            "redirectUrl": oauth_url
        })
        
        if oauth_state.code_verifier:
            response.set_cookie(
                key=f"oauth_{platform}_verifier",
                value=oauth_state.code_verifier,
                httponly=True,
                secure=settings.is_production,
                samesite="lax",
                max_age=600  # 10 minutes
            )
        
        logger.info(f"OAuth initiated for {platform} - workspace: {workspace_id}")
        return response
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"OAuth initiation error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to initiate OAuth")


@router.get("/oauth/{platform}/callback")
async def oauth_callback(
    platform: Platform,
    code: str = None,
    state: str = None,
    error: str = None,
    request: Request = None
):
    """
    Handle OAuth callback from platform
    
    - Verifies CSRF state
    - Exchanges code for access token
    - Saves credentials to database
    - Redirects to frontend with success/error
    """
    try:
        # Check for OAuth denial
        if error:
            logger.warning(f"OAuth denied for {platform}: {error}")
            return RedirectResponse(url=get_error_redirect("user_denied"))
        
        # Validate parameters
        if not code or not state:
            return RedirectResponse(url=get_error_redirect("missing_params"))
        
        # Get workspace from state
        state_result = await db_select(
            table="oauth_states",
            columns="workspace_id, code_verifier",
            filters={"state": state, "platform": platform},
            limit=1
        )
        
        if not state_result.get("success") or not state_result.get("data"):
            return RedirectResponse(url=get_error_redirect("invalid_state"))
        
        workspace_id = state_result["data"][0]["workspace_id"]
        code_verifier = state_result["data"][0].get("code_verifier")
        
        # Verify state
        verification = await verify_oauth_state(workspace_id, platform, state)
        if not verification.get("valid"):
            return RedirectResponse(url=get_error_redirect("csrf_failed"))
        
        # Get verifier from cookie if needed
        if not code_verifier and platform not in ["facebook", "instagram"]:
            code_verifier = request.cookies.get(f"oauth_{platform}_verifier")
        
        # Platform-specific token exchange - use BACKEND_URL for verification
        callback_url = settings.get_oauth_callback_url(platform)
        
        if platform == "facebook":
            return await _handle_facebook_callback(code, workspace_id, callback_url)
        elif platform == "instagram":
            return await _handle_instagram_callback(code, workspace_id, callback_url)
        elif platform == "twitter":
            return await _handle_twitter_callback(code, workspace_id, callback_url, code_verifier)
        elif platform == "linkedin":
            return await _handle_linkedin_callback(code, workspace_id, callback_url)
        elif platform == "tiktok":
            return await _handle_tiktok_callback(code, workspace_id, callback_url, code_verifier)
        elif platform == "youtube":
            return await _handle_youtube_callback(code, workspace_id, callback_url, code_verifier)
        else:
            return RedirectResponse(url=get_error_redirect("unsupported_platform"))
        
    except Exception as e:
        logger.error(f"OAuth callback error: {e}", exc_info=True)
        return RedirectResponse(url=get_error_redirect("callback_error"))


async def _save_social_account(
    workspace_id: str,
    platform: str,
    account_id: str,
    account_name: str,
    credentials: dict,
    expires_at: datetime = None,
    page_id: str = None,
    page_name: str = None,
    username: str = None
) -> None:
    """
    Save or update social account credentials with token expiration tracking.
    
    Args:
        workspace_id: Workspace UUID
        platform: Platform name (twitter, instagram, etc.)
        account_id: Platform-specific account ID
        account_name: Display name for the account
        credentials: OAuth credentials dict
        expires_at: Token expiration datetime (UTC)
        page_id: Facebook/Instagram page ID (optional)
        page_name: Facebook/Instagram page name (optional)
        username: Username for display (optional, used by Instagram/Twitter)
    """
    now = datetime.now(timezone.utc)
    
    data = {
        "workspace_id": workspace_id,
        "platform": platform,
        "account_id": account_id,
        "account_name": account_name,
        "credentials_encrypted": credentials,
        "is_connected": True,
        "connected_at": now.isoformat(),
        "last_refreshed_at": now.isoformat(),
        "refresh_error_count": 0,
        "last_error_message": None,
        "updated_at": now.isoformat()
    }
    
    # Add page info if provided (for Facebook/Instagram)
    if page_id:
        data["page_id"] = page_id
    if page_name:
        data["page_name"] = page_name
    if username:
        data["username"] = username
    
    # Add token expiration if provided
    if expires_at:
        data["expires_at"] = expires_at.isoformat()
        # Also store in credentials for frontend access
        credentials["expiresAt"] = expires_at.isoformat()
        data["credentials_encrypted"] = credentials
    
    await db_upsert(
        table="social_accounts",
        data=data,
        on_conflict="workspace_id,platform,account_id"
    )


async def _handle_facebook_callback(code: str, workspace_id: str, callback_url: str):
    """Handle Facebook OAuth callback with token expiration tracking"""
    try:
        import httpx
        
        # Exchange code for token
        token_result = await social_service.facebook_exchange_code_for_token(code, callback_url)
        
        if not token_result.get("success"):
            return RedirectResponse(url=get_error_redirect("token_exchange_failed"))
        
        access_token = token_result["access_token"]
        expires_in = token_result.get("expires_in")  # Short-lived token expiry
        
        # Get long-lived token (60 days) - this is the USER token for ads
        long_lived_result = await social_service.facebook_get_long_lived_token(access_token)
        if long_lived_result.get("success"):
            access_token = long_lived_result["access_token"]
            # Long-lived tokens expire in ~60 days (5184000 seconds)
            expires_in = long_lived_result.get("expires_in", 5184000)
        
        # Calculate token expiration timestamp
        expires_at = None
        if expires_in:
            expires_at = datetime.now(timezone.utc) + timedelta(seconds=int(expires_in))
        else:
            # Default to 60 days for long-lived tokens
            expires_at = datetime.now(timezone.utc) + timedelta(days=60)
        
        # Get Facebook pages
        pages_result = await social_service.facebook_get_pages(access_token)
        if not pages_result.get("success") or not pages_result.get("pages"):
            return RedirectResponse(url=get_error_redirect("no_pages_found"))
        
        # Save first page (user can switch later)
        selected_page = pages_result["pages"][0]
        
        # ========== FETCH BUSINESS AND AD ACCOUNTS ==========
        ad_account_id = None
        ad_account_name = None
        business_id = None
        business_name = None
        
        try:
            import hmac
            import hashlib
            
            GRAPH_API_VERSION = "v24.0"
            GRAPH_BASE_URL = f"https://graph.facebook.com/{GRAPH_API_VERSION}"
            
            # Generate appsecret_proof - required for server-side API calls
            app_secret = settings.FACEBOOK_APP_SECRET
            appsecret_proof = hmac.new(
                app_secret.encode('utf-8'),
                access_token.encode('utf-8'),
                hashlib.sha256
            ).hexdigest() if app_secret else ""
            
            async with httpx.AsyncClient(timeout=30.0) as client:
                # Fetch businesses using USER token (NOT page token)
                businesses_url = f"{GRAPH_BASE_URL}/me/businesses"
                params = {
                    "access_token": access_token,
                    "fields": "id,name",
                    "appsecret_proof": appsecret_proof
                }
                
                resp = await client.get(businesses_url, params=params)
                
                if resp.status_code == 200:
                    data = resp.json()
                    businesses = data.get("data", [])
                    
                    logger.info(f"Found {len(businesses)} businesses for workspace {workspace_id}")
                    
                    # Get ad accounts from each business
                    for business in businesses:
                        ad_accounts_url = f"{GRAPH_BASE_URL}/{business['id']}/owned_ad_accounts"
                        ad_params = {
                            "access_token": access_token,
                            "fields": "id,account_id,name,account_status,currency,timezone_name",
                            "appsecret_proof": appsecret_proof
                        }
                        
                        ad_resp = await client.get(ad_accounts_url, params=ad_params)
                        
                        if ad_resp.status_code == 200:
                            ad_data = ad_resp.json()
                            ad_accounts = ad_data.get("data", [])
                            
                            if ad_accounts:
                                first_account = ad_accounts[0]
                                ad_account_id = first_account.get("account_id") or first_account.get("id", "").replace("act_", "")
                                ad_account_name = first_account.get("name")
                                business_id = business["id"]
                                business_name = business.get("name")
                                logger.info(f"Found ad account: {ad_account_name} from business: {business_name}")
                                break  # Found one, use it
                        else:
                            logger.warning(f"Failed to get ad accounts for business {business['id']}: {ad_resp.status_code}")
                else:
                    logger.warning(f"Failed to get businesses: {resp.status_code} - {resp.text[:200]}")
                    
                # Fallback: Try getting ad accounts directly from user
                if not ad_account_id:
                    logger.info("Trying direct ad accounts as fallback")
                    ad_accounts_url = f"{GRAPH_BASE_URL}/me/adaccounts"
                    ad_params = {
                        "access_token": access_token,
                        "fields": "id,account_id,name,account_status,currency,timezone_name",
                        "appsecret_proof": appsecret_proof
                    }
                    
                    ad_resp = await client.get(ad_accounts_url, params=ad_params)
                    
                    if ad_resp.status_code == 200:
                        ad_data = ad_resp.json()
                        ad_accounts = ad_data.get("data", [])
                        
                        if ad_accounts:
                            first_account = ad_accounts[0]
                            ad_account_id = first_account.get("account_id") or first_account.get("id", "").replace("act_", "")
                            ad_account_name = first_account.get("name")
                            logger.info(f"Found direct ad account: {ad_account_name}")
                    
        except Exception as biz_error:
            logger.warning(f"Error fetching business/ad accounts: {biz_error}")
        # ========== END FETCH BUSINESS AND AD ACCOUNTS ==========
        
        credentials = {
            "accessToken": selected_page["access_token"],  # Page token for posting
            "userAccessToken": access_token,  # User token for ads/business API
            "pageId": selected_page["id"],
            "pageName": selected_page["name"],
            "category": selected_page.get("category"),
            "isConnected": True,
            "connectedAt": datetime.now(timezone.utc).isoformat(),
            # Ad account info
            "adAccountId": ad_account_id,
            "adAccountName": ad_account_name,
            "businessId": business_id,
            "businessName": business_name,
        }
        
        await _save_social_account(
            workspace_id=workspace_id,
            platform="facebook",
            account_id=selected_page["id"],
            account_name=selected_page["name"],
            credentials=credentials,
            expires_at=expires_at,
            page_id=selected_page["id"],
            page_name=selected_page["name"]
        )
        
        logger.info(f"Facebook connected - workspace: {workspace_id}, expires: {expires_at.isoformat()}, ad_account: {ad_account_id}")
        return RedirectResponse(url=get_success_redirect("facebook"))
        
    except Exception as e:
        logger.error(f"Facebook callback error: {e}", exc_info=True)
        return RedirectResponse(url=get_error_redirect("callback_error"))


async def _handle_instagram_callback(code: str, workspace_id: str, callback_url: str):
    """Handle Instagram OAuth callback (via Facebook) with token expiration tracking"""
    try:
        # Exchange code for token (same as Facebook)
        token_result = await social_service.facebook_exchange_code_for_token(code, callback_url)
        
        if not token_result.get("success"):
            return RedirectResponse(url=get_error_redirect("token_exchange_failed"))
        
        access_token = token_result["access_token"]
        expires_in = token_result.get("expires_in")
        
        # Get long-lived token (60 days)
        long_lived_result = await social_service.facebook_get_long_lived_token(access_token)
        if long_lived_result.get("success"):
            access_token = long_lived_result["access_token"]
            expires_in = long_lived_result.get("expires_in", 5184000)
        
        # Calculate token expiration timestamp
        expires_at = None
        if expires_in:
            expires_at = datetime.now(timezone.utc) + timedelta(seconds=int(expires_in))
        else:
            # Default to 60 days for Instagram long-lived tokens
            expires_at = datetime.now(timezone.utc) + timedelta(days=60)
        
        # Get Instagram business accounts
        ig_result = await social_service.instagram_get_accounts(access_token)
        if not ig_result.get("success") or not ig_result.get("accounts"):
            return RedirectResponse(url=get_error_redirect("no_instagram_account"))
        
        selected_account = ig_result["accounts"][0]
        
        credentials = {
            "accessToken": access_token,
            "instagramAccountId": selected_account["id"],
            "username": selected_account.get("username"),
            "isConnected": True,
            "connectedAt": datetime.now(timezone.utc).isoformat()
        }
        
        await _save_social_account(
            workspace_id=workspace_id,
            platform="instagram",
            account_id=selected_account["id"],
            account_name=selected_account.get("username", "Instagram Account"),
            credentials=credentials,
            expires_at=expires_at,
            username=selected_account.get("username")
        )
        
        logger.info(f"Instagram connected - workspace: {workspace_id}, expires: {expires_at.isoformat()}")
        return RedirectResponse(url=get_success_redirect("instagram"))
        
    except Exception as e:
        logger.error(f"Instagram callback error: {e}", exc_info=True)
        return RedirectResponse(url=get_error_redirect("callback_error"))


async def _handle_twitter_callback(code: str, workspace_id: str, callback_url: str, code_verifier: str):
    """Handle Twitter OAuth callback with token expiration tracking"""
    try:
        if not code_verifier:
            return RedirectResponse(url=get_error_redirect("missing_verifier"))
        
        # Exchange code for token
        token_result = await social_service.twitter_exchange_code_for_token(
            code, callback_url, code_verifier
        )
        
        if not token_result.get("success"):
            return RedirectResponse(url=get_error_redirect("token_exchange_failed"))
        
        access_token = token_result["access_token"]
        refresh_token = token_result.get("refresh_token")
        expires_in = token_result.get("expires_in")
        
        # Calculate token expiration timestamp
        # Twitter OAuth 2.0 tokens expire in 2 hours (7200 seconds)
        if expires_in:
            expires_at = datetime.now(timezone.utc) + timedelta(seconds=int(expires_in))
        else:
            expires_at = datetime.now(timezone.utc) + timedelta(hours=2)
        
        # Get user info
        user_result = await social_service.twitter_get_user(access_token)
        if not user_result.get("success"):
            return RedirectResponse(url=get_error_redirect("user_info_failed"))
        
        user_data = user_result["user"]
        
        credentials = {
            "accessToken": access_token,
            "refreshToken": refresh_token,
            "userId": user_data["id"],
            "username": user_data["username"],
            "name": user_data.get("name"),
            "isConnected": True,
            "connectedAt": datetime.now(timezone.utc).isoformat()
        }
        
        await _save_social_account(
            workspace_id=workspace_id,
            platform="twitter",
            account_id=user_data["id"],
            account_name=f"@{user_data['username']}",
            credentials=credentials,
            expires_at=expires_at,
            username=user_data['username']
        )
        
        logger.info(f"Twitter connected - workspace: {workspace_id}, expires: {expires_at.isoformat()}")
        return RedirectResponse(url=get_success_redirect("twitter"))
        
    except Exception as e:
        logger.error(f"Twitter callback error: {e}", exc_info=True)
        return RedirectResponse(url=get_error_redirect("callback_error"))


async def _handle_linkedin_callback(code: str, workspace_id: str, callback_url: str):
    """Handle LinkedIn OAuth callback with token expiration tracking"""
    try:
        # Exchange code for token
        token_result = await social_service.linkedin_exchange_code_for_token(code, callback_url)
        
        if not token_result.get("success"):
            return RedirectResponse(url=get_error_redirect("token_exchange_failed"))
        
        access_token = token_result["access_token"]
        expires_in = token_result.get("expires_in")
        refresh_token = token_result.get("refresh_token")
        
        # Calculate token expiration timestamp
        # LinkedIn access tokens expire in 60 days (5184000 seconds)
        if expires_in:
            expires_at = datetime.now(timezone.utc) + timedelta(seconds=int(expires_in))
        else:
            expires_at = datetime.now(timezone.utc) + timedelta(days=60)
        
        # Get user info
        user_result = await social_service.linkedin_get_user(access_token)
        if not user_result.get("success"):
            return RedirectResponse(url=get_error_redirect("user_info_failed"))
        
        user_data = user_result["user"]
        
        credentials = {
            "accessToken": access_token,
            "refreshToken": refresh_token,
            "userId": user_data["sub"],
            "name": user_data.get("name"),
            "email": user_data.get("email"),
            "picture": user_data.get("picture"),
            "isConnected": True,
            "connectedAt": datetime.now(timezone.utc).isoformat()
        }
        
        await _save_social_account(
            workspace_id=workspace_id,
            platform="linkedin",
            account_id=user_data["sub"],
            account_name=user_data.get("name", "LinkedIn User"),
            credentials=credentials,
            expires_at=expires_at
        )
        
        logger.info(f"LinkedIn connected - workspace: {workspace_id}, expires: {expires_at.isoformat()}")
        return RedirectResponse(url=get_success_redirect("linkedin"))
        
    except Exception as e:
        logger.error(f"LinkedIn callback error: {e}", exc_info=True)
        return RedirectResponse(url=get_error_redirect("callback_error"))


async def _handle_tiktok_callback(code: str, workspace_id: str, callback_url: str, code_verifier: str):
    """Handle TikTok OAuth callback with token expiration tracking"""
    try:
        if not code_verifier:
            return RedirectResponse(url=get_error_redirect("missing_verifier"))
        
        # Exchange code for token
        token_result = await social_service.tiktok_exchange_code_for_token(
            code, callback_url, code_verifier
        )
        
        if not token_result.get("success"):
            return RedirectResponse(url=get_error_redirect("token_exchange_failed"))
        
        access_token = token_result["access_token"]
        refresh_token = token_result.get("refresh_token")
        expires_in = token_result.get("expires_in")
        
        # Calculate token expiration timestamp
        # TikTok access tokens expire in 24 hours (86400 seconds)
        if expires_in:
            expires_at = datetime.now(timezone.utc) + timedelta(seconds=int(expires_in))
        else:
            expires_at = datetime.now(timezone.utc) + timedelta(hours=24)
        
        # Get user info
        user_result = await social_service.tiktok_get_user(access_token)
        if not user_result.get("success"):
            return RedirectResponse(url=get_error_redirect("user_info_failed"))
        
        user_data = user_result["user"]
        
        credentials = {
            "accessToken": access_token,
            "refreshToken": refresh_token,
            "openId": user_data.get("open_id"),
            "displayName": user_data.get("display_name"),
            "avatarUrl": user_data.get("avatar_url"),
            "isConnected": True,
            "connectedAt": datetime.now(timezone.utc).isoformat()
        }
        
        await _save_social_account(
            workspace_id=workspace_id,
            platform="tiktok",
            account_id=user_data.get("open_id", "unknown"),
            account_name=user_data.get("display_name", "TikTok User"),
            credentials=credentials,
            expires_at=expires_at
        )
        
        logger.info(f"TikTok connected - workspace: {workspace_id}, expires: {expires_at.isoformat()}")
        return RedirectResponse(url=get_success_redirect("tiktok"))
        
    except Exception as e:
        logger.error(f"TikTok callback error: {e}", exc_info=True)
        return RedirectResponse(url=get_error_redirect("callback_error"))


async def _handle_youtube_callback(code: str, workspace_id: str, callback_url: str, code_verifier: str):
    """Handle YouTube OAuth callback with token expiration tracking"""
    try:
        if not code_verifier:
            return RedirectResponse(url=get_error_redirect("missing_verifier"))
        
        # Exchange code for token
        token_result = await social_service.youtube_exchange_code_for_token(
            code, callback_url, code_verifier
        )
        
        if not token_result.get("success"):
            return RedirectResponse(url=get_error_redirect("token_exchange_failed"))
        
        access_token = token_result["access_token"]
        refresh_token = token_result.get("refresh_token")
        expires_in = token_result.get("expires_in")
        
        # Calculate token expiration timestamp
        # YouTube/Google access tokens expire in 1 hour (3600 seconds)
        if expires_in:
            expires_at = datetime.now(timezone.utc) + timedelta(seconds=int(expires_in))
        else:
            expires_at = datetime.now(timezone.utc) + timedelta(hours=1)
        
        # Get channel info
        channel_result = await social_service.youtube_get_channel(access_token)
        if not channel_result.get("success"):
            return RedirectResponse(url=get_error_redirect("channel_info_failed"))
        
        channel_data = channel_result["channel"]
        
        credentials = {
            "accessToken": access_token,
            "refreshToken": refresh_token,
            "channelId": channel_data["id"],
            "channelTitle": channel_data.get("title"),
            "thumbnailUrl": channel_data.get("thumbnail"),
            "isConnected": True,
            "connectedAt": datetime.now(timezone.utc).isoformat()
        }
        
        await _save_social_account(
            workspace_id=workspace_id,
            platform="youtube",
            account_id=channel_data["id"],
            account_name=channel_data.get("title", "YouTube Channel"),
            credentials=credentials,
            expires_at=expires_at
        )
        
        logger.info(f"YouTube connected - workspace: {workspace_id}, expires: {expires_at.isoformat()}")
        return RedirectResponse(url=get_success_redirect("youtube"))
        
    except Exception as e:
        logger.error(f"YouTube callback error: {e}", exc_info=True)
        return RedirectResponse(url=get_error_redirect("callback_error"))


@router.get("/")
async def auth_info():
    """Auth API information"""
    return {
        "success": True,
        "message": "Authentication API is operational",
        "version": "1.0.0",
        "endpoints": {
            "initiate": "POST /oauth/{platform}/initiate",
            "callback": "GET /oauth/{platform}/callback"
        },
        "supported_platforms": list(OAUTH_URLS.keys())
    }
