"""Инициализация Firebase Admin SDK.

Учётные данные ищутся в порядке:
1. переменная окружения GOOGLE_APPLICATION_CREDENTIALS;
2. файл backend/firebase/serviceAccount.json.

Если учётных данных нет, возвращается None — приложение прозрачно
переключается на локальное JSON-хранилище (см. database/store.py),
что позволяет разрабатывать и демонстрировать проект без Firebase.
"""
from __future__ import annotations

import logging
import os
from pathlib import Path
from typing import Optional

logger = logging.getLogger(__name__)

_SERVICE_ACCOUNT = Path(__file__).parent / "serviceAccount.json"


def init_firestore() -> Optional["object"]:
    """Вернуть клиент Firestore либо None, если Firebase не настроен."""
    try:
        import firebase_admin
        from firebase_admin import credentials, firestore
    except ImportError:
        logger.warning("firebase-admin не установлен — локальное хранилище")
        return None

    try:
        if firebase_admin._apps:  # уже инициализировано
            return firestore.client()

        if os.environ.get("GOOGLE_APPLICATION_CREDENTIALS"):
            cred = credentials.ApplicationDefault()
        elif _SERVICE_ACCOUNT.exists():
            cred = credentials.Certificate(str(_SERVICE_ACCOUNT))
        else:
            logger.info(
                "Firebase credentials не найдены (%s) — локальное хранилище",
                _SERVICE_ACCOUNT,
            )
            return None

        firebase_admin.initialize_app(cred)
        logger.info("Firebase Firestore подключён")
        return firestore.client()
    except Exception as exc:  # noqa: BLE001 — деградируем в локальный режим
        logger.warning("Firebase недоступен (%s) — локальное хранилище", exc)
        return None
