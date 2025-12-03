"""Simple Flask backend for forwarding contact form messages to email.

The service expects SMTP credentials from environment variables:
- SMTP_HOST: SMTP server host
- SMTP_PORT: SMTP server port (default: 587)
- SMTP_USER: SMTP username / from address
- SMTP_PASSWORD: SMTP password or app token
- CONTACT_TO: Recipient email (defaults to SMTP_USER when unset)

Run locally:
    pip install -r requirements.txt
    flask --app server run --host=0.0.0.0 --port=5000
"""
from __future__ import annotations

import os
import smtplib
import ssl
from email.message import EmailMessage
from typing import Dict

from flask import Flask, jsonify, request

app = Flask(__name__)


class ConfigError(RuntimeError):
    """Raised when required email configuration is missing."""


def build_email_payload(data: Dict[str, str]) -> EmailMessage:
    name = data.get("name", "").strip() or "匿名"
    email = data.get("email", "").strip() or "未提供邮箱"
    message = data.get("message", "").strip()

    smtp_user = os.environ.get("SMTP_USER")
    recipient = os.environ.get("CONTACT_TO") or smtp_user
    subject = f"新的站内留言来自 {name}"

    if not message:
        raise ValueError("留言内容不能为空。")

    if not smtp_user or not recipient:
        raise ConfigError("缺少 SMTP_USER 或 CONTACT_TO 配置，无法发送邮件。")

    email_msg = EmailMessage()
    email_msg["Subject"] = subject
    email_msg["From"] = smtp_user
    email_msg["To"] = recipient
    email_msg.set_content(
        f"姓名 / Name: {name}\n"
        f"邮箱 / Email: {email}\n\n"
        f"留言 / Message:\n{message}\n"
    )
    return email_msg


def send_email(msg: EmailMessage) -> None:
    smtp_host = os.environ.get("SMTP_HOST")
    smtp_port = int(os.environ.get("SMTP_PORT", "587"))
    smtp_user = os.environ.get("SMTP_USER")
    smtp_password = os.environ.get("SMTP_PASSWORD")

    if not smtp_host or not smtp_user or not smtp_password:
        raise ConfigError("SMTP_HOST/SMTP_USER/SMTP_PASSWORD 配置缺失。")

    context = ssl.create_default_context()
    with smtplib.SMTP(smtp_host, smtp_port) as server:
        server.starttls(context=context)
        server.login(smtp_user, smtp_password)
        server.send_message(msg)


@app.route("/api/contact", methods=["POST"])
def contact():
    data = request.get_json(silent=True) or {}

    try:
        email_message = build_email_payload({
            "name": data.get("name", ""),
            "email": data.get("email", ""),
            "message": data.get("message", ""),
        })
        send_email(email_message)
    except (ValueError, ConfigError) as exc:
        return jsonify({"message": str(exc)}), 400
    except Exception:
        return jsonify({"message": "服务器发送邮件失败，请稍后再试。"}), 500

    return jsonify({"message": "留言已发送到站长邮箱，感谢你的分享！"})


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", 5000)))
