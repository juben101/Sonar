from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from database import engine, Base
from routes.auth import router as auth_router

# Create all tables
Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="Sonar API",
    description="AI-powered emotion-aware music platform",
    version="1.0.0",
)

# CORS — allow frontend dev server
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register routers
app.include_router(auth_router)


@app.get("/")
def root():
    return {"message": "Sonar API is running", "version": "1.0.0"}


@app.get("/health")
def health_check():
    return {"status": "healthy"}
