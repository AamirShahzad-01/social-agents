"""Services module"""
from .supabase_service import (
    get_supabase_client,
    is_supabase_configured,
    upload_file,
    download_file,
    delete_file,
    db_select,
    db_insert,
    db_update,
    db_upsert,
    db_delete,
    verify_jwt,
)
from .oauth_service import (
    create_oauth_state,
    verify_oauth_state,
    generate_pkce,
    verify_pkce,
    cleanup_expired_states,
    clear_workspace_oauth_states,
)
from .storage_service import (
    storage_service,
    upload_file as storage_upload_file,
    upload_from_url,
    get_signed_url,
    delete_file as storage_delete_file,
)
from .social_service import (
    social_service,
    close_social_service,
)
from .token_refresh_service import (
    token_refresh_service,
    close_token_refresh_service,
    CredentialsResult,
    RefreshErrorType,
)
from .canva_service import (
    get_canva_token,
    save_canva_tokens,
    delete_canva_tokens,
    get_canva_connection_status,
    create_canva_oauth_state,
    verify_canva_oauth_state,
    list_designs as canva_list_designs,
    get_design as canva_get_design,
    create_design as canva_create_design,
    get_export_formats as canva_get_export_formats,
    export_design as canva_export_design,
    CanvaServiceError,
)
from .meta_sdk_client import (
    MetaSDKClient,
    MetaSDKError,
    get_meta_sdk_client,
    create_meta_sdk_client,
)
from .rate_limit_service import (
    RateLimitService,
    get_rate_limit_service,
    QuotaStatus,
    QuotaCheckResult,
)
from .rate_limit_constants import (
    Platform,
    PlatformLimit,
    PLATFORM_LIMITS,
    get_platform_limit,
    get_daily_post_limit,
)

__all__ = [
    # Supabase
    "get_supabase_client",
    "is_supabase_configured",
    "upload_file",
    "download_file",
    "delete_file",
    "db_select",
    "db_insert",
    "db_update",
    "db_upsert",
    "db_delete",
    "verify_jwt",
    # OAuth
    "create_oauth_state",
    "verify_oauth_state",
    "generate_pkce",
    "verify_pkce",
    "cleanup_expired_states",
    "clear_workspace_oauth_states",
    # Storage
    "storage_service",
    "storage_upload_file",
    "upload_from_url",
    "get_signed_url",
    "storage_delete_file",
    # Social
    "social_service",
    "close_social_service",
    # Token Refresh (On-Demand)
    "token_refresh_service",
    "close_token_refresh_service",
    "CredentialsResult",
    "RefreshErrorType",
    # Canva Integration
    "get_canva_token",
    "save_canva_tokens",
    "delete_canva_tokens",
    "get_canva_connection_status",
    "create_canva_oauth_state",
    "verify_canva_oauth_state",
    "canva_list_designs",
    "canva_get_design",
    "canva_create_design",
    "canva_get_export_formats",
    "canva_export_design",
    "CanvaServiceError",
    # Meta Business SDK
    "MetaSDKClient",
    "MetaSDKError",
    "get_meta_sdk_client",
    "create_meta_sdk_client",
    # Rate Limiting
    "RateLimitService",
    "get_rate_limit_service",
    "QuotaStatus",
    "QuotaCheckResult",
    "Platform",
    "PlatformLimit",
    "PLATFORM_LIMITS",
    "get_platform_limit",
    "get_daily_post_limit",
]



