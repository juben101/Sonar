from logging.config import fileConfig
from sqlalchemy import pool, create_engine
from alembic import context
from config import get_settings

# Alembic Config object
config = context.config

# Logging
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# Import all models so metadata picks them up
from database import Base  # noqa: E402
from models.user import User  # noqa: E402, F401
from models.token import RefreshToken  # noqa: E402, F401

target_metadata = Base.metadata

# Override URL from settings
settings = get_settings()
db_url = settings.DATABASE_URL
# Alembic runs sync — use psycopg sync driver
if db_url.startswith("postgresql://"):
    db_url = db_url.replace("postgresql://", "postgresql+psycopg://", 1)


def run_migrations_offline() -> None:
    """Run migrations in 'offline' mode — generates SQL script."""
    context.configure(
        url=db_url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """Run migrations in 'online' mode — connects to DB directly."""
    connectable = create_engine(db_url, poolclass=pool.NullPool)

    with connectable.connect() as connection:
        context.configure(connection=connection, target_metadata=target_metadata)
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
