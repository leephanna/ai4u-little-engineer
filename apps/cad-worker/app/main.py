"""
AI4U Little Engineer — CAD Worker
FastAPI microservice for deterministic parametric CAD generation using build123d.
"""

import os
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api.generate import router as generate_router
from app.api.validate import router as validate_router
from app.api.export import router as export_router
from app.api.artifacts import router as artifacts_router

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)
logger = logging.getLogger(__name__)

# Optional Sentry integration
SENTRY_DSN = os.getenv("SENTRY_DSN")
if SENTRY_DSN:
    try:
        import sentry_sdk
        from sentry_sdk.integrations.fastapi import FastApiIntegration
        sentry_sdk.init(
            dsn=SENTRY_DSN,
            integrations=[FastApiIntegration()],
            traces_sample_rate=0.2,
        )
        logger.info("Sentry initialized")
    except ImportError:
        logger.warning("sentry_sdk not installed, skipping Sentry init")


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("CAD Worker starting up")
    # Warm up build123d import (can be slow on first import)
    try:
        import build123d  # noqa: F401
        logger.info("build123d loaded successfully")
    except ImportError:
        logger.warning(
            "build123d not installed — CAD generation will fail. "
            "Install it via: pip install build123d"
        )
    yield
    logger.info("CAD Worker shutting down")


app = FastAPI(
    title="AI4U Little Engineer — CAD Worker",
    description="Deterministic parametric CAD generation microservice",
    version="0.2.0",
    lifespan=lifespan,
)

# CORS — restrict in production to the web app origin
app.add_middleware(
    CORSMiddleware,
    allow_origins=os.getenv("ALLOWED_ORIGINS", "*").split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Routers
app.include_router(generate_router, prefix="/generate", tags=["generate"])
app.include_router(validate_router, prefix="/validate", tags=["validate"])
app.include_router(export_router, prefix="/export", tags=["export"])
app.include_router(artifacts_router, prefix="/artifacts", tags=["artifacts"])


@app.get("/health", tags=["health"])
async def health_check():
    """Health check endpoint. Returns build123d availability status."""
    cad_available = False
    cad_version = None
    try:
        import build123d
        cad_available = True
        cad_version = getattr(build123d, "__version__", "unknown")
    except ImportError:
        pass

    return {
        "status": "ok",
        "service": "cad-worker",
        "version": "0.2.0",
        "cad_engine": {
            "build123d_available": cad_available,
            "build123d_version": cad_version,
        },
    }


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.error(f"Unhandled exception: {exc}", exc_info=True)
    if SENTRY_DSN:
        try:
            import sentry_sdk
            sentry_sdk.capture_exception(exc)
        except Exception:
            pass
    return JSONResponse(
        status_code=500,
        content={
            "status": "error",
            "error": "Internal server error",
            "detail": str(exc) if os.getenv("DEBUG") else "See server logs",
        },
    )
