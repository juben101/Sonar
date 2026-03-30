"""Tests for authentication API routes."""

import pytest


@pytest.mark.asyncio
async def test_signup_success(client):
    """Test user registration returns tokens and user data."""
    response = await client.post(
        "/auth/signup",
        json={
            "username": "testuser",
            "password": "StrongPass123!",
        },
    )
    assert response.status_code == 201
    data = response.json()
    assert "access_token" in data
    assert "refresh_token" in data
    assert data["user"]["username"] == "testuser"
    assert "id" in data["user"]


@pytest.mark.asyncio
async def test_signup_duplicate_username(client):
    """Test that duplicate usernames return 409."""
    await client.post(
        "/auth/signup",
        json={
            "username": "dupuser",
            "password": "StrongPass123!",
        },
    )
    response = await client.post(
        "/auth/signup",
        json={
            "username": "dupuser",
            "password": "AnotherPass456!",
        },
    )
    assert response.status_code == 409
    assert "already taken" in response.json()["detail"]


@pytest.mark.asyncio
async def test_signup_weak_password(client):
    """Test that short passwords fail validation."""
    response = await client.post(
        "/auth/signup",
        json={
            "username": "weakuser",
            "password": "123",
        },
    )
    assert response.status_code == 422


@pytest.mark.asyncio
async def test_login_success(client):
    """Test login with correct credentials."""
    # First signup
    await client.post(
        "/auth/signup",
        json={
            "username": "loginuser",
            "password": "StrongPass123!",
        },
    )
    # Then login
    response = await client.post(
        "/auth/login",
        json={
            "username": "loginuser",
            "password": "StrongPass123!",
        },
    )
    assert response.status_code == 200
    data = response.json()
    assert "access_token" in data
    assert "refresh_token" in data
    assert data["user"]["username"] == "loginuser"


@pytest.mark.asyncio
async def test_login_wrong_password(client):
    """Test login with wrong password returns 401."""
    await client.post(
        "/auth/signup",
        json={
            "username": "wrongpwduser",
            "password": "StrongPass123!",
        },
    )
    response = await client.post(
        "/auth/login",
        json={
            "username": "wrongpwduser",
            "password": "WrongPassword!",
        },
    )
    assert response.status_code == 401
    assert "Invalid" in response.json()["detail"]


@pytest.mark.asyncio
async def test_login_nonexistent_user(client):
    """Test login for non-existent user returns 401."""
    response = await client.post(
        "/auth/login",
        json={
            "username": "ghostuser",
            "password": "DoesntMatter123!",
        },
    )
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_refresh_token(client):
    """Test refreshing an access token."""
    # Signup to get tokens
    signup_resp = await client.post(
        "/auth/signup",
        json={
            "username": "refreshuser",
            "password": "StrongPass123!",
        },
    )
    refresh_token = signup_resp.json()["refresh_token"]

    # Refresh
    response = await client.post(
        "/auth/refresh",
        json={
            "refresh_token": refresh_token,
        },
    )
    assert response.status_code == 200
    assert "access_token" in response.json()


@pytest.mark.asyncio
async def test_refresh_invalid_token(client):
    """Test refresh with invalid token returns 401."""
    response = await client.post(
        "/auth/refresh",
        json={
            "refresh_token": "invalid.token.here",
        },
    )
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_get_me(client):
    """Test fetching current user profile."""
    # Signup
    signup_resp = await client.post(
        "/auth/signup",
        json={
            "username": "meuser",
            "password": "StrongPass123!",
        },
    )
    access_token = signup_resp.json()["access_token"]

    # Get /auth/me
    response = await client.get(
        "/auth/me",
        headers={
            "Authorization": f"Bearer {access_token}",
        },
    )
    assert response.status_code == 200
    assert response.json()["username"] == "meuser"


@pytest.mark.asyncio
async def test_get_me_unauthorized(client):
    """Test /auth/me without token returns 401."""
    response = await client.get("/auth/me")
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_logout(client):
    """Test logout revokes refresh token."""
    # Signup
    signup_resp = await client.post(
        "/auth/signup",
        json={
            "username": "logoutuser",
            "password": "StrongPass123!",
        },
    )
    data = signup_resp.json()
    access_token = data["access_token"]
    refresh_token = data["refresh_token"]

    # Logout
    response = await client.post(
        "/auth/logout",
        json={
            "refresh_token": refresh_token,
        },
        headers={
            "Authorization": f"Bearer {access_token}",
        },
    )
    assert response.status_code == 200

    # Try to use the revoked refresh token
    refresh_resp = await client.post(
        "/auth/refresh",
        json={
            "refresh_token": refresh_token,
        },
    )
    assert refresh_resp.status_code == 401


@pytest.mark.asyncio
async def test_v1_prefix(client):
    """Test that /v1/auth routes also work."""
    response = await client.post(
        "/v1/auth/signup",
        json={
            "username": "v1user",
            "password": "StrongPass123!",
        },
    )
    assert response.status_code == 201
    assert response.json()["user"]["username"] == "v1user"


@pytest.mark.asyncio
async def test_health_check(client):
    """Test health check endpoint."""
    response = await client.get("/health")
    assert response.status_code == 200
    assert response.json()["status"] == "healthy"


@pytest.mark.asyncio
async def test_root(client):
    """Test root endpoint."""
    response = await client.get("/")
    assert response.status_code == 200
    assert "Sonar" in response.json()["message"]
