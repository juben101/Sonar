from datetime import datetime, timedelta, timezone
import base64
import logging
from fastapi import APIRouter, Depends, HTTPException, status, Request, UploadFile, File
from sqlalchemy import select
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
    ProfileUpdate,
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

logger = logging.getLogger("sonar")

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


@router.put("/profile", response_model=UserResponse)
async def update_profile(
    body: ProfileUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> UserResponse:
    """Update user profile (username with 30-day cooldown, email)."""
    # Update email if provided
    if body.email is not None:
        current_user.email = body.email.strip() if body.email else None

    # Update username if provided and different
    if body.username and body.username != current_user.username:
        new_username = body.username.strip()
        if len(new_username) < 3 or len(new_username) > 50:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Username must be between 3 and 50 characters",
            )

        # Check 30-day cooldown
        if current_user.username_changed_at:
            days_since = (
                datetime.now(timezone.utc) - current_user.username_changed_at
            ).days
            if days_since < 30:
                remaining = 30 - days_since
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Username can only be changed once every 30 days. {remaining} days remaining.",
                )

        # Check uniqueness
        existing = await get_user_by_username(db, new_username)
        if existing:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Username already taken",
            )

        current_user.username = new_username
        current_user.username_changed_at = datetime.now(timezone.utc)

    await db.commit()
    await db.refresh(current_user)
    return UserResponse(**current_user.to_dict())


@router.post("/avatar", response_model=UserResponse)
async def upload_avatar(
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> UserResponse:
    """Upload user avatar image. Stored as base64 data URL."""
    # Validate file type
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="File must be an image",
        )

    # Read file (limit to 2MB)
    contents = await file.read()
    if len(contents) > 2 * 1024 * 1024:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Image must be smaller than 2MB",
        )

    # Convert to base64 data URL
    b64 = base64.b64encode(contents).decode("utf-8")
    data_url = f"data:{file.content_type};base64,{b64}"

    current_user.avatar_url = data_url
    await db.commit()
    await db.refresh(current_user)
    return UserResponse(**current_user.to_dict())


@router.delete("/account", response_model=MessageResponse)
async def delete_account(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> MessageResponse:
    """Permanently delete user account and all associated data."""
    username = current_user.username
    logger.info(f"Account deletion requested for user: {username} (id: {current_user.id})")

    await db.delete(current_user)
    await db.commit()

    logger.info(f"Account deleted: {username}")
    return MessageResponse(message="Account permanently deleted")

