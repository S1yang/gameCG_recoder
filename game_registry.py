# game_registry.py
import os
from dataclasses import dataclass
from typing import Dict, Optional, Any

import yaml


@dataclass
class GameProfile:
    key: str
    root: str
    title: str = ""
    window_title: str = ""


class GameRegistry:
    """
    管理 games/registry.yaml：
    - 列出 games
    - 设置 active
    - 增删改 game profile
    """
    def __init__(self, base_dir: str, registry_path: Optional[str] = None):
        self.base_dir = os.path.abspath(base_dir)
        self.registry_path = registry_path or os.path.join(self.base_dir, "games", "registry.yaml")

        self.data: Dict[str, Any] = {}
        self._load_or_create()

    def _load_or_create(self):
        os.makedirs(os.path.dirname(self.registry_path), exist_ok=True)
        if not os.path.isfile(self.registry_path):
            self.data = {"version": 1, "active": "", "games": {}}
            self._save()
            return

        with open(self.registry_path, "r", encoding="utf-8") as f:
            self.data = yaml.safe_load(f) or {}

        # normalize
        self.data.setdefault("version", 1)
        self.data.setdefault("active", "")
        self.data.setdefault("games", {})

        if not isinstance(self.data["games"], dict):
            self.data["games"] = {}

    def _save(self):
        with open(self.registry_path, "w", encoding="utf-8") as f:
            yaml.safe_dump(self.data, f, allow_unicode=True, sort_keys=False)

    def list_games(self) -> Dict[str, GameProfile]:
        out: Dict[str, GameProfile] = {}
        games = self.data.get("games", {}) or {}
        for key, cfg in games.items():
            cfg = cfg or {}
            out[key] = GameProfile(
                key=key,
                root=str(cfg.get("root", "")).strip(),
                title=str(cfg.get("title", "")).strip(),
                window_title=str(cfg.get("window_title", "")).strip(),
            )
        return out

    def get_active_key(self) -> str:
        return str(self.data.get("active", "")).strip()

    def set_active(self, key: str):
        games = self.data.get("games", {}) or {}
        if key not in games:
            raise KeyError(f"Game '{key}' not found in registry.")
        self.data["active"] = key
        self._save()

    def resolve_root(self, key: str) -> str:
        games = self.list_games()
        if key not in games:
            raise KeyError(f"Game '{key}' not found in registry.")
        root = games[key].root
        if not root:
            raise ValueError(f"Game '{key}' has empty root.")
        # root is relative to project base_dir
        abs_root = os.path.abspath(os.path.join(self.base_dir, root))
        return abs_root

    def resolve_active_root(self) -> str:
        key = self.get_active_key()
        if not key:
            raise ValueError("registry.active is empty. Please set an active game.")
        return self.resolve_root(key)

    def upsert_game(self, key: str, root: str, title: str = "", window_title: str = ""):
        key = key.strip()
        if not key:
            raise ValueError("Game key cannot be empty.")
        root = root.strip()
        if not root:
            raise ValueError("Game root cannot be empty.")

        self.data.setdefault("games", {})
        self.data["games"][key] = {
            "root": root,
            "title": title,
            "window_title": window_title,
        }
        # 如果还没 active，自动设为第一个
        if not self.data.get("active"):
            self.data["active"] = key
        self._save()

    def delete_game(self, key: str):
        games = self.data.get("games", {}) or {}
        if key in games:
            del games[key]
        self.data["games"] = games

        # active 被删了：回退到任意一个
        if self.data.get("active") == key:
            self.data["active"] = next(iter(games.keys()), "")
        self._save()
