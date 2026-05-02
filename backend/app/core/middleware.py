"""
Custom middleware for the application
"""

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware
import time
import uuid

from app.core.config import settings
from app.core.logging_config import log_request, log_response, log_error

def setup_middleware(app: FastAPI) -> None:
    """Setup all middleware for the application"""
    
    # CORS middleware
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.BACKEND_CORS_ORIGINS,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    
    # Trusted host middleware
    app.add_middleware(
        TrustedHostMiddleware,
        allowed_hosts=["*"]
    )
    
    # Request logging middleware
    @app.middleware("http")
    async def log_requests(request: Request, call_next):
        start_time = time.time()
        header_request_id = request.headers.get("X-Request-ID")
        request_id = header_request_id or str(uuid.uuid4())
        request.state.request_id = request_id
        user_id = None
        if hasattr(request.state, "user") and getattr(request.state, "user"):
            user_id = getattr(request.state.user, "id", None)
        log_request(
            request.method,
            request.url.path,
            user_id,
            {"request_id": request_id, "query": str(request.url.query)},
        )
        
        # Process request
        try:
            response = await call_next(request)
        except Exception as exc:
            log_error(exc, f"Request failed | request_id={request_id}")
            raise
        
        # Log response
        process_time = time.time() - start_time
        log_response(
            request.method,
            request.url.path,
            response.status_code,
            duration_ms=process_time * 1000,
        )
        response.headers["X-Request-ID"] = request_id
        
        return response
