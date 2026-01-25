"""
Credential Storage Service
Database operations for credential storage and retrieval
"""
import logging
from typing import Optional, Dict, Any, List
from datetime import datetime, timezone

from ..supabase_service import get_supabase_admin_client
from .credential_encryption import CredentialEncryption

logger = logging.getLogger(__name__)


class CredentialStorage:
    """Database storage operations for credentials"""
    
    @staticmethod
    def get_credentials_from_db(
        workspace_id: str,
        platforms: List[str] = None
    ) -> Optional[Dict[str, Any]]:
        """
        Get credentials from database with priority fallback
        
        Priority order: meta_ads > facebook > instagram
        
        Args:
            workspace_id: Workspace ID
            platforms: List of platforms to check (default: ['meta_ads', 'facebook', 'instagram'])
            
        Returns:
            First available credentials dict or None
        """
        if platforms is None:
            platforms = ['meta_ads', 'facebook', 'instagram']
        
        try:
            client = get_supabase_admin_client()
            
            for platform in platforms:
                try:
                    result = client.table("social_accounts").select(
                        "id, platform, credentials_encrypted, page_id, page_name, "
                        "account_id, account_name, username, expires_at, access_token_expires_at, "
                        "is_connected, updated_at"
                    ).eq("workspace_id", workspace_id).eq("platform", platform).eq("is_connected", True).order("updated_at", desc=True).limit(1).execute()
                    
                    if not result.data or len(result.data) == 0:
                        continue
                    
                    row = result.data[0]
                    
                    if not row.get("credentials_encrypted"):
                        logger.warning(
                            "Credentials row missing encrypted payload for %s (workspace=%s, account_id=%s)",
                            platform,
                            workspace_id,
                            row.get("account_id"),
                        )
                        continue
                    
                    # Decrypt credentials
                    try:
                        credentials = CredentialEncryption.decrypt(
                            row["credentials_encrypted"],
                            workspace_id
                        )
                        
                        if not credentials or not credentials.get("accessToken"):
                            logger.warning(
                                "Decrypted credentials missing accessToken for %s (workspace=%s, account_id=%s)",
                                platform,
                                workspace_id,
                                row.get("account_id"),
                            )
                            continue
                        
                        # Return with metadata
                        return {
                            "credentials": credentials,
                            "platform": platform,
                            "page_id": row.get("page_id"),
                            "page_name": row.get("page_name"),
                            "account_id": row.get("account_id"),
                            "account_name": row.get("account_name"),
                            "username": row.get("username"),
                            "expires_at": row.get("expires_at") or row.get("access_token_expires_at"),
                            "social_account_id": row.get("id"),
                        }
                    except Exception as decrypt_error:
                        logger.warning(f"Failed to decrypt credentials for {platform}: {decrypt_error}")
                        continue
                        
                except Exception as query_error:
                    logger.warning(f"Query error for {platform}: {query_error}")
                    continue
            
            return None
            
        except Exception as e:
            logger.error(f"Error getting credentials from database: {e}", exc_info=True)
            return None
    
    @staticmethod
    def save_credentials(
        workspace_id: str,
        platform: str,
        credentials: Dict[str, Any],
        metadata: Optional[Dict[str, Any]] = None
    ) -> bool:
        """
        Save credentials to database
        
        Args:
            workspace_id: Workspace ID
            platform: Platform name (facebook, instagram, meta_ads)
            credentials: Credentials dict to save
            metadata: Optional metadata (page_id, page_name, etc.)
            
        Returns:
            True if saved successfully
        """
        try:
            client = get_supabase_admin_client()
            
            # Encrypt credentials
            encrypted = CredentialEncryption.encrypt(credentials, workspace_id)
            
            # Build record
            now = datetime.now(timezone.utc).isoformat()
            record = {
                "workspace_id": workspace_id,
                "platform": platform,
                "credentials_encrypted": encrypted,
                "is_connected": True,
                "connected_at": now,
                "updated_at": now,
            }
            record["account_id"] = None
            
            if metadata:
                record.update({
                    "page_id": metadata.get("page_id"),
                    "page_name": metadata.get("page_name"),
                    "account_id": metadata.get("account_id"),
                    "account_name": metadata.get("account_name"),
                    "username": metadata.get("username"),
                    "expires_at": metadata.get("expires_at"),
                    "access_token_expires_at": metadata.get("expires_at"),
                })
            
            # Upsert (single call)
            client.table("social_accounts").upsert(
                record,
                on_conflict="workspace_id,platform,account_id"
            ).execute()
            
            logger.info(f"Saved {platform} credentials for workspace {workspace_id}")
            return True
            
        except Exception as e:
            logger.error(f"Error saving credentials: {e}", exc_info=True)
            return False
    
    @staticmethod
    def update_token(
        workspace_id: str,
        new_token: str,
        expires_at: Optional[datetime] = None
    ) -> bool:
        """
        Update access token in database
        
        Args:
            workspace_id: Workspace ID
            new_token: New access token
            expires_at: Token expiration datetime
            
        Returns:
            True if updated successfully
        """
        try:
            client = get_supabase_admin_client()
            
            # Find social account
            result = client.table("social_accounts").select(
                "id, credentials_encrypted, updated_at"
            ).eq("workspace_id", workspace_id).in_(
                "platform", ["facebook", "instagram", "meta_ads"]
            ).order("updated_at", desc=True).limit(1).execute()
            
            if not result.data:
                return False
            
            record = result.data[0]
            
            # Decrypt, update, re-encrypt
            credentials = CredentialEncryption.decrypt(
                record["credentials_encrypted"], workspace_id
            )
            
            if credentials:
                credentials["accessToken"] = new_token
                if expires_at:
                    credentials["expiresAt"] = expires_at.isoformat()
                
                encrypted = CredentialEncryption.encrypt(credentials, workspace_id)
                
                update_data = {
                    "credentials_encrypted": encrypted,
                    "updated_at": datetime.now(timezone.utc).isoformat(),
                }
                
                if expires_at:
                    update_data["expires_at"] = expires_at.isoformat()
                    update_data["access_token_expires_at"] = expires_at.isoformat()
                
                client.table("social_accounts").update(update_data).eq(
                    "id", record["id"]
                ).execute()
                
                logger.info(f"Updated token in database for workspace {workspace_id}")
                return True
            
            return False
            
        except Exception as e:
            logger.error(f"Error updating token in database: {e}", exc_info=True)
            return False
