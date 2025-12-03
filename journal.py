import json
import sqlite3
import hashlib
import base64
import secrets
import time
from http.server import HTTPServer, SimpleHTTPRequestHandler
from urllib.parse import urlparse, parse_qs
from pathlib import Path

DB_PATH = Path(__file__).parent / "garden.db"
PUBLIC_DIR = Path(__file__).parent / "public"
SESSIONS = {}
PUBLIC_MESSAGE_COOLDOWN = 12  # seconds between public messages per IP
LAST_PUBLIC_MESSAGE = {}
LOGIN_ATTEMPTS = {}
LOGIN_WINDOW = 60
LOGIN_MAX_ATTEMPTS = 8


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.scrypt(password.encode(), salt=salt, n=2 ** 14, r=8, p=1)
    return f"{base64.b64encode(salt).decode()}:{base64.b64encode(digest).decode()}"


def verify_password(password: str, stored: str) -> bool:
    try:
        salt_b64, hash_b64 = stored.split(":")
        salt = base64.b64decode(salt_b64)
        expected = base64.b64decode(hash_b64)
        digest = hashlib.scrypt(password.encode(), salt=salt, n=2 ** 14, r=8, p=1)
        return secrets.compare_digest(digest, expected)
    except Exception:
        return False


def init_db():
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE,
            role TEXT,
            password_hash TEXT,
            registration_ip TEXT,
            last_login_ip TEXT,
            last_login_at DATETIME,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
        """
    )
    cur.execute("PRAGMA table_info(users)")
    columns = {row[1] for row in cur.fetchall()}
    if "registration_ip" not in columns:
        cur.execute("ALTER TABLE users ADD COLUMN registration_ip TEXT")
    if "last_login_ip" not in columns:
        cur.execute("ALTER TABLE users ADD COLUMN last_login_ip TEXT")
    if "last_login_at" not in columns:
        cur.execute("ALTER TABLE users ADD COLUMN last_login_at DATETIME")
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS diaries (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            author_name TEXT,
            title TEXT,
            content TEXT,
            is_public INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
        """
    )
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS messages_public (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nickname TEXT,
            content TEXT,
            is_hidden INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
        """
    )
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS messages_private (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            from_name TEXT,
            to_name TEXT,
            content TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
        """
    )
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS messages_user (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT,
            content TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
        """
    )
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT
        )
        """
    )

    # Seed admin user if missing
    cur.execute("SELECT id FROM users WHERE username=?", ("admin",))
    if not cur.fetchone():
        cur.execute(
            "INSERT INTO users (username, role, password_hash, registration_ip) VALUES (?, ?, ?, ?)",
            ("admin", "admin", hash_password("garden-admin"), "system"),
        )

    # Seed shared secret password
    cur.execute("SELECT value FROM settings WHERE key=?", ("secret_password",))
    if not cur.fetchone():
        cur.execute(
            "INSERT INTO settings (key, value) VALUES (?, ?)",
            ("secret_password", hash_password("moonlight")),
        )

    # Seed sample diaries if empty
    cur.execute("SELECT COUNT(*) FROM diaries")
    if cur.fetchone()[0] == 0:
        sample = [
            (
                "Yingxue",
                "月光洒在篱笆上",
                "今天的风很轻，我把想念写在纸上，塞进了花园的树洞里。",
                1,
            ),
            (
                "Xxxx",
                "小径旁的萤火",
                "我们约好在这里见面，星星也在偷听。",
                1,
            ),
            (
                "Yingxue",
                "对你说的晚安",
                "夜色很深，但想你的心却很亮。",
                0,
            ),
        ]
        cur.executemany(
            "INSERT INTO diaries (author_name, title, content, is_public) VALUES (?, ?, ?, ?)",
            sample,
        )

    conn.commit()
    conn.close()


def make_token(role: str, username: str = "") -> str:
    token = secrets.token_urlsafe(24)
    SESSIONS[token] = {
        "role": role,
        "username": username,
        "created": time.time(),
    }
    return token


