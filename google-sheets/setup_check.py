"""
Verifica conexão com as planilhas configuradas no .env.

Uso:
    python setup_check.py
"""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path

from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent
load_dotenv(BASE_DIR / ".env")

SHEETS = [
    ("Planilha 1", "SPREADSHEET_ID_1", "SPREADSHEET_GID_1"),
    ("Planilha 2", "SPREADSHEET_ID_2", "SPREADSHEET_GID_2"),
]


def main() -> int:
    print("=== Verificação Google Sheets API ===\n")

    creds_path = BASE_DIR / os.getenv("GOOGLE_CREDENTIALS_FILE", "credentials.json")
    if not creds_path.exists():
        print(f"[ERRO] Credenciais não encontradas: {creds_path}")
        return 1

    email = json.loads(creds_path.read_text(encoding="utf-8")).get("client_email", "")
    print(f"[OK] Conta de serviço: {email}\n")

    from sheets_client import get_worksheet, open_spreadsheet, worksheet_by_gid

    ok = True
    for label, id_key, gid_key in SHEETS:
        sheet_id = os.getenv(id_key, "").strip()
        gid = os.getenv(gid_key, "").strip()
        if not sheet_id:
            print(f"[SKIP] {label}: {id_key} não definido")
            continue

        try:
            spreadsheet = open_spreadsheet(sheet_id)
            ws = worksheet_by_gid(spreadsheet, gid) if gid else spreadsheet.sheet1
            rows = len(ws.get_all_values())
            print(f"[OK] {label}")
            print(f"     Título: {spreadsheet.title}")
            print(f"     Aba: {ws.title} (gid={ws.id})")
            print(f"     Linhas: {rows}\n")
        except Exception as exc:
            ok = False
            print(f"[ERRO] {label}: {exc}\n")

    if ok:
        print("Integração funcionando com as duas planilhas!")
        return 0

    print("Alguma planilha falhou. Verifique compartilhamento e IDs.")
    return 1


if __name__ == "__main__":
    sys.exit(main())
