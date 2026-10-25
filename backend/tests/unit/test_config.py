"""Unit tests for `Settings`' prod-only JWT secret guard.

`SecuritySettings.jwt_secret` defaults to `"change-me"`, and `.env.example`
documents `change-me-to-a-long-random-string` as its placeholder — both
public in the repo. The guard refuses to construct a `Settings` with either
value (or anything under 32 chars) once `app_env == "prod"`, so a deployment
can't silently go live signing tokens with a secret anyone could read.
"""

from __future__ import annotations

import pytest
from pydantic import SecretStr, ValidationError

from app.core.config import SecuritySettings, Settings


def test_default_secret_is_fine_outside_prod() -> None:
    Settings(app_env="local")
    Settings(app_env="dev")
    Settings(app_env="staging")


def test_default_secret_rejected_in_prod() -> None:
    with pytest.raises(ValidationError, match="SECURITY_JWT_SECRET"):
        Settings(app_env="prod")


def test_documented_env_example_placeholder_rejected_in_prod() -> None:
    with pytest.raises(ValidationError, match="SECURITY_JWT_SECRET"):
        Settings(
            app_env="prod",
            security=SecuritySettings(jwt_secret=SecretStr("change-me-to-a-long-random-string")),
        )


def test_short_secret_rejected_in_prod() -> None:
    with pytest.raises(ValidationError, match="SECURITY_JWT_SECRET"):
        Settings(app_env="prod", security=SecuritySettings(jwt_secret=SecretStr("short")))


def test_real_secret_accepted_in_prod() -> None:
    real_secret = "a" * 32
    settings = Settings(
        app_env="prod", security=SecuritySettings(jwt_secret=SecretStr(real_secret))
    )
    assert settings.security.jwt_secret.get_secret_value() == real_secret
