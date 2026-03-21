"""Shared test fixtures and minimal constants for pipeline unit tests."""

import importlib.util
import sys
from pathlib import Path

_SCRIPTS_DIR = Path(__file__).parent.parent / "scripts"

# Make scripts/ importable in all tests (for constants.py which has no numeric prefix)
sys.path.insert(0, str(_SCRIPTS_DIR))

# Register numerically-prefixed scripts under their plain module names so tests
# can write `from fetch_ordinance import ...` instead of using importlib directly.
_SCRIPT_ALIASES: dict[str, str] = {
    "fetch_ordinance": "01_fetch_ordinance.py",
    "curate_and_merge": "03_curate_and_merge.py",
    "validate": "04_validate.py",
}

for _alias, _filename in _SCRIPT_ALIASES.items():
    if _alias not in sys.modules:
        _spec = importlib.util.spec_from_file_location(_alias, _SCRIPTS_DIR / _filename)
        assert _spec is not None and _spec.loader is not None
        _mod = importlib.util.module_from_spec(_spec)
        sys.modules[_alias] = _mod
        _spec.loader.exec_module(_mod)  # type: ignore[union-attr]

# Minimal zone mapping for unit tests — isolates tests from production constant changes
MINIMAL_ZONE_MAP: dict[str, list[str]] = {
    "B1": ["B1-1", "B1-2", "B1-3"],
    "B2": ["B2-1", "B2-2", "B2-3"],
    "RS-1": ["RS-1"],
    "M1": ["M1-1"],
}

# Minimal advocacy use list for unit tests
MINIMAL_ADVOCACY_USES: list[str] = [
    "daycare_center",
    "live_work_unit",
    "hair_salon_barbershop",
]
