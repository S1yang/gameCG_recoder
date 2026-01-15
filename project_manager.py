# project_manager.py
import os
import sys
import subprocess
import tkinter as tk
from tkinter import ttk, messagebox, simpledialog

from game_registry import GameRegistry


class ProjectManagerApp(tk.Tk):
    def __init__(self):
        super().__init__()
        self.title("GalRec Project Manager")
        self.geometry("1100x680")

        self.base_dir = os.path.dirname(os.path.abspath(__file__))
        self.reg = GameRegistry(base_dir=self.base_dir)

        self._build_ui()
        self._reload_games()
        self._select_active_in_list()

    def _build_ui(self):
        self.columnconfigure(0, weight=0)
        self.columnconfigure(1, weight=1)
        self.rowconfigure(0, weight=1)

        left = ttk.Frame(self, padding=10)
        left.grid(row=0, column=0, sticky="ns")
        left.rowconfigure(1, weight=1)

        ttk.Label(left, text="Games", font=("Segoe UI", 12, "bold")).grid(row=0, column=0, sticky="w")

        self.lb = tk.Listbox(left, width=32, height=25)
        self.lb.grid(row=1, column=0, sticky="ns")
        self.lb.bind("<<ListboxSelect>>", self._on_select)

        btn_row = ttk.Frame(left)
        btn_row.grid(row=2, column=0, sticky="ew", pady=(10, 0))
        btn_row.columnconfigure(0, weight=1)
        btn_row.columnconfigure(1, weight=1)

        ttk.Button(btn_row, text="Set Active", command=self._set_active).grid(row=0, column=0, sticky="ew", padx=(0, 6))
        ttk.Button(btn_row, text="Open Editor", command=self._open_editor).grid(row=0, column=1, sticky="ew")

        btn_row2 = ttk.Frame(left)
        btn_row2.grid(row=3, column=0, sticky="ew", pady=(8, 0))
        btn_row2.columnconfigure(0, weight=1)
        btn_row2.columnconfigure(1, weight=1)

        ttk.Button(btn_row2, text="Run Recorder", command=self._run_recorder).grid(row=0, column=0, sticky="ew", padx=(0, 6))
        ttk.Button(btn_row2, text="Add / Delete", command=self._add_delete_menu).grid(row=0, column=1, sticky="ew")

        self.lbl_active = ttk.Label(left, text="Active: -")
        self.lbl_active.grid(row=4, column=0, sticky="w", pady=(10, 0))

        right = ttk.Frame(self, padding=10)
        right.grid(row=0, column=1, sticky="nsew")
        right.columnconfigure(0, weight=1)
        right.rowconfigure(1, weight=1)

        ttk.Label(right, text="Info", font=("Segoe UI", 12, "bold")).grid(row=0, column=0, sticky="w")

        self.txt = tk.Text(right, height=10)
        self.txt.grid(row=1, column=0, sticky="nsew")
        self.txt.configure(state="disabled")

    def _reload_games(self):
        self.games = self.reg.list_games()  # Dict[key -> GameProfile]
        keys = sorted(self.games.keys())
        self.lb.delete(0, tk.END)
        for k in keys:
            gp = self.games[k]
            title = gp.title or ""
            self.lb.insert(tk.END, f"{k}" + (f"  ({title})" if title else ""))

        active = self.reg.get_active_key()
        self.lbl_active.config(text=f"Active: {active or '-'}")

    def _select_active_in_list(self):
        active = self.reg.get_active_key()
        keys = sorted(self.games.keys())
        if active in keys:
            idx = keys.index(active)
            self.lb.selection_clear(0, tk.END)
            self.lb.selection_set(idx)
            self.lb.activate(idx)
            self._show_game_info(active)

    def _get_selected_key(self):
        sel = self.lb.curselection()
        if not sel:
            return None
        idx = sel[0]
        keys = sorted(self.games.keys())
        if idx < 0 or idx >= len(keys):
            return None
        return keys[idx]

    def _on_select(self, _evt=None):
        key = self._get_selected_key()
        if not key:
            return
        self._show_game_info(key)

    def _show_game_info(self, key: str):
        gp = self.games.get(key)
        if not gp:
            return
        active = self.reg.get_active_key()
        abs_root = self.reg.resolve_root(key)

        msg = (
            f"Key: {key}\n"
            f"Title: {gp.title}\n"
            f"WindowTitle: {gp.window_title}\n"
            f"Root(rel): {gp.root}\n"
            f"Root(abs): {abs_root}\n"
            f"Active: {'YES' if key == active else 'NO'}\n"
        )
        self.txt.configure(state="normal")
        self.txt.delete("1.0", tk.END)
        self.txt.insert(tk.END, msg)
        self.txt.configure(state="disabled")

    def _set_active(self):
        key = self._get_selected_key()
        if not key:
            messagebox.showwarning("No selection", "Select a game first.")
            return
        self.reg.set_active(key)
        self._reload_games()
        self._select_active_in_list()

    def _open_editor(self):
        # 直接启动独立进程：sequence_editor.py 会自动读 registry.active
        py = sys.executable
        path = os.path.join(self.base_dir, "sequence_editor.py")
        if not os.path.isfile(path):
            messagebox.showerror("Missing", f"Cannot find {path}")
            return
        subprocess.Popen([py, path], cwd=self.base_dir)

    def _run_recorder(self):
        # 启动独立进程：runner.py 会自动读 registry.active
        py = sys.executable
        path = os.path.join(self.base_dir, "runner.py")
        if not os.path.isfile(path):
            messagebox.showerror("Missing", f"Cannot find {path}")
            return
        subprocess.Popen([py, path], cwd=self.base_dir)

    def _add_delete_menu(self):
        # 一个简单的弹窗选择
        choice = simpledialog.askstring("Add/Delete", "Type 'add' or 'del':", parent=self)
        if not choice:
            return
        choice = choice.strip().lower()
        if choice == "add":
            self._add_game()
        elif choice in ("del", "delete"):
            self._delete_game()
        else:
            messagebox.showinfo("Info", "Please type 'add' or 'del'.")

    def _add_game(self):
        key = simpledialog.askstring("Add Game", "Game key (e.g. onmyoji):", parent=self)
        if not key:
            return
        key = key.strip()
        root = simpledialog.askstring("Add Game", "Root relpath (e.g. games/onmyoji):", parent=self)
        if not root:
            return
        root = root.strip()
        title = simpledialog.askstring("Add Game", "Title (optional):", parent=self) or ""
        window_title = simpledialog.askstring("Add Game", "Window title (optional):", parent=self) or ""

        try:
            self.reg.upsert_game(key=key, root=root, title=title, window_title=window_title)
            self._reload_games()
            self._select_active_in_list()
        except Exception as e:
            messagebox.showerror("Add Game Failed", str(e))

    def _delete_game(self):
        key = self._get_selected_key()
        if not key:
            messagebox.showwarning("No selection", "Select a game first.")
            return
        if not messagebox.askyesno("Confirm", f"Delete '{key}' from registry?\n(It will NOT delete folders)"):
            return
        try:
            self.reg.delete_game(key)
            self._reload_games()
            self._select_active_in_list()
        except Exception as e:
            messagebox.showerror("Delete Failed", str(e))


if __name__ == "__main__":
    app = ProjectManagerApp()
    app.mainloop()
