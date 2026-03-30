<div align="center">

# 🎵 SONAR

### Confidence-Aware Multimodal Emotion-Driven Music Recommendation System

_A multimodal framework combining emotion recognition, uncertainty modeling, hybrid recommendation, and RLHF-based personalization to deliver robust and adaptive music recommendations._

[![FastAPI](https://img.shields.io/badge/FastAPI-009688?style=for-the-badge&logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com)
[![React](https://img.shields.io/badge/React_18-61DAFB?style=for-the-badge&logo=react&logoColor=black)](https://reactjs.org)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-4169E1?style=for-the-badge&logo=postgresql&logoColor=white)](https://postgresql.org)
[![Vite](https://img.shields.io/badge/Vite_7-646CFF?style=for-the-badge&logo=vite&logoColor=white)](https://vitejs.dev)
[![Spotify](https://img.shields.io/badge/Spotify_API-1DB954?style=for-the-badge&logo=spotify&logoColor=white)](https://developer.spotify.com)

📄 **[Research Journal](#)** · 📋 **[Patent Filing](#)**

</div>

---

## 📌 About

**SONAR** is a full-stack AI-powered music platform that detects your emotional state through **text** or **voice** input, models prediction uncertainty with confidence-aware fusion, and generates personalized Spotify playlists — all in real time.

> _"Music that feels what you feel."_

Unlike traditional systems that treat emotions as deterministic labels with static mappings, SONAR **models uncertainty explicitly**, **adapts using real user feedback (RLHF)**, and remains **interpretable and robust** in noisy real-world inputs.

> [!NOTE]
> The system design described in this README is **patent-pending**. For detailed technical insights, methodology, and experimental results, please refer to our **[published research journal](#)**.

---

## 🧬 System Architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│                         USER INPUT                                   │
│                    Text  /  Voice  /  Both                           │
└───────────┬──────────────────┬───────────────────────────────────────┘
            │                  │
    ┌───────▼──────┐   ┌──────▼───────┐
    │ Text Pipeline│   │Speech Pipeline│
    │  (EmoBertX)  │   │   (WavLM)    │
    │              │   │              │
    │ • Coarse     │   │ • Prosodic   │
    │   emotions   │   │   features   │
    │ • Fine-grain │   │ • Coarse     │
    │   (27-class) │   │   emotion    │
    │ • Sentiment  │   │ • ASR → Text │
    │ • Confidence │   │ • Confidence │
    └───────┬──────┘   └──────┬───────┘
            │                  │
    ┌───────▼──────────────────▼───────┐
    │   ⚖️  Confidence-Aware Fusion    │
    │                                   │
    │  • Trust-weighted combination     │
    │  • Conflict resolution            │
    │  • Uncertainty thresholding       │
    └──────────────┬───────────────────┘
                   │
    ┌──────────────▼───────────────────┐
    │   👤  Emotional User Profile     │
    │                                   │
    │  {emotion, fine_emotion,          │
    │   sentiment, confidence,          │
    │   modality, threshold_flag}       │
    └──────────────┬───────────────────┘
                   │
    ┌──────────────▼───────────────────┐
    │  🎼  Hybrid Recommendation       │
    │       Engine                      │
    │                                   │
    │  Rule-Based + Content-Based      │
    │  + Collaborative Filtering       │
    │  + Weather Context               │
    └──────────────┬───────────────────┘
                   │
    ┌──────────────▼───────────────────┐
    │  🤖  RLHF Personalization        │
    │       (LinUCB Bandits)           │
    │                                   │
    │  Explore ↔ Exploit               │
    │  Reward: skip/listen/like/save   │
    └──────────────┬───────────────────┘
                   │
    ┌──────────────▼───────────────────┐
    │  🎵  Personalized Playlist       │
    │  + Explainability Layer          │
    └──────────────────────────────────┘
```

---

## 🔬 Core Innovation

### 1. Multimodal Emotion Analysis

SONAR extracts emotions from two complementary modalities:

| Pipeline | Model | Extracts |
|----------|-------|----------|
| **Text** (semantic) | EmoBertX | Coarse emotions, 27-class fine-grained (GoEmotions), sentiment polarity, confidence |
| **Speech** (expressive) | WavLM | Prosodic features (pitch, energy, rhythm), coarse emotion, ASR → text for fine-grained |

### 2. Confidence-Aware Fusion

Instead of naïve averaging, SONAR performs **trust-based fusion** — each modality is assigned a dynamic trust weight. When modalities conflict, the higher-confidence prediction wins. Confidence propagates through the pipeline: agreement yields high confidence, disagreement triggers automatic reduction.

### 3. Uncertainty Handling

The core differentiator — predictions below a confidence threshold **fall back to neutral** rather than propagating errors. Fine-grained emotions are only surfaced when confidence is high enough to be meaningful.

### 4. Hybrid Recommendation Engine

Three complementary strategies merge into a single candidate set:
- **Rule-Based** — emotion → genre mapping (cold-start support)
- **Content-Based** — audio embeddings, tempo, energy, valence matching
- **Collaborative Filtering** — similar users' preferences for personalization and discovery

Weather context from the user's location further influences genre selection.

### 5. RLHF Personalization (LinUCB)

SONAR uses contextual bandits to **learn how each user reacts to emotions** — not just emotions themselves. Reward signals (skip → negative, full listen → positive, like/save → strong positive) drive the exploration/exploitation balance toward personalized convergence.

### 6. Explainability

Dual-level SHAP-based explanations surface both **why an emotion was detected** (token importance) and **why specific songs were recommended** (reasoning chain).

> 📖 **For detailed methodology, experimental results, and ablation studies**, please visit our **[research journal](#)**.

---

## ✨ Features

| Feature | Status | Description |
|---------|--------|-------------|
| 🔐 **Secure Auth** | ✅ | JWT access/refresh tokens, bcrypt, token revocation |
| 🎭 **Emotion Analysis** | ✅ | 5 base × 28 sub-emotions with confidence scores |
| 🎤 **Voice Input** | ✅ | Real-time recording with live waveform visualization |
| 🗣 **Speech-to-Text** | ✅ | Auto-transcription with provider fallback (Deepgram → AssemblyAI) |
| 🌤 **Weather Context** | ✅ | Location-aware genre influence via OpenWeatherMap |
| 🎵 **Spotify Integration** | ✅ | Real tracks with 30s audio previews |
| 💿 **Vinyl Player** | ✅ | Premium vinyl record player with tonearm, grooves, and spin-up animation |
| 💾 **Playlist Saving** | ✅ | Save to dashboard, re-view, delete (localStorage persistence) |
| 🎛 **Playback Controls** | ✅ | Prev/Next, volume, progress bar, auto-play next track |
| ❄️ **Ambient Effects** | ✅ | Snowfall particles, animated starfield, glassmorphism |
| 📱 **Responsive** | ✅ | Desktop, tablet, and mobile optimized |
| 📊 **Mood History** | 🔜 | Emotional trends over time with charts |
| 🤖 **RLHF Layer** | 🔜 | Contextual bandit personalization |

---

## 🛠 Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | React 18, Vite 7, React Router v6, Zustand, TanStack Query |
| **Backend** | FastAPI (Python), SQLAlchemy 2.0, httpx |
| **Database** | PostgreSQL |
| **Auth** | JWT (Access + Refresh tokens), bcrypt |
| **Music** | Spotify Web API (Client Credentials + Recommendations) |
| **Voice** | Deepgram Nova-2 (primary), AssemblyAI (fallback) |
| **Weather** | OpenWeatherMap API |
| **Styling** | Vanilla CSS, react-snowfall, glassmorphism, micro-animations |

---

## 📁 Project Structure

```
Sonar/
├── frontend/
│   ├── src/
│   │   ├── app/                  # App root + router + Snowfall overlay
│   │   ├── components/           # Shared UI (StarfieldCanvas, Navbar, Footer, Toast)
│   │   ├── pages/
│   │   │   ├── Landing/          # Hero, features, CTA
│   │   │   ├── Auth/             # Split-screen login/signup
│   │   │   ├── Dashboard/        # Saved playlists grid, settings modal
│   │   │   ├── Analyze/          # Text/voice input with live waveform
│   │   │   ├── Result/           # Emotion cards, genre, weather, customize
│   │   │   ├── Playlist/         # Vinyl player, track list, playback
│   │   │   └── NotFound/         # 404 page
│   │   ├── stores/               # Zustand (auth, playlists)
│   │   ├── hooks/                # Custom hooks (auth mutations)
│   │   └── services/             # API client with auto-refresh
│   └── package.json
│
├── backend/
│   ├── models/                   # SQLAlchemy models (User, RefreshToken)
│   ├── schemas/                  # Pydantic schemas
│   ├── routes/                   # API routes (auth, mood)
│   ├── services/
│   │   ├── auth_service.py       # JWT, bcrypt, token management
│   │   ├── llm_service.py        # Emotion analysis engine
│   │   ├── spotify_service.py    # Spotify API integration
│   │   ├── transcription_service.py  # Voice → text (Deepgram/AssemblyAI)
│   │   ├── weather_service.py    # Location → weather context
│   │   └── mood_service.py       # Orchestrator
│   ├── dependencies/             # FastAPI deps (get_current_user)
│   ├── config.py                 # Settings from .env
│   ├── database.py               # DB engine + session
│   ├── main.py                   # App entry point
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

### Mood Analysis & Playlists

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `POST` | `/v1/mood/analyze` | 🔒 | Analyze text → emotion (with optional weather) |
| `POST` | `/v1/mood/transcribe` | 🔒 | Transcribe audio file → text |
| `POST` | `/v1/mood/playlist` | 🔒 | Generate Spotify playlist from genre + settings |

### System

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

# Configure environment
cp .env.example .env
# Edit .env with your API keys (see below)

# Run migrations & start server
alembic upgrade head
uvicorn main:app --reload --port 8000
```

Backend → **http://localhost:8000** · Swagger UI → **http://localhost:8000/docs**

### 3. Frontend Setup

```bash
cd frontend
npm install
npm run dev
```

Frontend → **http://localhost:5173**

### 4. Environment Variables

Create `backend/.env`:

```env
# Database
DATABASE_URL=postgresql+psycopg://youruser@localhost:5432/sonar

# JWT
JWT_SECRET_KEY=your-secret-key

# Spotify (required for playlist generation)
SPOTIFY_CLIENT_ID=your-spotify-client-id
SPOTIFY_CLIENT_SECRET=your-spotify-client-secret

# Voice Transcription (optional — choose one or both)
DEEPGRAM_API_KEY=your-deepgram-key         # Free: 12,000 min/month
ASSEMBLYAI_API_KEY=your-assemblyai-key     # Free: 5 hours/month

# Weather (optional — enhances genre recommendations)
OPENWEATHERMAP_API_KEY=your-weather-key    # Free tier available
```

---

## 🎯 User Flow

```
Landing Page
  └─ "Start Listening" →

Auth Page
  └─ Sign Up / Login →

Dashboard
  ├─ View saved playlists (cards with mood, track count, duration)
  ├─ Click card → re-open in vinyl player
  ├─ Delete playlists (hover → ✕)
  └─ "Generate New Playlist" →

Analyze Page
  ├─ ✏️ Type It Out → text input + mood tags
  └─ 🎤 Say It Aloud → live mic recording + waveform → auto-transcribe
      └─ 📍 Weather context badge (if location enabled)
          ↓
Result Page
  ├─ Primary Emotion + Sub-emotion cards
  ├─ Confidence bar (with transparency)
  ├─ "Why this emotion?" — AI explanation
  ├─ 🎵 Recommended Genre (weather-influenced)
  ├─ 🌤 Weather context bar
  ├─ Emotional spectrum (6 dimensions)
  └─ 🎭 Match / 🌟 Uplift → Customize → Generate
          ↓
Playlist Page
  ├─ 💿 Vinyl record player (spinning disc, tonearm, album art)
  ├─ 🎵 Now Playing: title, artist, progress bar
  ├─ ⏮ ⏸ ⏭ Transport controls + volume
  ├─ Track list with 30s preview playback
  └─ 💾 Save to Dashboard
```

---

## 🏗 Emotion Taxonomy

SONAR classifies emotions in a hierarchical structure:

| Base Emotion | Sub-emotions |
|-------------|-------------|
| **Sadness** | Melancholic, Heartbroken, Lonely, Grief-stricken, Disappointed, Hopeless |
| **Joy** | Euphoric, Grateful, Content, Excited, Proud, Playful |
| **Anger** | Frustrated, Irritated, Resentful, Bitter, Furious |
| **Fear** | Anxious, Overwhelmed, Insecure, Panicked, Uneasy |
| **Calm** | Peaceful, Reflective, Nostalgic, Dreamy, Hopeful, Serene |

---

## 📜 Intellectual Property

> [!IMPORTANT]
> The **SONAR system design** — including the confidence-aware fusion architecture, uncertainty-based fallback mechanism, multimodal trust estimation, and RLHF-driven personalization pipeline — is **patent-pending**.
>
> 📋 **Patent Filing**: [View Patent Application](#)
>
> 📄 **Research Journal**: [Read Full Paper](#)
>
> Please refer to our published work for detailed methodology, architectural decisions, experimental evaluation, and ablation studies.

---

## 🗺 Roadmap

- [x] Full-stack project scaffolding + premium dark UI
- [x] JWT authentication (access + refresh tokens)
- [x] AI emotion analysis (5 base × 28 sub-emotions)
- [x] Voice input with live waveform + auto-transcription
- [x] Weather-influenced genre recommendations
- [x] Spotify integration with 30s audio previews
- [x] Vinyl record player with playback controls
- [x] Playlist saving + dashboard management
- [x] Ambient effects (snowfall, starfield, glassmorphism)
- [ ] Mood history dashboard with trend charts
- [ ] RLHF contextual bandit integration
- [ ] Spotify OAuth (save playlists to user's Spotify)
- [ ] Full-length playback via Spotify Web Playback SDK
- [ ] PWA / offline support
- [ ] Docker deployment

---

## 📄 License

This project is proprietary. All rights reserved.

The system design is patent-pending. See [Intellectual Property](#-intellectual-property) for details.

---

<div align="center">
  <sub>Built with ❤️ by the SONAR team</sub>
  <br/>
  <sub>🎵 Music that feels what you feel.</sub>
</div>
