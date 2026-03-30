from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, status, Request
from sqlalchemy.ext.asyncio import AsyncSession
from database import get_db
from schemas import (
    SignupRequest,
    LoginRequest,
    RefreshRequest,
    LogoutRequest,
    AuthResponse,
    TokenRefreshResponse,
    UserResponse,
    MessageResponse,
)
from services.auth_service import (
    get_user_by_username,
    create_user,
    verify_password,
    create_access_token,
    create_refresh_token,
    store_refresh_token,
    get_refresh_token,
    revoke_refresh_token,
    decode_token,
    get_user_by_id,
)
from dependencies.auth import get_current_user
from models.user import User
from limiter import limiter

router = APIRouter(prefix="/auth", tags=["Authentication"])


@router.post(
    "/signup", response_model=AuthResponse, status_code=status.HTTP_201_CREATED
)
@limiter.limit("5/minute")
async def signup(
    body: SignupRequest, request: Request, db: AsyncSession = Depends(get_db)
) -> AuthResponse:
    """Register a new user and return access + refresh tokens."""
    # Check if username is taken
    existing = await get_user_by_username(db, body.username)
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Username already taken",
        )

    # Create user
    user = await create_user(db, body.username, body.password)

    # Generate tokens
    access_token = create_access_token(user.id, user.username)
    refresh_token, expires_at = create_refresh_token(user.id)

    # Store refresh token in DB
    await store_refresh_token(db, user.id, refresh_token, expires_at)

    return AuthResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        user=UserResponse(**user.to_dict()),
    )


@router.post("/login", response_model=AuthResponse)
@limiter.limit("5/minute")
async def login(
    body: LoginRequest, request: Request, db: AsyncSession = Depends(get_db)
) -> AuthResponse:
    """Authenticate user and return access + refresh tokens."""
    user = await get_user_by_username(db, body.username)
    if not user or not verify_password(body.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid username or password",
        )

    # Generate tokens
    access_token = create_access_token(user.id, user.username)
    refresh_token, expires_at = create_refresh_token(user.id)

    # Store refresh token in DB
    await store_refresh_token(db, user.id, refresh_token, expires_at)

    return AuthResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        user=UserResponse(**user.to_dict()),
    )


@router.post("/refresh", response_model=TokenRefreshResponse)
@limiter.limit("10/minute")
async def refresh_access_token(
    body: RefreshRequest, request: Request, db: AsyncSession = Depends(get_db)
) -> TokenRefreshResponse:
    """Use a valid refresh token to get a new access token."""
    # Decode the refresh token
    payload = decode_token(body.refresh_token)
    if not payload or payload.get("type") != "refresh":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid refresh token",
        )

    # Check if it exists in DB and is not revoked
    stored_token = await get_refresh_token(db, body.refresh_token)
    if not stored_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Refresh token has been revoked or does not exist",
        )

    # Check expiry
    if stored_token.expires_at.replace(tzinfo=timezone.utc) < datetime.now(
        timezone.utc
    ):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Refresh token has expired",
        )

    # Get user
    user = await get_user_by_id(db, payload["sub"])
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found",
        )

    # Issue new access token
    access_token = create_access_token(user.id, user.username)

    return TokenRefreshResponse(access_token=access_token)


@router.post("/logout", response_model=MessageResponse)
async def logout(
    body: LogoutRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> MessageResponse:
    """Revoke a refresh token (requires authentication)."""
    revoked = await revoke_refresh_token(db, body.refresh_token)
    if not revoked:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Token not found",
        )

    return MessageResponse(message="Successfully logged out")


@router.get("/me", response_model=UserResponse)
async def get_me(current_user: User = Depends(get_current_user)) -> UserResponse:
    """Get the current authenticated user's profile."""
    return UserResponse(**current_user.to_dict())
