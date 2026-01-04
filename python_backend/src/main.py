"""
FastAPI Application Entry Point
Production-ready AI agent backend with LangGraph and multi-provider LLM support
"""
import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware

from .config import settings
from .middleware.auth import AuthMiddleware

# Configure logging
logging.basicConfig(
    level=logging.DEBUG if settings.DEBUG else logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """Add security headers to all responses"""
    
    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        
        # Security headers
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        
        if settings.is_production:
            response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
        
        return response


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan manager"""
    logger.info("Starting Content Creator Backend...")
    logger.info(f"Environment: {'PRODUCTION' if settings.is_production else 'DEVELOPMENT'}")
    logger.info(f"Port: {settings.PORT}")
    
    # Validate production configuration
    validation_errors = settings.validate_production_config()
    for error in validation_errors:
        logger.warning(f"Config warning: {error}")
    
    # Initialize checkpointer for LangGraph memory persistence
    from .agents.content_strategist_agent.service import init_checkpointer, close_checkpointer
    await init_checkpointer()
    
    # LLM models are created on-demand per request
    logger.info("Using on-demand LLM model creation")
    
    # Log configured providers
    providers = []
    if settings.OPENAI_API_KEY:
        providers.append("OpenAI")
    if settings.ANTHROPIC_API_KEY:
        providers.append("Anthropic")
    if settings.gemini_key:
        providers.append("Google Gemini")
    if settings.GROQ_API_KEY:
        providers.append("Groq")
    
    if providers:
        logger.info(f"Configured providers: {', '.join(providers)}")
    else:
        logger.warning("No AI provider API keys configured")
    
    logger.info("Application startup complete")
    
    yield
    
    # Shutdown
    logger.info("Shutting down Content Creator Backend...")
    
    # Close checkpointer connection
    await close_checkpointer()
    
    logger.info("Application shutdown complete")


app = FastAPI(
    title="Content Creator AI Backend",
    description="Production-ready Python AI agent backend using LangGraph and FastAPI",
    version="1.0.0",
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc",
)

# Security headers middleware (first - runs last)
app.add_middleware(SecurityHeadersMiddleware)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allow_headers=["*"],
    expose_headers=["X-Request-ID"],
)

# Authentication middleware
app.add_middleware(AuthMiddleware)

# Include API routers
from .api import (
    content_router,
    content_improvement_router,
    improve_media_prompts_router,
    media_generating_router,
    comments_router,
    auth_router,
    media_studio_router,
    storage_router,
    webhooks_router,
    canva_router,
    workspace_router,
    posts_router,
    credentials_router,
    cloudinary_router,
    token_refresh_router,
    cron_router,
    meta_ads_router,
    facebook_router,
    instagram_router,
    linkedin_router,
    twitter_router,
    tiktok_router,
    youtube_router,
    rate_limits_router,
    businesses_router,
    ab_tests_router
)
app.include_router(content_router)
app.include_router(content_improvement_router)
app.include_router(improve_media_prompts_router)
app.include_router(media_generating_router)
app.include_router(comments_router)
app.include_router(auth_router)
app.include_router(media_studio_router)
app.include_router(storage_router)
app.include_router(webhooks_router)
app.include_router(canva_router)
app.include_router(workspace_router)
app.include_router(posts_router)
app.include_router(credentials_router)
app.include_router(cloudinary_router)
app.include_router(token_refresh_router)
app.include_router(cron_router)
app.include_router(meta_ads_router)
app.include_router(facebook_router)
app.include_router(instagram_router)
app.include_router(linkedin_router)
app.include_router(twitter_router)
app.include_router(tiktok_router)
app.include_router(youtube_router)
app.include_router(rate_limits_router)
app.include_router(businesses_router, prefix="/api/v1/meta-ads", tags=["Meta Ads - Business"])
app.include_router(ab_tests_router, prefix="/api/v1/meta-ads", tags=["Meta Ads - A/B Testing"])


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """Global exception handler - sanitizes errors in production"""
    logger.error(f"Unhandled exception: {exc}", exc_info=True)
    
    # Don't expose internal errors in production
    error_message = str(exc) if settings.DEBUG else "An unexpected error occurred"
    
    return JSONResponse(
        status_code=500,
        content={
            "error": "Internal server error",
            "message": error_message,
        }
    )


@app.get("/")
async def root():
    """Root endpoint with service information"""
    return JSONResponse(
        content={
            "service": "Content Creator AI Backend",
            "status": "running",
            "version": "1.0.0",
            "health": "/health",
        }
    )


@app.get("/health")
async def health_check(request: Request):
    """Health check endpoint"""
    return JSONResponse(
        content={
            "status": "healthy",
            "service": "content-creator-backend",
            "environment": "production" if settings.is_production else "development",
        }
    )


if __name__ == "__main__":
    import uvicorn
    
    uvicorn.run(
        "src.main:app",
        host=settings.HOST,
        port=settings.PORT,
        reload=settings.DEBUG,
        log_level="debug" if settings.DEBUG else "info",
    )
