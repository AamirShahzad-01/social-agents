"""
OAuth2 Service
Production-ready OAuth2 state management with PKCE support
Uses Python's secrets module for cryptographically secure random generation
"""
import secrets
import hashlib
import base64
from datetime import datetime, timedelta, timezone
from typing import Optional, Dict, Any
from pydantic import BaseModel

from .supabase_service import db_insert, db_select, db_update, db_delete


class OAuthState(BaseModel):
    """OAuth state data model"""
    state: str
    code_verifier: Optional[str] = None
    code_challenge: Optional[str] = None
    code_challenge_method: Optional[str] = None
    expires_at: datetime


def generate_random_state(length: int = 32) -> str:
    """
    Generate cryptographically secure random state for CSRF protection
    
    Uses secrets.token_urlsafe for secure random generation
    Recommended by Python docs for security tokens
    
    Args:
        length: Number of bytes (will be base64 encoded, so output is longer)
        
    Returns:
        URL-safe random string
    """
    return secrets.token_urlsafe(length)


def generate_pkce() -> Dict[str, str]:
    """
    Generate PKCE (Proof Key for Code Exchange) parameters
    
    PKCE Flow:
    1. Generate code_verifier: Random 43-128 character string
    2. Generate code_challenge: SHA256 hash of code_verifier, base64url encoded
    3. Send code_challenge to authorization server
    4. Send code_verifier when exchanging code for token
    
    Uses Python's secrets module for cryptographically secure random generation
    Follows RFC 7636 specification
    
    Returns:
        Dict with code_verifier and code_challenge
    """
    # Generate 32 random bytes (will be 43 chars after base64url encoding)
    code_verifier_bytes = secrets.token_bytes(32)
    
    # Base64url encode and remove padding
    code_verifier = base64.urlsafe_b64encode(code_verifier_bytes).decode('utf-8').rstrip('=')
    
    # Generate code_challenge: SHA256(code_verifier) base64url encoded
    challenge_bytes = hashlib.sha256(code_verifier.encode('utf-8')).digest()
    code_challenge = base64.urlsafe_b64encode(challenge_bytes).decode('utf-8').rstrip('=')
    
    return {
        'code_verifier': code_verifier,
        'code_challenge': code_challenge,
        'code_challenge_method': 'S256'
    }


def verify_pkce(code_verifier: str, code_challenge: str) -> bool:
    """
    Verify PKCE code_verifier matches code_challenge
    
    Args:
        code_verifier: The original code verifier
        code_challenge: The code challenge to verify against
        
    Returns:
        True if valid, False otherwise
    """
    # Regenerate challenge from verifier
    challenge_bytes = hashlib.sha256(code_verifier.encode('utf-8')).digest()
    expected_challenge = base64.urlsafe_b64encode(challenge_bytes).decode('utf-8').rstrip('=')
    
    return secrets.compare_digest(expected_challenge, code_challenge)


async def create_oauth_state(
    workspace_id: str,
    platform: str,
    ip_address: Optional[str] = None,
    user_agent: Optional[str] = None,
    use_pkce: bool = True
) -> OAuthState:
    """
    Create OAuth state for CSRF protection and PKCE
    
    Stores state in database with expiration
    
    Args:
        workspace_id: Workspace ID
        platform: Platform name (facebook, instagram, etc.)
        ip_address: Client IP address for security logging
        user_agent: Client user agent for security logging
        use_pkce: Whether to use PKCE (default: True)
        
    Returns:
        OAuthState with state, code_verifier, code_challenge
        
    Raises:
        Exception: If database insert fails
    """
    # Generate state
    state = generate_random_state()
    
    # Generate PKCE if needed
    code_verifier = None
    code_challenge = None
    code_challenge_method = None
    
    if use_pkce:
        pkce = generate_pkce()
        code_verifier = pkce['code_verifier']
        code_challenge = pkce['code_challenge']
        code_challenge_method = pkce['code_challenge_method']
    
    # Calculate expiration (5 minutes)
    expires_at = datetime.now(timezone.utc) + timedelta(minutes=5)
    
    # Store in database
    result = await db_insert(
        table='oauth_states',
        data={
            'workspace_id': workspace_id,
            'platform': platform,
            'state': state,
            'code_verifier': code_verifier,
            'code_challenge': code_challenge,
            'code_challenge_method': code_challenge_method,
            'expires_at': expires_at.isoformat(),
            'is_used': False,
            'ip_address': ip_address,
            'user_agent': user_agent,
        }
    )
    
    if not result.get('success'):
        raise Exception(f"Failed to create OAuth state: {result.get('error')}")
    
    return OAuthState(
        state=state,
        code_verifier=code_verifier,
        code_challenge=code_challenge,
        code_challenge_method=code_challenge_method,
        expires_at=expires_at
    )


