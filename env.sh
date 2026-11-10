# Keeps every tool cache inside this project folder (SPEC section 3.8). Usage: source ./env.sh
export EARTH_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" && pwd)"
export npm_config_cache="$EARTH_ROOT/.cache/npm"
export PLAYWRIGHT_BROWSERS_PATH="$EARTH_ROOT/.cache/ms-playwright"
export UV_CACHE_DIR="$EARTH_ROOT/.cache/uv"
export UV_PYTHON_INSTALL_DIR="$EARTH_ROOT/.cache/uv-python"
export npm_config_update_notifier=false
export npm_config_fund=false
export npm_config_audit=false
