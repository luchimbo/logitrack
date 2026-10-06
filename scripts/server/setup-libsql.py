"""Prepare the GeoModi libSQL service for the SSH user without sudo.

Run on pcmidi after installing the pinned sqld binary in ~/services/geomodi-libsql/bin.
Does not import data or expose the service outside localhost.
"""

import base64
import json
import os
from pathlib import Path
import time

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey


HOME = Path.home()
BASE = HOME / "services" / "geomodi-libsql"
KEYS = BASE / "keys"
UNITS = HOME / ".config" / "systemd" / "user"
SERVICE = UNITS / "geomodi-libsql.service"
TIMER_SERVICE = UNITS / "geomodi-libsql-backup.service"
TIMER = UNITS / "geomodi-libsql-backup.timer"


def write_private(path: Path, contents: bytes) -> None:
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, "wb") as output:
        output.write(contents)


def base64url(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).rstrip(b"=").decode("ascii")


def make_token(key: Ed25519PrivateKey, permission: str) -> str:
    header = base64url(json.dumps({"alg": "EdDSA", "typ": "JWT"}, separators=(",", ":")).encode())
    payload = base64url(json.dumps({"a": permission, "exp": int(time.time()) + 365 * 86400}, separators=(",", ":")).encode())
    signing_input = f"{header}.{payload}".encode("ascii")
    return f"{header}.{payload}.{base64url(key.sign(signing_input))}"


def main() -> None:
    for directory in (BASE, BASE / "bin", BASE / "data", KEYS, BASE / "backups"):
        directory.mkdir(parents=True, exist_ok=True)
        directory.chmod(0o700)
    UNITS.mkdir(parents=True, exist_ok=True)

    private_path = KEYS / "private.pem"
    public_path = KEYS / "public.pem"
    if private_path.exists():
        key = serialization.load_pem_private_key(private_path.read_bytes(), password=None)
    else:
        key = Ed25519PrivateKey.generate()
        write_private(
            private_path,
            key.private_bytes(
                encoding=serialization.Encoding.PEM,
                format=serialization.PrivateFormat.PKCS8,
                encryption_algorithm=serialization.NoEncryption(),
            ),
        )
    if not public_path.exists():
        write_private(
            public_path,
            key.public_key().public_bytes(
                encoding=serialization.Encoding.PEM,
                format=serialization.PublicFormat.SubjectPublicKeyInfo,
            ),
        )

    for permission, filename in (("rw", "app-rw.jwt"), ("ro", "portal-ro.jwt")):
        path = KEYS / filename
        if not path.exists():
            write_private(path, (make_token(key, permission) + "\n").encode("ascii"))

    SERVICE.write_text(
        f"""[Unit]
Description=GeoModi libSQL database
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory={BASE}
ExecStart={BASE}/bin/sqld --db-path {BASE}/data/geomodi.db --http-listen-addr 127.0.0.1:8088 --auth-jwt-key-file {public_path} --no-welcome
Restart=always
RestartSec=5
UMask=0077
NoNewPrivileges=true

[Install]
WantedBy=default.target
""",
        encoding="utf-8",
    )
    TIMER_SERVICE.write_text(
        f"""[Unit]
Description=Back up GeoModi libSQL database

[Service]
Type=oneshot
ExecStart={BASE}/backup-libsql.sh
""",
        encoding="utf-8",
    )
    TIMER.write_text(
        """[Unit]
Description=Nightly GeoModi libSQL backup

[Timer]
OnCalendar=*-*-* 03:15:00
Persistent=true
Unit=geomodi-libsql-backup.service

[Install]
WantedBy=timers.target
""",
        encoding="utf-8",
    )

    print(f"Prepared service, JWT keys, and backup timer under {BASE}")
    print("Tokens are stored only in the server keys directory; no data was imported.")


if __name__ == "__main__":
    main()
