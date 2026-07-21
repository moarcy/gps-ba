"""
Cliente para ler e escrever planilhas no Google Sheets via API.

Requisitos:
1. Projeto no Google Cloud com Google Sheets API habilitada
2. Conta de serviço + arquivo JSON de credenciais
3. Planilha compartilhada com o e-mail da conta de serviço (Editor)
"""

from __future__ import annotations

import os
from pathlib import Path
from typing import Any

import gspread
from dotenv import load_dotenv
from google.oauth2.service_account import Credentials

SCOPES = [
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/drive.readonly",
]

BASE_DIR = Path(__file__).resolve().parent


def _load_env() -> None:
    load_dotenv(BASE_DIR / ".env")


def get_credentials(credentials_file: str | None = None) -> Credentials:
    _load_env()
    path = credentials_file or os.getenv("GOOGLE_CREDENTIALS_FILE", "credentials.json")
    credentials_path = Path(path)
    if not credentials_path.is_absolute():
        credentials_path = BASE_DIR / credentials_path

    if not credentials_path.exists():
        raise FileNotFoundError(
            f"Arquivo de credenciais não encontrado: {credentials_path}\n"
            "Baixe o JSON da conta de serviço no Google Cloud Console "
            "e salve como credentials.json nesta pasta."
        )

    return Credentials.from_service_account_file(str(credentials_path), scopes=SCOPES)


def get_client(credentials_file: str | None = None) -> gspread.Client:
    credentials = get_credentials(credentials_file)
    return gspread.authorize(credentials)


def worksheet_by_gid(spreadsheet: gspread.Spreadsheet, gid: int | str) -> gspread.Worksheet:
    gid_int = int(gid)
    for worksheet in spreadsheet.worksheets():
        if worksheet.id == gid_int:
            return worksheet
    raise ValueError(f"Aba com gid={gid_int} não encontrada na planilha '{spreadsheet.title}'")


def open_spreadsheet(
    spreadsheet_id: str | None = None,
    credentials_file: str | None = None,
) -> gspread.Spreadsheet:
    _load_env()
    sheet_id = spreadsheet_id or os.getenv("SPREADSHEET_ID")
    if not sheet_id:
        raise ValueError(
            "Informe spreadsheet_id ou defina SPREADSHEET_ID no arquivo .env"
        )

    client = get_client(credentials_file)
    return client.open_by_key(sheet_id)


def get_worksheet(
    sheet_name: str | None = None,
    spreadsheet_id: str | None = None,
    sheet_gid: int | str | None = None,
    credentials_file: str | None = None,
) -> gspread.Worksheet:
    _load_env()
    name = sheet_name or os.getenv("SHEET_NAME") or None
    spreadsheet = open_spreadsheet(spreadsheet_id, credentials_file)

    if sheet_gid is not None:
        return worksheet_by_gid(spreadsheet, sheet_gid)
    if name:
        return spreadsheet.worksheet(name)
    return spreadsheet.sheet1


def read_all(
    sheet_name: str | None = None,
    spreadsheet_id: str | None = None,
) -> list[list[Any]]:
    worksheet = get_worksheet(sheet_name, spreadsheet_id)
    return worksheet.get_all_values()


def read_range(
    range_notation: str,
    sheet_name: str | None = None,
    spreadsheet_id: str | None = None,
) -> list[list[Any]]:
    worksheet = get_worksheet(sheet_name, spreadsheet_id)
    return worksheet.get(range_notation)


def write_cell(
    cell: str,
    value: Any,
    sheet_name: str | None = None,
    spreadsheet_id: str | None = None,
) -> None:
    worksheet = get_worksheet(sheet_name, spreadsheet_id)
    worksheet.update_acell(cell, value)


def write_range(
    range_notation: str,
    values: list[list[Any]],
    sheet_name: str | None = None,
    spreadsheet_id: str | None = None,
) -> None:
    worksheet = get_worksheet(sheet_name, spreadsheet_id)
    worksheet.update(range_notation, values)


def append_rows(
    rows: list[list[Any]],
    sheet_name: str | None = None,
    spreadsheet_id: str | None = None,
) -> None:
    worksheet = get_worksheet(sheet_name, spreadsheet_id)
    worksheet.append_rows(rows, value_input_option="USER_ENTERED")
