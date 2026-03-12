<div align="center">

# 🎵 Sonar

### AI-Powered Emotion-Aware Music Platform

Share how you feel. Get the perfect playlist.

[![FastAPI](https://img.shields.io/badge/FastAPI-009688?style=for-the-badge&logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com)
[![React](https://img.shields.io/badge/React_18-61DAFB?style=for-the-badge&logo=react&logoColor=black)](https://reactjs.org)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-4169E1?style=for-the-badge&logo=postgresql&logoColor=white)](https://postgresql.org)
[![Vite](https://img.shields.io/badge/Vite_7-646CFF?style=for-the-badge&logo=vite&logoColor=white)](https://vitejs.dev)

</div>

---

## 📌 About

**Sonar** is a full-stack web application that uses AI to detect your emotional state from text or voice input and generates personalized music playlists to match or transform your mood — in real time.

> _"Music that feels what you feel."_

---

## 🛠 Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | React 18, Vite 7, React Router v6 |
| **State Management** | Zustand |
| **Forms** | React Hook Form |
| **Server State** | TanStack Query (React Query) |
| **Backend** | FastAPI (Python) |
| **Database** | PostgreSQL + SQLAlchemy 2.0 |
| **Auth** | JWT (Access + Refresh tokens), bcrypt |
| **Styling** | Vanilla CSS (glassmorphism, gradients, animations) |

---

## ✨ Features

- 🔐 **Secure Authentication** — JWT access/refresh tokens, bcrypt password hashing, token revocation
- 🎭 **Emotion-Aware AI** — Detects mood from text/voice input *(planned)*
- 🎵 **Smart Playlists** — Curated tracks that match or shift your mood *(planned)*
- 📊 **Mood History** — Track your emotional journey over time *(planned)*
- 🎤 **Voice Input** — Speak your mind, no typing required *(planned)*
- 🌙 **Premium Dark UI** — Glassmorphic cards, animated starfield, vinyl animations
- 📱 **Responsive Design** — Optimized for desktop, tablet, and mobile
- ♿ **Accessible** — ARIA labels, semantic HTML, keyboard navigation

---

## 📁 Project Structure

```
Sonar/
├── frontend/
│   ├── src/
│   │   ├── app/                  # App root + router
│   │   ├── components/           # Shared UI (StarfieldCanvas, Toast, ErrorBoundary)
│   │   ├── pages/
│   │   │   ├── Landing/          # Landing page (hero, features, CTA)
│   │   │   ├── Auth/             # Split-screen login/signup
│   │   │   └── NotFound/         # 404 page
│   │   ├── stores/               # Zustand stores (auth)
│   │   ├── hooks/                # Custom hooks (auth mutations)
│   │   └── services/             # API client with auto-refresh
│   ├── .env
│   └── package.json
│
├── backend/
│   ├── models/                   # SQLAlchemy models (User, RefreshToken)
│   ├── schemas/                  # Pydantic request/response schemas
│   ├── routes/                   # API routes (auth)
│   ├── services/                 # Business logic (auth, JWT, bcrypt)
│   ├── dependencies/             # FastAPI dependencies (get_current_user)
│   ├── config.py                 # Settings from .env
│   ├── database.py               # DB engine + session
│   ├── main.py                   # App entry point
│   ├── .env
│   └── requirements.txt
│
└── README.md
```

---

## 🔑 API Endpoints

### Authentication

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `POST` | `/auth/signup` | — | Create account |
| `POST` | `/auth/login` | — | Login with credentials |
| `POST` | `/auth/refresh` | — | Refresh access token |
| `POST` | `/auth/logout` | 🔒 | Revoke refresh token |
| `GET` | `/auth/me` | 🔒 | Get current user profile |

### Other

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/` | API status |
| `GET` | `/health` | Health check |

---

## 🚀 Getting Started

### Prerequisites

- **Node.js** ≥ 18
- **Python** ≥ 3.9
- **PostgreSQL** (running locally)

### 1. Clone the repository

```bash
git clone https://github.com/your-username/Sonar.git
cd Sonar
```

### 2. Backend Setup

```bash
cd backend

# Create and activate virtual environment
python3 -m venv venv
source venv/bin/activate        # macOS/Linux
# venv\Scripts\activate         # Windows

# Install dependencies
pip install -r requirements.txt

# Create the database
createdb sonar

# Configure environment (edit .env if needed)
# DATABASE_URL=postgresql://youruser@localhost:5432/sonar

# Start the server
uvicorn main:app --reload --port 8000
```

Backend runs at → **http://localhost:8000**
API docs at → **http://localhost:8000/docs** (Swagger UI)

### 3. Frontend Setup

```bash
cd frontend

# Install dependencies
npm install

# Start dev server
npm run dev
```

Frontend runs at → **http://localhost:5173**

---

## 🗄 Database Schema

### `users`

| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | Primary Key |
| username | VARCHAR(50) | Unique, Indexed |
| password_hash | VARCHAR(255) | Not Null |
| created_at | TIMESTAMP | Default: now |
| updated_at | TIMESTAMP | Auto-update |

### `refresh_tokens`

| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | Primary Key |
| user_id | UUID | FK → users, CASCADE |
| token | VARCHAR(512) | Unique, Indexed |
| **is_revoked** | BOOLEAN | Default: false |
| expires_at | TIMESTAMP | Not Null |
| created_at | TIMESTAMP | Default: now |

---

## 🔒 Authentication Flow

```
┌──────────┐     POST /auth/signup      ┌──────────┐
│          │  ──────────────────────►    │          │
│          │                             │          │
│          │  ◄── access_token ─────     │          │
│          │  ◄── refresh_token ────     │          │
│          │  ◄── user ────────────     │          │
│          │                             │          │
│  Client  │     GET /auth/me            │  Server  │
│          │  ── Bearer {access} ──►     │          │
│          │  ◄── user ────────────     │          │
│          │                             │          │
│          │     POST /auth/refresh      │          │
│          │  ── {refresh_token} ──►     │          │
│          │  ◄── new access_token ─     │          │
│          │                             │          │
│          │     POST /auth/logout       │          │
│          │  ── Bearer + refresh ──►    │          │
│          │  ◄── token revoked ───     │          │
└──────────┘                             └──────────┘
```

- **Access Token** — 15 min expiry, sent as `Bearer` header
- **Refresh Token** — 7 day expiry, stored in DB with `is_revoked` flag
- **Auto-Refresh** — Frontend automatically refreshes on 401 before retrying

---

## 🗺 Roadmap

- [x] Full-stack project scaffolding
- [x] Premium dark-mode UI with animations
- [x] JWT authentication (access + refresh tokens)
- [x] PostgreSQL database with SQLAlchemy
- [x] React Hook Form + Zustand + TanStack Query
- [ ] Mood analysis engine (NLP / sentiment detection)
- [ ] Playlist generation + music recommendation
- [ ] Spotify / YouTube Music API integration
- [ ] Voice input (speech-to-text)
- [ ] Mood history dashboard with visualizations
- [ ] User profile & preferences
- [ ] Deployment (Docker + cloud)

---

## 📄 License

This project is for educational purposes.

---

<div align="center">
  <sub>Built with ❤️ by the Sonar team</sub>
</div>
