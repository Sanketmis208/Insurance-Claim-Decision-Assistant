from pydantic_settings import BaseSettings, SettingsConfigDict
from functools import lru_cache

class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
    )
    groq_api_key: str = ""
    app_title: str = "Insurance Claim Decision Assistant"
    app_version: str = "1.0.0"
    debug: bool = False
    log_level: str = "INFO"

@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()

settings = get_settings()