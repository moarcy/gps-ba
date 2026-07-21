"""
Exemplos de leitura e escrita na planilha configurada no .env.

Uso:
    python example_usage.py
"""

from sheets_client import append_rows, read_all, write_cell, write_range


def main() -> None:
    print("Lendo planilha...")
    data = read_all()
    print(f"Total de linhas: {len(data)}")
    if data:
        print(f"Cabeçalho: {data[0]}")

    # Descomente para testar escrita:
    # write_cell("A1", "Teste via API")
    # write_range("B2:C2", [["col1", "col2"]])
    # append_rows([["nova linha", "valor 2", "valor 3"]])


if __name__ == "__main__":
    main()
