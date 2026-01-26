"""
Credential Encryption Service
AES-256-GCM encryption compatible with TypeScript implementation

Uses PBKDF2 key derivation (100,000 iterations) matching frontend
"""
import logging
import json
import base64
import hashlib
from typing import Optional, Dict, Any
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.backends import default_backend

from ...config import settings

logger = logging.getLogger(__name__)

# PBKDF2 parameters (matching TypeScript implementation)
PBKDF2_ITERATIONS = 100000
PBKDF2_KEY_LENGTH = 32  # 256 bits
PBKDF2_SALT_LENGTH = 16

# AES-GCM parameters
AES_NONCE_LENGTH = 12  # 96 bits for GCM
AES_TAG_LENGTH = 16  # 128 bits authentication tag


class CredentialEncryption:
    """AES-256-GCM encryption for credentials"""
    
    @staticmethod
    def _derive_key(workspace_id: str) -> bytes:
        """
        Derive encryption key using PBKDF2 (matching TypeScript)
        
        Args:
            workspace_id: Workspace ID used as salt
            
        Returns:
            32-byte encryption key
        """
        master_secret = getattr(settings, 'ENCRYPTION_MASTER_KEY', None) or \
                       getattr(settings, 'FACEBOOK_APP_SECRET', None) or \
                       "default_secret_change_in_production"
        
        # Use workspace_id as salt (matching TypeScript implementation)
        salt = workspace_id.encode('utf-8')[:PBKDF2_SALT_LENGTH]
        if len(salt) < PBKDF2_SALT_LENGTH:
            salt = salt + b'0' * (PBKDF2_SALT_LENGTH - len(salt))
        
        kdf = PBKDF2HMAC(
            algorithm=hashes.SHA256(),
            length=PBKDF2_KEY_LENGTH,
            salt=salt,
            iterations=PBKDF2_ITERATIONS,
            backend=default_backend()
        )
        
        key = kdf.derive(master_secret.encode('utf-8'))
        return key
    
    @staticmethod
    def encrypt(credentials: Dict[str, Any], workspace_id: str) -> str:
        """
        Encrypt credentials using AES-256-GCM
        
        Args:
            credentials: Credentials dict to encrypt
            workspace_id: Workspace ID for key derivation
            
        Returns:
            Base64-encoded encrypted string (format: nonce + tag + ciphertext)
        """
        try:
            key = CredentialEncryption._derive_key(workspace_id)
            aesgcm = AESGCM(key)
            
            # Serialize credentials to JSON
            plaintext = json.dumps(credentials).encode('utf-8')
            
            # Generate random nonce (12 bytes for GCM)
            import os
            nonce = os.urandom(AES_NONCE_LENGTH)
            
            # Encrypt
            ciphertext = aesgcm.encrypt(nonce, plaintext, None)
            
            # Extract tag (last 16 bytes) and actual ciphertext
            tag = ciphertext[-AES_TAG_LENGTH:]
            encrypted_data = ciphertext[:-AES_TAG_LENGTH]
            
            # Combine: nonce (12) + tag (16) + ciphertext
            combined = nonce + tag + encrypted_data
            
            # Return as base64
            return base64.b64encode(combined).decode('utf-8')
            
        except Exception as e:
            logger.error(f"Encryption error: {e}", exc_info=True)
            raise ValueError(f"Failed to encrypt credentials: {str(e)}")
    
    @staticmethod
    def decrypt(encrypted_data: str, workspace_id: str) -> Optional[Dict[str, Any]]:
        """
        Decrypt credentials using AES-256-GCM
        
        Args:
            encrypted_data: Base64-encoded encrypted string
            workspace_id: Workspace ID for key derivation
            
        Returns:
            Decrypted credentials dict or None if decryption fails
        """
        try:
            if not isinstance(encrypted_data, str):
                logger.error(f"Unexpected credentials type: {type(encrypted_data)}")
                return None

            # Decode from base64 (handle missing padding)
            padded = encrypted_data + "=" * (-len(encrypted_data) % 4)
            try:
                combined = base64.b64decode(padded)
            except Exception:
                # Try URL-safe base64
                combined = base64.urlsafe_b64decode(padded)
            
            # Extract components
            if len(combined) < AES_NONCE_LENGTH + AES_TAG_LENGTH:
                logger.error("Encrypted data too short")
                return None
            
            nonce = combined[:AES_NONCE_LENGTH]
            tag = combined[AES_NONCE_LENGTH:AES_NONCE_LENGTH + AES_TAG_LENGTH]
            ciphertext = combined[AES_NONCE_LENGTH + AES_TAG_LENGTH:]
            
            # Reconstruct for decryption
            encrypted_with_tag = ciphertext + tag
            
            # Decrypt
            key = CredentialEncryption._derive_key(workspace_id)
            aesgcm = AESGCM(key)
            
            plaintext = aesgcm.decrypt(nonce, encrypted_with_tag, None)
            
            # Parse JSON
            return json.loads(plaintext.decode('utf-8'))
            
        except json.JSONDecodeError as e:
            logger.error(f"Failed to parse decrypted credentials as JSON: {e}")
            return None
        except Exception as e:
            logger.error(f"Decryption error: {e}", exc_info=True)
            return None