def require_token(headers, role=None):
    auth = headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        return None
    token = auth.split(" ", 1)[1]
    data = SESSIONS.get(token)
    if not data:
        return None
    if role and data.get("role") != role:
        return None
    return {**data, "token": token}


def check_login_window(ip: str, key: str):
    now = time.time()
    attempts = LOGIN_ATTEMPTS.get((ip, key), [])
    attempts = [t for t in attempts if now - t < LOGIN_WINDOW]
    if len(attempts) >= LOGIN_MAX_ATTEMPTS:
        LOGIN_ATTEMPTS[(ip, key)] = attempts
        return False
    attempts.append(now)
    LOGIN_ATTEMPTS[(ip, key)] = attempts
    return True


class GardenHandler(SimpleHTTPRequestHandler):
    def translate_path(self, path):
        """Serve files from the /public directory instead of CWD."""
        rel_path = urlparse(path).path.lstrip("/")
        if not rel_path:
            rel_path = "index.html"
        target = (PUBLIC_DIR / rel_path).resolve()
        return str(target)

    def end_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(200)
        self.end_headers()

    def do_GET(self):
        parsed = urlparse(self.path)
        if parsed.path.startswith("/api/"):
            return self.handle_api("GET", parsed)
        return super().do_GET()

    def do_POST(self):
        parsed = urlparse(self.path)
        if parsed.path.startswith("/api/"):
            return self.handle_api("POST", parsed)
        return super().do_POST()

    def do_PUT(self):
        parsed = urlparse(self.path)
        if parsed.path.startswith("/api/"):
            return self.handle_api("PUT", parsed)
        self.send_error(405)

    def do_DELETE(self):
        parsed = urlparse(self.path)
        if parsed.path.startswith("/api/"):
            return self.handle_api("DELETE", parsed)
        self.send_error(405)

    def json_body(self):
        length = int(self.headers.get("Content-Length", 0))
        if length == 0:
            return {}
        data = self.rfile.read(length)
        try:
            return json.loads(data.decode())
        except json.JSONDecodeError:
            return {}

    def send_json(self, data, status=200):
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.end_headers()
        self.wfile.write(json.dumps(data).encode())

    def handle_api(self, method, parsed):
        path = parsed.path
        try:
            if path == "/api/public/diaries" and method == "GET":
                return self.api_public_diaries()
            if path == "/api/public/messages" and method == "GET":
                return self.api_public_messages()
            if path == "/api/public/messages" and method == "POST":
                return self.api_post_public_message()
            if path == "/api/public/user-messages" and method == "GET":
                return self.api_public_user_messages()
            if path == "/api/auth/register" and method == "POST":
                return self.api_auth_register()
            if path == "/api/auth/login" and method == "POST":
                return self.api_auth_login()
            if path == "/api/auth/me" and method == "GET":
                return self.api_auth_me()
            if path == "/api/auth/summary" and method == "GET":
                return self.api_auth_summary()
            if path == "/api/secret/diaries" and method == "GET":
                return self.api_secret_diaries()
            if path == "/api/secret/diaries" and method == "POST":
                return self.api_secret_create_diary()
            if path.startswith("/api/secret/diaries/") and method == "PUT":
                return self.api_secret_update_diary(path)
            if path.startswith("/api/secret/diaries/") and method == "DELETE":
                return self.api_secret_delete_diary(path)
            if path == "/api/secret/messages" and method == "GET":
                return self.api_secret_messages()
            if path == "/api/secret/messages" and method == "POST":
                return self.api_secret_post_message()
            if path == "/api/secret/user-messages" and method == "POST":
                return self.api_secret_post_user_message()
            if path == "/api/admin/login" and method == "POST":
                return self.api_admin_login()
            if path == "/api/admin/summary" and method == "GET":
                return self.api_admin_summary()
            if path == "/api/admin/diaries" and method == "GET":
                return self.api_admin_diaries()
            if path.startswith("/api/admin/diaries/") and method == "PUT":
                return self.api_admin_toggle_public(path)
            if path == "/api/admin/messages/public" and method == "GET":
                return self.api_admin_messages_public()
            if path == "/api/admin/messages/private" and method == "GET":
                return self.api_admin_messages_private()
            if path.startswith("/api/admin/messages/public/") and method == "PUT":
                return self.api_admin_update_public_message(path)
            if path.startswith("/api/admin/messages/public/") and method == "DELETE":
                return self.api_admin_delete_public_message(path)
            if path.startswith("/api/admin/messages/private/") and method == "DELETE":
                return self.api_admin_delete_private_message(path)
            if path == "/api/admin/users" and method == "GET":
                return self.api_admin_users()
            return self.send_json({"error": "Not found"}, 404)
        except Exception as exc:  # pragma: no cover - logging omitted for brevity
            self.send_json({"error": "Server error", "detail": str(exc)}, 500)

    # --- Public endpoints
    def api_public_diaries(self):
        conn = sqlite3.connect(DB_PATH)
        cur = conn.cursor()
        cur.execute(
            "SELECT id, author_name, title, content, created_at FROM diaries WHERE is_public=1 ORDER BY created_at DESC LIMIT 6"
        )
        diaries = [
            {
                "id": row[0],
                "author": row[1],
                "title": row[2],
                "excerpt": (row[3] or "")[:120],
                "created_at": row[4],
            }
            for row in cur.fetchall()
        ]
        conn.close()
        self.send_json({"items": diaries})

    def api_public_messages(self):
        conn = sqlite3.connect(DB_PATH)
        cur = conn.cursor()
        cur.execute(
            "SELECT id, nickname, content, created_at FROM messages_public WHERE is_hidden=0 ORDER BY created_at DESC LIMIT 50"
        )
        messages = [
            {"id": row[0], "nickname": row[1] or "匿名", "content": row[2], "created_at": row[3]}
            for row in cur.fetchall()
        ]
        conn.close()
        self.send_json({"items": messages})

    def api_public_user_messages(self):
        conn = sqlite3.connect(DB_PATH)
        cur = conn.cursor()
        cur.execute(
            """
            SELECT id, username, content, created_at
            FROM messages_user
            ORDER BY created_at DESC
            LIMIT 80
            """
        )
        items = [
            {"id": row[0], "username": row[1], "content": row[2], "created_at": row[3]}
            for row in cur.fetchall()
        ]
        conn.close()
        self.send_json({"items": items})

    def api_post_public_message(self):
        ip = self.client_address[0]
        now = time.time()
        if ip in LAST_PUBLIC_MESSAGE and now - LAST_PUBLIC_MESSAGE[ip] < PUBLIC_MESSAGE_COOLDOWN:
            return self.send_json({"error": "留言太快啦，稍等一下下。"}, 429)

        data = self.json_body()
        nickname = (data.get("nickname") or "匿名").strip()[:24]
        content = (data.get("content") or "").strip()
        if not content or len(content) > 260:
            return self.send_json({"error": "内容不能为空，且不超过260字"}, 400)
        safe_content = content.replace("<", "&lt;").replace(">", "&gt;")
        conn = sqlite3.connect(DB_PATH)
        cur = conn.cursor()
        cur.execute(
            "INSERT INTO messages_public (nickname, content) VALUES (?, ?)",
            (nickname, safe_content),
        )
        conn.commit()
        conn.close()
        LAST_PUBLIC_MESSAGE[ip] = now
        self.send_json({"message": "感谢你的轻声留言"}, 201)

    # --- Auth endpoints
    def api_auth_register(self):
        ip = self.client_address[0]
        if not check_login_window(ip, "register"):
            return self.send_json({"error": "尝试过于频繁，请稍后再试"}, 429)
        data = self.json_body()
        username = (data.get("username") or "").strip()
        password = data.get("password") or ""
        confirm = data.get("confirm_password") or ""
        if len(username) < 3 or len(password) < 6:
            return self.send_json({"error": "用户名至少3个字符，密码至少6位"}, 400)
        if password != confirm:
            return self.send_json({"error": "两次输入的密码不一致"}, 400)
        conn = sqlite3.connect(DB_PATH)
        cur = conn.cursor()
        try:
            cur.execute(
                "INSERT INTO users (username, role, password_hash, registration_ip) VALUES (?, ?, ?, ?)",
                (username, "user", hash_password(password), ip),
            )
            conn.commit()
        except sqlite3.IntegrityError:
            conn.close()
            return self.send_json({"error": "用户名已存在"}, 409)
        conn.close()
        token = make_token("user", username)
        self.send_json({"token": token, "username": username}, 201)

    def api_auth_login(self):
        ip = self.client_address[0]
        if not check_login_window(ip, "login"):
            return self.send_json({"error": "尝试太多，请稍后重试"}, 429)
        data = self.json_body()
        username = data.get("username", "")
        password = data.get("password", "")
        conn = sqlite3.connect(DB_PATH)
        cur = conn.cursor()
        cur.execute(
            "SELECT id, password_hash FROM users WHERE username=? AND role!='admin'",
            (username,),
        )
        row = cur.fetchone()
        if not row or not verify_password(password, row[1]):
            conn.close()
            return self.send_json({"error": "账号或密码错误"}, 401)
        cur.execute(
            "UPDATE users SET last_login_ip=?, last_login_at=CURRENT_TIMESTAMP WHERE id=?",
            (ip, row[0]),
        )
        conn.commit()
        conn.close()
        token = make_token("user", username)
        self.send_json({"token": token, "username": username})

    def api_auth_me(self):
        session = require_token(self.headers, role="user")
        if not session:
            return self.send_json({"error": "未登录"}, 401)
        conn = sqlite3.connect(DB_PATH)
        cur = conn.cursor()
        cur.execute(
            "SELECT username, created_at, registration_ip, last_login_ip, last_login_at FROM users WHERE username=?",
            (session["username"],),
        )
        row = cur.fetchone()
        if not row or not verify_password(password, row[1]):
            conn.close()
            return self.send_json({"error": "账号或密码错误"}, 401)
        cur.execute(
            "UPDATE users SET last_login_ip=?, last_login_at=CURRENT_TIMESTAMP WHERE id=?",
            (ip, row[0]),
        )
        conn.commit()
        conn.close()
        if not row:
            return self.send_json({"error": "未找到用户"}, 404)
        self.send_json(
            {
                "username": row[0],
                "created_at": row[1],
                "registration_ip": row[2] or "",
                "last_login_ip": row[3] or "",
                "last_login_at": row[4] or "",
            }
        )

    def api_auth_summary(self):
        if not require_token(self.headers, role="user"):
            return self.send_json({"error": "未登录"}, 401)
        conn = sqlite3.connect(DB_PATH)
        cur = conn.cursor()
        cur.execute("SELECT COUNT(*) FROM users WHERE role!='admin'")
        user_count = cur.fetchone()[0]
        cur.execute("SELECT COUNT(DISTINCT author_name) FROM diaries")
        poster_count = cur.fetchone()[0]
        cur.execute("SELECT COUNT(*) FROM messages_user")
        user_messages = cur.fetchone()[0]
        conn.close()
        self.send_json(
            {
                "user_count": user_count,
                "poster_count": poster_count,
                "user_messages": user_messages,
            }
        )

    # --- Secret zone
    def api_secret_diaries(self):
        session = require_token(self.headers, role="user")
        if not session:
            return self.send_json({"error": "未登录"}, 401)
        conn = sqlite3.connect(DB_PATH)
        cur = conn.cursor()
        cur.execute(
            """
            SELECT id, author_name, title, content, is_public, created_at
            FROM diaries
            WHERE author_name=?
            ORDER BY created_at DESC
            """,
            (session["username"],),
        )
        items = [
            {
                "id": row[0],
                "author": row[1],
                "title": row[2],
                "content": row[3],
                "is_public": bool(row[4]),
                "created_at": row[5],
                "can_edit": row[1] == session["username"],
            }
            for row in cur.fetchall()
        ]
        conn.close()
        self.send_json({"items": items})

    def api_secret_create_diary(self):
        session = require_token(self.headers, role="user")
        if not session:
            return self.send_json({"error": "未登录"}, 401)
        data = self.json_body()
        author = session["username"]
        title = (data.get("title") or "无题").strip()[:80]
        content = (data.get("content") or "").strip()
        is_public = 1 if data.get("is_public") else 0
        if not content:
            return self.send_json({"error": "内容不能为空"}, 400)
        conn = sqlite3.connect(DB_PATH)
        cur = conn.cursor()
        cur.execute(
            "INSERT INTO diaries (author_name, title, content, is_public) VALUES (?, ?, ?, ?)",
            (author, title, content, is_public),
        )
        conn.commit()
        conn.close()
        self.send_json({"message": "已种下一朵花"}, 201)

    def api_secret_update_diary(self, path):
        session = require_token(self.headers, role="user")
        if not session:
            return self.send_json({"error": "未登录"}, 401)
        diary_id = path.rsplit("/", 1)[-1]
        conn = sqlite3.connect(DB_PATH)
        cur = conn.cursor()
        cur.execute("SELECT author_name, title, content FROM diaries WHERE id=?", (diary_id,))
        owner = cur.fetchone()
        if not owner:
            conn.close()
            return self.send_json({"error": "未找到日记"}, 404)
        if owner[0] != session["username"]:
            conn.close()
            return self.send_json({"error": "无权编辑他人日记"}, 403)
        data = self.json_body()
        current_title = owner[1] or "无题"
        current_content = owner[2] or ""
        new_title = (data.get("title") or current_title).strip()[:80]
        new_content = (data.get("content") or current_content).strip()
        cur.execute(
            "UPDATE diaries SET title=?, content=?, is_public=?, updated_at=CURRENT_TIMESTAMP WHERE id=?",
            (
                new_title or "无题",
                new_content,
                1 if data.get("is_public") else 0,
                diary_id,
            ),
        )
        conn.commit()
        conn.close()
        self.send_json({"message": "日记已更新"})

    def api_secret_delete_diary(self, path):
        session = require_token(self.headers, role="user")
        if not session:
            return self.send_json({"error": "未登录"}, 401)
        diary_id = path.rsplit("/", 1)[-1]
        conn = sqlite3.connect(DB_PATH)
        cur = conn.cursor()
        cur.execute("SELECT author_name FROM diaries WHERE id=?", (diary_id,))
        owner = cur.fetchone()
        if not owner:
            conn.close()
            return self.send_json({"error": "未找到日记"}, 404)
        if owner[0] != session["username"]:
            conn.close()
            return self.send_json({"error": "无权删除他人日记"}, 403)
        cur.execute("DELETE FROM diaries WHERE id=?", (diary_id,))
        conn.commit()
        conn.close()
        self.send_json({"message": "删除完成"})

    def api_secret_messages(self):
        session = require_token(self.headers, role="user")
        if not session:
            return self.send_json({"error": "未登录"}, 401)
        conn = sqlite3.connect(DB_PATH)
        cur = conn.cursor()
        cur.execute(
            """
            SELECT id, from_name, to_name, content, created_at
            FROM messages_private
            WHERE from_name=? OR to_name=?
            ORDER BY created_at DESC
            LIMIT 80
            """,
            (session["username"], session["username"]),
        )
        items = [
            {
                "id": row[0],
                "from_name": row[1],
                "to_name": row[2],
                "content": row[3],
                "created_at": row[4],
            }
            for row in cur.fetchall()
        ]
        conn.close()
        self.send_json({"items": items})

    def api_secret_post_message(self):
        session = require_token(self.headers, role="user")
        if not session:
            return self.send_json({"error": "未登录"}, 401)
        data = self.json_body()
        from_name = session["username"]
        to_name = (data.get("to_name") or "你").strip()[:20]
        content = (data.get("content") or "").strip()
        if not content or len(content) > 300:
            return self.send_json({"error": "小纸条不能为空，且不超过300字"}, 400)
        conn = sqlite3.connect(DB_PATH)
        cur = conn.cursor()
        cur.execute("SELECT 1 FROM users WHERE username=?", (to_name,))
        if not cur.fetchone():
            conn.close()
            return self.send_json({"error": "只允许给已注册用户发送站内信"}, 400)
        cur.execute(
            "INSERT INTO messages_private (from_name, to_name, content) VALUES (?, ?, ?)",
            (from_name, to_name, content),
        )
        conn.commit()
        conn.close()
        self.send_json({"message": "纸条送达"}, 201)

    def api_secret_post_user_message(self):
        session = require_token(self.headers, role="user")
        if not session:
            return self.send_json({"error": "未登录"}, 401)
        data = self.json_body()
        content = (data.get("content") or "").strip()
        if not content or len(content) > 260:
            return self.send_json({"error": "留言不能为空，且不超过260字"}, 400)
        safe_content = content.replace("<", "&lt;").replace(">", "&gt;")
        conn = sqlite3.connect(DB_PATH)
        cur = conn.cursor()
        cur.execute(
            "INSERT INTO messages_user (username, content) VALUES (?, ?)",
            (session["username"], safe_content),
        )
        conn.commit()
        conn.close()
        self.send_json({"message": "留言已发布到游客区"}, 201)

    # --- Admin endpoints
    def api_admin_login(self):
        ip = self.client_address[0]
        if not check_login_window(ip, "admin_login"):
            return self.send_json({"error": "尝试太多，请稍后再试"}, 429)
        data = self.json_body()
        username = data.get("username", "")
        password = data.get("password", "")
        conn = sqlite3.connect(DB_PATH)
        cur = conn.cursor()
        cur.execute("SELECT password_hash FROM users WHERE username=? AND role='admin'", (username,))
        row = cur.fetchone()
        conn.close()
        if not row or not verify_password(password, row[0]):
            return self.send_json({"error": "账号或密码错误"}, 401)
        token = make_token("admin", username)
        self.send_json({"token": token})

    def api_admin_summary(self):
        if not require_token(self.headers, role="admin"):
            return self.send_json({"error": "未授权"}, 401)
        conn = sqlite3.connect(DB_PATH)
        cur = conn.cursor()
        cur.execute("SELECT COUNT(*), SUM(is_public) FROM diaries")
        total, public_count = cur.fetchone()
        cur.execute("SELECT COUNT(*) FROM messages_public")
        public_msgs = cur.fetchone()[0]
        cur.execute("SELECT COUNT(*) FROM messages_private")
        private_msgs = cur.fetchone()[0]
        conn.close()
        self.send_json(
            {
                "diary_total": total or 0,
                "diary_public": public_count or 0,
                "messages_public": public_msgs,
                "messages_private": private_msgs,
            }
        )

    def api_admin_diaries(self):
        if not require_token(self.headers, role="admin"):
            return self.send_json({"error": "未授权"}, 401)
        conn = sqlite3.connect(DB_PATH)
        cur = conn.cursor()
        cur.execute(
            "SELECT id, author_name, title, content, is_public, created_at FROM diaries ORDER BY created_at DESC"
        )
        items = [
            {
                "id": row[0],
                "author": row[1],
                "title": row[2],
                "content": row[3],
                "is_public": bool(row[4]),
                "created_at": row[5],
            }
            for row in cur.fetchall()
        ]
        conn.close()
        self.send_json({"items": items})

    def api_admin_toggle_public(self, path):
        if not require_token(self.headers, role="admin"):
            return self.send_json({"error": "未授权"}, 401)
        diary_id = path.rsplit("/", 1)[-1]
        data = self.json_body()
        conn = sqlite3.connect(DB_PATH)
        cur = conn.cursor()
        cur.execute(
            "UPDATE diaries SET is_public=?, updated_at=CURRENT_TIMESTAMP WHERE id=?",
            (1 if data.get("is_public") else 0, diary_id),
        )
        conn.commit()
        conn.close()
        self.send_json({"message": "状态已更新"})

    def api_admin_delete_public_message(self, path):
        if not require_token(self.headers, role="admin"):
            return self.send_json({"error": "未授权"}, 401)
        msg_id = path.rsplit("/", 1)[-1]
        conn = sqlite3.connect(DB_PATH)
        cur = conn.cursor()
        cur.execute("DELETE FROM messages_public WHERE id=?", (msg_id,))
        conn.commit()
        conn.close()
        self.send_json({"message": "已删除留言"})

    def api_admin_delete_private_message(self, path):
        if not require_token(self.headers, role="admin"):
            return self.send_json({"error": "未授权"}, 401)
        msg_id = path.rsplit("/", 1)[-1]
        conn = sqlite3.connect(DB_PATH)
        cur = conn.cursor()
        cur.execute("DELETE FROM messages_private WHERE id=?", (msg_id,))
        conn.commit()
        conn.close()
        self.send_json({"message": "已删除纸条"})

    def api_admin_messages_public(self):
        if not require_token(self.headers, role="admin"):
            return self.send_json({"error": "未授权"}, 401)
        conn = sqlite3.connect(DB_PATH)
        cur = conn.cursor()
        cur.execute(
            "SELECT id, nickname, content, is_hidden, created_at FROM messages_public ORDER BY created_at DESC LIMIT 100"
        )
        items = [
            {
                "id": row[0],
                "nickname": row[1] or "匿名",
                "content": row[2],
                "is_hidden": bool(row[3]),
                "created_at": row[4],
            }
            for row in cur.fetchall()
        ]
        conn.close()
        self.send_json({"items": items})

    def api_admin_update_public_message(self, path):
        if not require_token(self.headers, role="admin"):
            return self.send_json({"error": "未授权"}, 401)
        msg_id = path.rsplit("/", 1)[-1]
        data = self.json_body()
        conn = sqlite3.connect(DB_PATH)
        cur = conn.cursor()
        cur.execute(
            "UPDATE messages_public SET is_hidden=? WHERE id=?",
            (1 if data.get("is_hidden") else 0, msg_id),
        )
        conn.commit()
        conn.close()
        self.send_json({"message": "状态已更新"})

    def api_admin_messages_private(self):
        if not require_token(self.headers, role="admin"):
            return self.send_json({"error": "未授权"}, 401)
        conn = sqlite3.connect(DB_PATH)
        cur = conn.cursor()
        cur.execute(
            "SELECT id, from_name, to_name, content, created_at FROM messages_private ORDER BY created_at DESC LIMIT 120"
        )
        items = [
            {
                "id": row[0],
                "from_name": row[1],
                "to_name": row[2],
                "content": row[3],
                "created_at": row[4],
            }
            for row in cur.fetchall()
        ]
        conn.close()
        self.send_json({"items": items})

    def api_admin_users(self):
        if not require_token(self.headers, role="admin"):
            return self.send_json({"error": "未授权"}, 401)
        conn = sqlite3.connect(DB_PATH)
        cur = conn.cursor()
        cur.execute(
            "SELECT username, role, registration_ip, created_at, last_login_ip, last_login_at FROM users ORDER BY created_at DESC"
        )
        items = [
            {
                "username": row[0],
                "role": row[1],
                "registration_ip": row[2] or "",
                "created_at": row[3],
                "last_login_ip": row[4] or "",
                "last_login_at": row[5] or "",
            }
            for row in cur.fetchall()
        ]
        conn.close()
        self.send_json({"items": items})


def run():
    init_db()
    server = HTTPServer(("0.0.0.0", 8000), GardenHandler)
    print("Secret Garden running at http://localhost:8000")
    server.serve_forever()


if __name__ == "__main__":
    run()
