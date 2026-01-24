"""
Configuration Settings
Production-ready environment variable management with validation
"""
import re
import logging
from typing import Optional, List
from pydantic import Field, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

logger = logging.getLogger(__name__)


class Settings(BaseSettings):
    """Application settings loaded from environment variables"""
    
    # Server Configuration
    HOST: str = Field(default="0.0.0.0", description="Server host")
    PORT: int = Field(default=8000, description="Server port")
    DEBUG: bool = Field(default=False, description="Debug mode")
    ENVIRONMENT: str = Field(default="development", description="Environment: development, staging, production")
    
    # AI Provider API Keys
    GOOGLE_API_KEY: Optional[str] = Field(default=None, description="Google/Gemini API key")
    GEMINI_API_KEY: Optional[str] = Field(default=None, description="Gemini API key (alias)")
    OPENAI_API_KEY: Optional[str] = Field(default=None, description="OpenAI API key")
    ANTHROPIC_API_KEY: Optional[str] = Field(default=None, description="Anthropic/Claude API key")
    GROQ_API_KEY: Optional[str] = Field(default=None, description="Groq API key")
    DEEPSEEK_API_KEY: Optional[str] = Field(default=None, description="DeepSeek API key")
    ELEVENLABS_API_KEY: Optional[str] = Field(default=None, description="ElevenLabs API key")
    RUNWAY_API_KEY: Optional[str] = Field(default=None, description="Runway Gen4 API key")
    
    # Cloudinary Configuration (for media storage)
    CLOUDINARY_CLOUD_NAME: Optional[str] = Field(default=None, description="Cloudinary cloud name")
    CLOUDINARY_API_KEY: Optional[str] = Field(default=None, description="Cloudinary API key")
    CLOUDINARY_API_SECRET: Optional[str] = Field(default=None, description="Cloudinary API secret")
    
    # Supabase Configuration
    SUPABASE_URL: Optional[str] = Field(default=None, description="Supabase project URL")
    SUPABASE_KEY: Optional[str] = Field(default=None, description="Supabase anon key")
    SUPABASE_SERVICE_KEY: Optional[str] = Field(default=None, description="Supabase service role key")

    # Email (Resend)
    RESEND_API_KEY: Optional[str] = Field(default=None, description="Resend API key for transactional email")
    SMTP_FROM_EMAIL: Optional[str] = Field(default=None, description="From email address")
    SMTP_FROM_NAME: Optional[str] = Field(default=None, description="From display name")
    
    # Database Configuration
    DATABASE_URL: Optional[str] = Field(default=None, description="PostgreSQL connection string")
    
    # App Configuration
    APP_URL: str = Field(default="http://localhost:3000", description="Frontend app URL")
    BACKEND_URL: str = Field(default="http://localhost:8000", description="Backend API URL for OAuth callbacks")
    
    # CORS Configuration
    CORS_ORIGINS: str = Field(
        default="http://localhost:3000",
        description="Comma-separated list of allowed origins"
    )

    
    @field_validator('APP_URL', 'BACKEND_URL', mode='before')
    @classmethod
    def normalize_url(cls, v: str, info) -> str:
        """Transform URL to proper format for production"""
        field_name = info.field_name
        default = "http://localhost:3000" if field_name == "APP_URL" else "http://localhost:8000"
        
        if not v:
            return default
        
        url = v.strip()

        if "," in url:
            logger.warning("Multiple URLs detected in %s; using the first entry.", field_name)
            url = url.split(",", 1)[0].strip()
        
        # Handle Render's internal format (no protocol, no dots)
        if '://' not in url and 'localhost' not in url and '127.0.0.1' not in url:
            url = re.sub(r':\d+$', '', url)
            if '.' not in url:
                url = f"{url}.onrender.com"
            url = f"https://{url}"
        elif not url.startswith('http://') and not url.startswith('https://'):
            if 'localhost' in url or '127.0.0.1' in url:
                url = f"http://{url}"
            else:
                url = f"https://{url}"
        
        return url.rstrip('/')
    
    def get_oauth_callback_url(self, platform: str) -> str:
        """Get the OAuth callback URL for a platform."""
        return f"{self.BACKEND_URL}/api/v1/auth/oauth/{platform}/callback"

    
    @property
    def cors_origins_list(self) -> List[str]:
        """Get CORS origins as a list"""
        origins = [o.strip() for o in self.CORS_ORIGINS.split(',') if o.strip()]
        # Always include APP_URL
        if self.APP_URL not in origins:
            origins.append(self.APP_URL)
        
        # Add common variations to avoid CORS issues
        additional_origins = []
        for origin in origins:
            # Add https version if http
            if origin.startswith('http://') and 'localhost' not in origin:
                https_version = origin.replace('http://', 'https://')
                if https_version not in origins and https_version not in additional_origins:
                    additional_origins.append(https_version)
            # Add without trailing slash
            if origin.endswith('/'):
                no_slash = origin.rstrip('/')
                if no_slash not in origins and no_slash not in additional_origins:
                    additional_origins.append(no_slash)
        
        origins.extend(additional_origins)
        
        # Log CORS origins at startup for debugging
        logger.info(f"CORS origins configured: {origins}")
        
        return origins
    
    # Social Platform OAuth Credentials
    FACEBOOK_CLIENT_ID: Optional[str] = Field(default=None, description="Facebook App ID")
    FACEBOOK_CLIENT_SECRET: Optional[str] = Field(default=None, description="Facebook App Secret")
    INSTAGRAM_CLIENT_ID: Optional[str] = Field(default=None, description="Instagram Client ID")
    INSTAGRAM_CLIENT_SECRET: Optional[str] = Field(default=None, description="Instagram Client Secret")
    LINKEDIN_CLIENT_ID: Optional[str] = Field(default=None, description="LinkedIn Client ID")
    LINKEDIN_CLIENT_SECRET: Optional[str] = Field(default=None, description="LinkedIn Client Secret")
    TWITTER_CLIENT_ID: Optional[str] = Field(default=None, description="Twitter Client ID")
    TWITTER_CLIENT_SECRET: Optional[str] = Field(default=None, description="Twitter Client Secret")
    TIKTOK_CLIENT_ID: Optional[str] = Field(default=None, description="TikTok Client Key")
    TIKTOK_CLIENT_SECRET: Optional[str] = Field(default=None, description="TikTok Client Secret")
    YOUTUBE_CLIENT_ID: Optional[str] = Field(default=None, description="YouTube/Google Client ID")
    YOUTUBE_CLIENT_SECRET: Optional[str] = Field(default=None, description="YouTube/Google Client Secret")
    
    # Twitter API Keys (OAuth 1.0a)
    TWITTER_API_KEY: Optional[str] = Field(default=None, description="Twitter API Key (OAuth 1.0a)")
    TWITTER_API_SECRET: Optional[str] = Field(default=None, description="Twitter API Secret (OAuth 1.0a)")
    
    # Canva Integration
    CANVA_CLIENT_ID: Optional[str] = Field(default=None, description="Canva Client ID")
    CANVA_CLIENT_SECRET: Optional[str] = Field(default=None, description="Canva Client Secret")
    
    # Meta Ads Configuration (uses Facebook App credentials)
    META_ADS_REDIRECT_URI: Optional[str] = Field(default=None, description="Meta Ads OAuth redirect URI")
    NEXT_PUBLIC_APP_URL: Optional[str] = Field(default=None, description="Next.js app URL for redirects")
    
    @property
    def FACEBOOK_APP_ID(self) -> Optional[str]:
        """Alias for Meta App ID (uses Facebook Client ID)"""
        return self.FACEBOOK_CLIENT_ID
    
    @property
    def FACEBOOK_APP_SECRET(self) -> Optional[str]:
        """Alias for Meta App Secret (uses Facebook Client Secret)"""
        return self.FACEBOOK_CLIENT_SECRET
    
    # Cloudinary Configuration (Media Storage & CDN)
    CLOUDINARY_CLOUD_NAME: Optional[str] = Field(default=None, description="Cloudinary cloud name")
    CLOUDINARY_API_KEY: Optional[str] = Field(default=None, description="Cloudinary API key")
    CLOUDINARY_API_SECRET: Optional[str] = Field(default=None, description="Cloudinary API secret")

    
    # Rate Limiting
    RATE_LIMIT_REQUESTS: int = Field(default=100, description="Max requests per minute")
    RATE_LIMIT_AUTH_ATTEMPTS: int = Field(default=5, description="Max auth attempts per 15 min")
    
    # Cron/Scheduled Jobs
    CRON_SECRET: Optional[str] = Field(default=None, description="Secret for authenticating cron/scheduled jobs")

    
    # Model Configuration
    DEFAULT_MODEL_ID: str = Field(
        default="google-genai:gemini-2.0-flash",
        description="Default LLM model ID"
    )
    
    model_config = SettingsConfigDict(
        env_file=["../.env", ".env"],  # Look in parent dir first, then current
        env_file_encoding="utf-8",
        case_sensitive=True,
        extra="ignore",
    )
    
    @property
    def gemini_key(self) -> Optional[str]:
        """Get Gemini API key (supports both GOOGLE_API_KEY and GEMINI_API_KEY)"""
        return self.GOOGLE_API_KEY or self.GEMINI_API_KEY
    
    @property
    def is_production(self) -> bool:
        """Check if running in production"""
        return self.ENVIRONMENT == "production" or not self.DEBUG
    
    def get_api_key(self, provider: str) -> Optional[str]:
        """Get API key for a specific provider"""
        key_map = {
            "openai": self.OPENAI_API_KEY,
            "anthropic": self.ANTHROPIC_API_KEY,
            "google": self.gemini_key,
            "google-genai": self.gemini_key,
            "groq": self.GROQ_API_KEY,
            "deepseek": self.DEEPSEEK_API_KEY,
            "elevenlabs": self.ELEVENLABS_API_KEY,
        }
        return key_map.get(provider.lower())
    
    def validate_production_config(self) -> List[str]:
        """Validate required configuration for production"""
        errors = []
        
        if self.is_production:
            if not self.SUPABASE_URL:
                errors.append("SUPABASE_URL is required in production")
            if not self.SUPABASE_KEY:
                errors.append("SUPABASE_KEY is required in production")
            if not self.SUPABASE_SERVICE_KEY:
                errors.append("SUPABASE_SERVICE_KEY is required in production")
            if self.SUPABASE_KEY and self.SUPABASE_SERVICE_KEY:
                if self.SUPABASE_KEY == self.SUPABASE_SERVICE_KEY:
                    errors.append("SUPABASE_KEY and SUPABASE_SERVICE_KEY must be different")
        
        return errors
    
    def get_oauth_credentials(self, platform: str) -> tuple[Optional[str], Optional[str]]:
        """Get OAuth client ID and secret for a platform"""
        platform = platform.lower()
        credentials = {
            "facebook": (self.FACEBOOK_CLIENT_ID, self.FACEBOOK_CLIENT_SECRET),
            "instagram": (self.INSTAGRAM_CLIENT_ID or self.FACEBOOK_CLIENT_ID, 
                         self.INSTAGRAM_CLIENT_SECRET or self.FACEBOOK_CLIENT_SECRET),
            "linkedin": (self.LINKEDIN_CLIENT_ID, self.LINKEDIN_CLIENT_SECRET),
            "twitter": (self.TWITTER_CLIENT_ID, self.TWITTER_CLIENT_SECRET),
            "tiktok": (self.TIKTOK_CLIENT_ID, self.TIKTOK_CLIENT_SECRET),
            "youtube": (self.YOUTUBE_CLIENT_ID, self.YOUTUBE_CLIENT_SECRET),
            "canva": (self.CANVA_CLIENT_ID, self.CANVA_CLIENT_SECRET),
        }
        return credentials.get(platform, (None, None))


# Global settings instance
settings = Settings()

# Inject into environment for libraries that rely on it (like google-genai)
import os
if settings.gemini_key:
    # Ensure google-genai and other libraries can find the key
    os.environ["GOOGLE_API_KEY"] = settings.gemini_key

# Validate on startup
_validation_errors = settings.validate_production_config()
if _validation_errors:
    for error in _validation_errors:
        logger.warning(f"Configuration warning: {error}")