async def verify_oauth_state(
    workspace_id: str,
    platform: str,
    state: str
) -> Dict[str, Any]:
    """
    Verify OAuth state (CSRF check)
    
    Checks:
    1. State exists in database
    2. State matches workspace and platform
    3. State has not been used (replay attack prevention)
    4. State has not expired
    
    Marks state as used atomically to prevent race conditions
    
    Args:
        workspace_id: Workspace ID
        platform: Platform name
        state: State parameter from OAuth callback
        
    Returns:
        Dict with:
        - valid: bool
        - code_challenge: str (if PKCE was used)
        - code_challenge_method: str (if PKCE was used)
        - error: str (if invalid)
    """
    # Query database for state
    result = await db_select(
        table='oauth_states',
        columns='*',
        filters={
            'workspace_id': workspace_id,
            'platform': platform,
            'state': state
        },
        limit=1
    )
    
    if not result.get('success'):
        return {'valid': False, 'error': 'Database query failed'}
    
    data = result.get('data', [])
    if not data:
        return {'valid': False, 'error': 'State not found'}
    
    state_record = data[0]
    
    # Check if already used (replay attack prevention)
    if state_record.get('is_used'):
        return {'valid': False, 'error': 'State already used (replay attack detected)'}
    
    # Check if expired - use timezone-aware UTC datetime
    expires_at = datetime.fromisoformat(state_record['expires_at'].replace('Z', '+00:00'))
    if datetime.now(timezone.utc) > expires_at:
        return {'valid': False, 'error': 'State expired'}
    
    # Mark as used atomically to prevent race conditions
    # This ensures only one callback can successfully mark the state as used
    update_result = await db_update(
        table='oauth_states',
        data={
            'is_used': True,
            'used_at': datetime.now(timezone.utc).isoformat()
        },
        filters={
            'id': state_record['id'],
            'is_used': False  # Only update if not already used (atomic check)
        }
    )
    
    if not update_result.get('success'):
        return {'valid': False, 'error': 'Failed to mark state as used'}
    
    # If no rows were updated, it means another request already marked it as used
    if not update_result.get('data'):
        return {'valid': False, 'error': 'State already used (concurrent request detected)'}
    
    return {
        'valid': True,
        'code_challenge': state_record.get('code_challenge'),
        'code_challenge_method': state_record.get('code_challenge_method')
    }


async def cleanup_expired_states() -> int:
    """
    Clean up expired OAuth states
    
    Should be run periodically as a background job
    
    Returns:
        Number of deleted states
    """
    result = await db_delete(
        table='oauth_states',
        filters={
            'expires_at': {'lt': datetime.now(timezone.utc).isoformat()}
        }
    )
    
    if result.get('success'):
        return len(result.get('data', []))
    return 0


async def clear_workspace_oauth_states(workspace_id: str) -> int:
    """
    Clear all OAuth states for a workspace
    
    Useful for logout or cleanup
    
    Args:
        workspace_id: Workspace ID
        
    Returns:
        Number of deleted states
    """
    result = await db_delete(
        table='oauth_states',
        filters={'workspace_id': workspace_id}
    )
    
    if result.get('success'):
        return len(result.get('data', []))
    return 0
