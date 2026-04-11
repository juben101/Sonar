<div align="center">

# 🎵 SONAR

### Confidence-Aware Multimodal Emotion-Driven Music Recommendation System

_A multimodal framework combining emotion recognition, uncertainty modeling, hybrid recommendation, and RLHF-based personalization to deliver robust and adaptive music recommendations._

[![FastAPI](https://img.shields.io/badge/FastAPI-009688?style=for-the-badge&logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com)
[![React](https://img.shields.io/badge/React_18-61DAFB?style=for-the-badge&logo=react&logoColor=black)](https://reactjs.org)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-4169E1?style=for-the-badge&logo=postgresql&logoColor=white)](https://postgresql.org)
[![Vite](https://img.shields.io/badge/Vite_7-646CFF?style=for-the-badge&logo=vite&logoColor=white)](https://vitejs.dev)
[![YouTube Music](https://img.shields.io/badge/YouTube_Music-FF0000?style=for-the-badge&logo=youtube-music&logoColor=white)](https://music.youtube.com)
[![Tests](https://img.shields.io/badge/Tests-68_Passing-34d399?style=for-the-badge)](.)

<br/>

[![Conference Paper](https://img.shields.io/badge/📑_Conference_Paper-View_Publication-2563eb?style=for-the-badge)](https://ieeexplore.ieee.org/document/11465594)
&nbsp;&nbsp;
[![Research Journal](https://img.shields.io/badge/📄_Research_Journal-Read_Full_Paper-7c3aed?style=for-the-badge)](#)
&nbsp;&nbsp;
[![Patent](https://img.shields.io/badge/📋_Patent_Filing-View_Application-e11d48?style=for-the-badge)](#)

</div>

---

## 📌 About

**SONAR** is a full-stack AI-powered music platform that detects your emotional state through **text** or **voice** input, models prediction uncertainty with confidence-aware fusion, and generates personalized playlists with on-demand streaming — all in real time.

> _"Music that feels what you feel."_

Unlike traditional systems that treat emotions as deterministic labels with static mappings, SONAR **models uncertainty explicitly**, **adapts using real user feedback (RLHF)**, and remains **interpretable and robust** in noisy real-world inputs. The system includes an AI wellness companion chatbot with RAG over your emotional history, providing psychotherapy-informed conversational support.

> [!NOTE]
> The system design described below is **patent-pending**. For detailed technical insights, methodology, ablation studies, and experimental results, please refer to our **[conference paper](https://ieeexplore.ieee.org/document/11465594)** and **[research journal](#)**.

---

## 🧬 System Architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│                         USER INPUT                                   │
│                    Text  /  Voice  /  Both                           │
└───────────┬──────────────────┬───────────────────────────────────────┘
            │                  │
    ┌───────▼──────┐   ┌──────▼───────┐
    │ Text Pipeline│   │Speech        │
    │              │   │     Pipeline │
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
    │   ⚖️  Confidence-Aware Fusion    |
    │                                  │
    │  • Trust-weighted combination    │
    │  • Conflict resolution           │
    │  • Uncertainty thresholding      │
    └──────────────┬───────────────────┘
                   │
    ┌──────────────▼───────────────────┐
    │   👤  Emotional User Profile     │
    │                                  │
    │  {emotion, fine_emotion,         │
    │   sentiment, confidence,         │
    │   modality, threshold_flag}      │
    └──────────────┬───────────────────┘
                   │
    ┌──────────────▼───────────────────┐
    │  🎼  Hybrid Recommendation       │
    │       Engine                     │
    │                                  │
    │  Rule-Based + Content-Based      │
    │  + Collaborative Filtering       │
    │  + Weather Context               │
    └──────────────┬───────────────────┘
                   │
    ┌──────────────▼───────────────────┐
    │  🤖  RLHF Personalization        │
    │       (LinUCB Bandits)           │
    │                                  │
    │  Explore ↔ Exploit               │
    │  Reward: skip/listen/like/save   │
    └──────────────┬───────────────────┘
                   │
    ┌──────────────▼───────────────────┐
    │  🎵  Personalized Playlist       │
    │  + Explainability Layer          │
    │  + AI Wellness Companion         │
    └──────────────────────────────────┘
```

---

## 🔬 Core Innovation

### 1. Multimodal Emotion Analysis

SONAR extracts emotions from two complementary modalities — **text as semantic emotion** and **speech as expressive emotion**:

| Pipeline | Model | Extracts |
|----------|-------|----------|
| **Text** (semantic) | EmoBertX | Coarse emotions, 27-class fine-grained (GoEmotions), sentiment polarity (Sentiment140), confidence scores |
| **Speech** (expressive) | WavLM | Prosodic features (pitch, energy, rhythm, speaking rate, pause patterns), coarse emotion, ASR → text for fine-grained inference, ASR confidence |

### 2. Confidence-Aware Fusion

Instead of naïve averaging, SONAR performs **trust-based fusion** — each modality is assigned a dynamic trust weight based on its confidence. When modalities conflict, the higher-confidence prediction wins. Agreement yields high confidence; disagreement triggers automatic reduction.

### 3. Uncertainty Handling _(Core Differentiator)_

Predictions below a confidence threshold **fall back to neutral** rather than propagating errors downstream. Fine-grained emotions are only surfaced when confidence is high enough to be meaningful — preventing noisy real-world inputs from corrupting recommendations.

### 4. Hybrid Recommendation Engine

Three complementary strategies merge into a unified candidate set:
- **Rule-Based** — emotion → genre mapping for cold-start support  
- **Content-Based** — audio embeddings, tempo, energy, valence matching  
- **Collaborative Filtering** — similar users' preferences for personalization and discovery  
- **Weather Context** — real-time location-aware genre influence

### 5. RLHF Personalization (LinUCB)

Contextual bandits learn **how each user reacts to emotions** — not just emotions themselves. Reward signals (skip → negative, full listen → positive, like/save → strong positive) drive the exploration/exploitation balance toward personalized convergence.

### 6. Explainability

Dual-level explanations surface both **why an emotion was detected** (SHAP-based token/prosodic importance) and **why specific songs were recommended** (emotion reasoning chain + personalization context).

> 📖 **For detailed methodology, experimental results, and ablation studies**, visit our **[conference paper](#)** and **[research journal](#)**.

---

## ✨ Features

| Feature | Description |
|---------|-------------|
| 🔐 **Secure Auth** | JWT access/refresh tokens, bcrypt hashing, token revocation |
| 🎭 **Emotion Analysis** | 5 base × 28 sub-emotions with confidence scores and dimensional spectrum |
| 🎤 **Voice Input** | Real-time recording with live waveform + prosodic feature extraction |
| 🗣 **Speech-to-Text** | Auto-transcription with prosodic analysis (pace, pauses, clarity) |
| 🌤 **Weather Context** | Location-aware genre influence via OpenWeatherMap |
| 🎵 **YouTube Music** | Real tracks with on-demand audio streaming + auto-retry on expired URLs |
| 💿 **Vinyl Player** | Premium vinyl record with tonearm, grooves, spin-up animation, album art |
| 💾 **Playlist Saving** | Save to dashboard, replay, delete — persisted to localStorage |
| 👍👎 **RLHF Tracking** | Per-track like/dislike for preference learning |
| 🎛 **Playback Controls** | Prev/Next, progress bar, auto-play next track |
| 📊 **Mood History** | Confidence/energy area charts, emotion pie, valence trend, calendar heatmap |
| 🕸 **Emotion Radar** | SVG spider chart showing 6-dimensional emotional spectrum over time |
| 📈 **Analytics** | Streak counter, animated stats, week-over-week comparison, gradient headers |
| 🤖 **AI Companion** | Floating chatbot with RAG over mood history, psychotherapy techniques, crisis support |
| 🔗 **Social Sharing** | Share mood analysis and playlists via Web Share API / clipboard |
| 👋 **Onboarding** | Guided 3-step intro for first-time users |
| ❄️ **Ambient Effects** | Snowfall particles, animated starfield, glassmorphism |
| 📱 **Responsive** | Desktop, tablet, and mobile optimized |
| ⚡ **Code-Split** | React.lazy() — 254 KB initial bundle (63% reduction) |
| 🛡 **Error Boundary** | Global crash protection preventing white-screen errors |

---

## 🛠 Tech Stack

| Layer | Technology |
|-------|-----------:|
| **Frontend** | React 18, Vite 7, React Router v6, Zustand, TanStack Query, Recharts |
| **Backend** | FastAPI (Python), SQLAlchemy 2.0 (async), httpx, Alembic |
| **Database** | PostgreSQL (async via psycopg3) |
| **Auth** | JWT (Access + Refresh tokens), bcrypt |
| **Music** | YouTube Music API (ytmusicapi + yt-dlp for streaming) |
| **Voice** | Deepgram Nova-2 (primary), AssemblyAI (fallback) |
| **Weather** | OpenWeatherMap API |
| **Styling** | Vanilla CSS, glassmorphism, micro-animations, react-snowfall |
| **Testing** | pytest + respx (backend), Vitest + Testing Library (frontend) |
| **Linting** | ruff (Python), ESLint (JavaScript) |

---

## 📁 Project Structure

```
Sonar/
├── frontend/
│   ├── src/
│   │   ├── app/                  # App root + router + Suspense + ChatWidget
│   │   ├── components/           # Shared UI (ChatWidget, Navbar, Footer, Toast, StarfieldCanvas, ErrorBoundary)
│   │   ├── pages/
│   │   │   ├── Landing/          # Hero, features, CTA
│   │   │   ├── Auth/             # Split-screen login/signup
│   │   │   ├── Dashboard/        # Saved playlists grid, onboarding flow, settings modal
│   │   │   ├── Analyze/          # Text/voice input with live waveform + prosodic extraction
│   │   │   ├── Result/           # Emotion cards, genre, weather, spectrum, share, customize
│   │   │   ├── Playlist/         # Vinyl player, track list, share, save, RLHF feedback
│   │   │   ├── History/          # Mood analytics dashboard (charts, radar, heatmap, streaks)
│   │   │   └── NotFound/         # 404 page
│   │   ├── stores/               # Zustand (auth, playlists)
│   │   ├── services/             # API client with auto-refresh + chat API
│   │   └── test/                 # 4 test files (29 tests)
│   └── package.json
│
├── backend/
│   ├── models/                   # SQLAlchemy models (User, RefreshToken, MoodEntry, SongPreference)
│   ├── schemas/                  # Pydantic v2 schemas with validation
│   ├── routes/                   # API routes (auth, mood, chat)
│   ├── services/
│   │   ├── auth_service.py       # JWT, bcrypt, token management
│   │   ├── llm_service.py        # Emotion analysis engine (3-provider fallback)
│   │   ├── ytmusic_service.py    # YouTube Music search + curation
│   │   ├── transcription_service.py  # Voice → text + prosodic features
│   │   ├── weather_service.py    # Location → weather context
│   │   └── mood_service.py       # Orchestrator + playlist reasoning
│   ├── middleware/               # Exception handlers, request logging
│   ├── tests/                    # 3 test files (39 tests)
│   ├── config.py                 # Settings from .env
│   ├── database.py               # Async DB engine + session
│   ├── main.py                   # App entry point
│   └── requirements.txt
│
└── README.md
```

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

# Voice Transcription (choose one or both)
DEEPGRAM_API_KEY=your-deepgram-key         # Free: 12,000 min/month
ASSEMBLYAI_API_KEY=your-assemblyai-key     # Free: 5 hours/month

# Weather (optional — enhances genre recommendations)
OPENWEATHERMAP_API_KEY=your-weather-key    # Free tier available
```

### 5. Run Tests

```bash
# Backend
cd backend && python3 -m pytest tests/ -v    # 39 tests

# Frontend
cd frontend && npx vitest run                # 29 tests
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
  ├─ First-time users → guided 3-step onboarding
  ├─ 🤖 AI Companion chatbot (floating bottom-right)
  └─ "Generate New Playlist" →

Analyze Page
  ├─ ✏️ Type It Out → text input + mood tags
  └─ 🎤 Say It Aloud → live mic recording + waveform → prosodic extraction → auto-transcribe
      └─ 📍 Weather context badge (if location enabled)
          ↓
Result Page
  ├─ Primary Emotion + Sub-emotion cards
  ├─ Confidence bar
  ├─ "Why this emotion?" — AI explanation (with prosodic cues if voice)
  ├─ 🎵 Recommended Genre (weather-influenced)
  ├─ 🌤 Weather context bar
  ├─ Emotional spectrum (6 dimensions)
  ├─ 🔗 Share Analysis
  └─ 🎭 Match / 🌟 Uplift → Customize → Generate
          ↓
Playlist Page
  ├─ 💿 Vinyl record player (spinning disc, tonearm, album art)
  ├─ 🎵 Now Playing: title, artist, progress bar
  ├─ ⏮ ⏸ ⏭ Transport controls
  ├─ 👍👎 Like/Dislike per track (RLHF)
  ├─ ✦ "Why this playlist?" — AI reasoning
  ├─ 🔗 Share Playlist · 💾 Save to Library
  └─ Track list with on-demand streaming

Mood History
  ├─ 📊 Confidence & Energy charts, Emotion distribution, Valence trends
  ├─ 🗓 Calendar heatmap (GitHub-style)
  ├─ 🕸 Emotion radar chart
  ├─ 🔥 Streak counter + animated stats
  └─ 📈 Week-over-week comparison
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
> This work has been published as a conference paper and extended into a research journal article. The system design is protected under patent filing.

<div align="center">

[![Conference Paper](https://img.shields.io/badge/📑_Conference_Paper-View_Publication-2563eb?style=for-the-badge)](https://ieeexplore.ieee.org/document/11465594)
&nbsp;&nbsp;
[![Research Journal](https://img.shields.io/badge/📄_Research_Journal-Read_Full_Paper-7c3aed?style=for-the-badge)](#)
&nbsp;&nbsp;
[![Patent](https://img.shields.io/badge/📋_Patent_Filing-View_Application-e11d48?style=for-the-badge)](#)

</div>

## 📄 License

This project is proprietary. All rights reserved.

The system design is patent-pending. See [Intellectual Property](#-intellectual-property) for details.

---

<div align="center">
  <sub>Built with ❤️ by the SONAR team</sub>
  <br/>
  <sub>🎵 Music that feels what you feel.</sub>
</div>
