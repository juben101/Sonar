from datetime import datetime, timedelta, timezone
import bcrypt
from jose import jwt, JWTError
from sqlalchemy.orm import Session
from models.user import User
from models.token import RefreshToken
from config import get_settings

settings = get_settings()


# Password hashing — using bcrypt directly (passlib is unmaintained)
def hash_password(password: str) -> str:
    pwd_bytes = password.encode("utf-8")[:72]  # bcrypt max 72 bytes
    salt = bcrypt.gensalt()
    return bcrypt.hashpw(pwd_bytes, salt).decode("utf-8")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    pwd_bytes = plain_password.encode("utf-8")[:72]
    hashed_bytes = hashed_password.encode("utf-8")
    return bcrypt.checkpw(pwd_bytes, hashed_bytes)


# ── JWT Tokens ──

def create_access_token(user_id: str, username: str) -> str:
    """Create a short-lived access token (15 min default)."""
    expire = datetime.now(timezone.utc) + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    payload = {
        "sub": user_id,
        "username": username,
        "type": "access",
        "exp": expire,
        "iat": datetime.now(timezone.utc),
    }
    return jwt.encode(payload, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)


def create_refresh_token(user_id: str) -> tuple[str, datetime]:
    """Create a long-lived refresh token (7 days default). Returns (token, expires_at)."""
    expires_at = datetime.now(timezone.utc) + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
    payload = {
        "sub": user_id,
        "type": "refresh",
        "exp": expires_at,
        "iat": datetime.now(timezone.utc),
    }
    token = jwt.encode(payload, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)
    return token, expires_at


def decode_token(token: str) -> dict | None:
    """Decode and verify a JWT token. Returns payload or None if invalid."""
    try:
        payload = jwt.decode(token, settings.JWT_SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])
        return payload
    except JWTError:
        return None


# ── User operations ──

def get_user_by_username(db: Session, username: str) -> User | None:
    return db.query(User).filter(User.username == username).first()


def get_user_by_id(db: Session, user_id: str) -> User | None:
    return db.query(User).filter(User.id == user_id).first()


def create_user(db: Session, username: str, password: str) -> User:
    user = User(
        username=username,
        password_hash=hash_password(password),
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


# ── Refresh token operations ──

def store_refresh_token(db: Session, user_id: str, token: str, expires_at: datetime) -> RefreshToken:
    rt = RefreshToken(
        user_id=user_id,
        token=token,
        expires_at=expires_at,
    )
    db.add(rt)
    db.commit()
    return rt


def get_refresh_token(db: Session, token: str) -> RefreshToken | None:
    return db.query(RefreshToken).filter(
        RefreshToken.token == token,
        RefreshToken.is_revoked == False,
    ).first()


def revoke_refresh_token(db: Session, token: str) -> bool:
    rt = db.query(RefreshToken).filter(RefreshToken.token == token).first()
    if rt:
        rt.is_revoked = True
        db.commit()
        return True
    return False


def revoke_all_user_tokens(db: Session, user_id: str) -> int:
    """Revoke all refresh tokens for a user. Returns count of revoked tokens."""
    count = db.query(RefreshToken).filter(
        RefreshToken.user_id == user_id,
        RefreshToken.is_revoked == False,
    ).update({"is_revoked": True})
    db.commit()
    return count
