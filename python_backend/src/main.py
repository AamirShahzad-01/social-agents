"""
FastAPI Application Entry Point
Production-ready AI agent backend with LangGraph and multi-provider LLM support
"""
import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware

from .config import settings
from .services import LLMFactory

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Application lifespan manager
    Handles startup and shutdown events for resource management
    """
    # Startup
    logger.info("🚀 Starting Content Creator Backend...")
    logger.info(f"Environment: {'DEBUG' if settings.DEBUG else 'PRODUCTION'}")
    logger.info(f"Port: {settings.PORT}")
    
    # Initialize LLM Factory
    try:
        app.state.llm_factory = LLMFactory()
        await app.state.llm_factory.initialize()
        logger.info("✅ LLM Factory initialized successfully")
    except Exception as e:
        logger.error(f"❌ Failed to initialize LLM Factory: {e}")
        raise
    
    # Verify API keys
    providers_configured = []
    if settings.OPENAI_API_KEY:
        providers_configured.append("OpenAI")
    if settings.ANTHROPIC_API_KEY:
        providers_configured.append("Anthropic")
    if settings.gemini_key:
        providers_configured.append("Google Gemini")
    if settings.GROQ_API_KEY:
        providers_configured.append("Groq")
    
    if providers_configured:
        logger.info(f"✅ Configured providers: {', '.join(providers_configured)}")
    else:
        logger.warning("⚠️  No AI provider API keys configured")
    
    logger.info("✅ Application startup complete")
    
    yield
    
    # Shutdown
    logger.info("👋 Shutting down Content Creator Backend...")
    try:
        await app.state.llm_factory.close()
        logger.info("✅ LLM Factory closed successfully")
    except Exception as e:
        logger.error(f"❌ Error during shutdown: {e}")
    
    logger.info("✅ Application shutdown complete")


app = FastAPI(
    title="Content Creator AI Backend",
    description="Production-ready Python AI agent backend using LangGraph and FastAPI",
    version="0.1.0",
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc",
)

# CORS middleware for Next.js frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        settings.APP_URL,
        "http://localhost:3000",
        "http://localhost:3001",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include API routers
from .api import (
    content_router,
    improve_media_prompts_router,
    media_generating_router,
    comments_router,
    auth_router,
    facebook_router,
    instagram_router,
    linkedin_router,
    twitter_router,
    tiktok_router,
    youtube_router
)
app.include_router(content_router)
app.include_router(improve_media_prompts_router)
app.include_router(media_generating_router)
app.include_router(comments_router)
app.include_router(auth_router)
app.include_router(facebook_router)
app.include_router(instagram_router)
app.include_router(linkedin_router)
app.include_router(twitter_router)
app.include_router(tiktok_router)
app.include_router(youtube_router)


# Global exception handler
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """Global exception handler for unhandled errors"""
    logger.error(f"Unhandled exception: {exc}", exc_info=True)
    return JSONResponse(
        status_code=500,
        content={
            "error": "Internal server error",
            "message": str(exc) if settings.DEBUG else "An unexpected error occurred",
            "type": type(exc).__name__,
        }
    )


@app.get("/")
async def root():
    """Root endpoint with service information"""
    return JSONResponse(
        content={
            "service": "Content Creator AI Backend",
            "status": "running",
            "version": "0.1.0",
            "docs": "/docs",
            "health": "/health",
        }
    )


@app.get("/health")
async def health_check(request: Request):
    """
    Health check endpoint
    Verifies service health and LLM factory status
    """
    llm_factory_status = "healthy"
    try:
        if not hasattr(request.app.state, "llm_factory"):
            llm_factory_status = "not_initialized"
    except Exception as e:
        llm_factory_status = f"error: {str(e)}"
    
    return JSONResponse(
        content={
            "status": "healthy",
            "service": "content-creator-backend",
            "llm_factory": llm_factory_status,
            "environment": "debug" if settings.DEBUG else "production",
        }
    )


@app.get("/api/v1/providers")
async def list_providers():
    """
    List available AI providers and their configuration status
    """
    from .services import MODEL_ALLOWLIST
    
    providers_status = {
        "openai": {
            "configured": bool(settings.OPENAI_API_KEY),
            "models": [m for m in MODEL_ALLOWLIST if m.startswith("openai:")],
        },
        "anthropic": {
            "configured": bool(settings.ANTHROPIC_API_KEY),
            "models": [m for m in MODEL_ALLOWLIST if m.startswith("anthropic:")],
        },
        "google-genai": {
            "configured": bool(settings.gemini_key),
            "models": [m for m in MODEL_ALLOWLIST if m.startswith("google-genai:")],
        },
        "groq": {
            "configured": bool(settings.GROQ_API_KEY),
            "models": [m for m in MODEL_ALLOWLIST if m.startswith("groq:")],
        },
    }
    
    return JSONResponse(
        content={
            "providers": providers_status,
            "default_model": settings.DEFAULT_MODEL_ID,
        }
    )


if __name__ == "__main__":
    import uvicorn
    
    uvicorn.run(
        "src.main:app",
        host=settings.HOST,
        port=settings.PORT,
        reload=settings.DEBUG,
        log_level="info" if settings.DEBUG else "warning",
    )
