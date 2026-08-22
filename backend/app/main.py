from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app import models
from app.api.v1.router import api_router
from app.config import get_settings
from app.db.base import Base
from app.db.session import engine

# Ensure model metadata is registered and initialize tables
_ = models
Base.metadata.create_all(bind=engine)

settings = get_settings()
app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    openapi_url="/openapi.json",
    docs_url="/docs",
    redoc_url="/redoc",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router, prefix="/api/v1")


@app.get("/health")
def health_check() -> dict[str, str]:
    return {"status": "ok", "app": settings.APP_NAME}
