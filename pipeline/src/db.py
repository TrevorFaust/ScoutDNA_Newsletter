from supabase import Client, create_client

from .config import require_env

_client: Client | None = None


def get_client() -> Client:
    global _client
    if _client is None:
        _client = create_client(
            require_env("SUPABASE_URL"),
            require_env("SUPABASE_SERVICE_ROLE_KEY"),
        )
    return _client
