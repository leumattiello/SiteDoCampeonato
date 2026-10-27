#!/usr/bin/env python3
"""Gera/verifica as fórmulas de Bye da edição atual (somente saída local).

A escrita foi feita diretamente no Google Sheets. Este arquivo documenta o
padrão para futuras revisões, sem autenticação, tokens ou alteração remota.
"""
import re

BYE_ROWS = ((6, 1), (13, 8), (20, 15), (27, 22), (34, 29),
            (41, 36), (48, 43), (55, 50), (62, 57))


def bye_formula(header_row: int) -> str:
    if not isinstance(header_row, int) or header_row < 1:
        raise ValueError("Linha de cabeçalho inválida")
    return f'=IF(Config!$B$2>=VALUE(REGEXEXTRACT($A${header_row};"[0-9]+"));1;0)'.replace(r'\$', '$')


def expected_score(round_number: int, current_round: int) -> int:
    return int(round_number <= current_round)


def verify():
    assert len(BYE_ROWS) == 9
    assert all(row > heading for row, heading in BYE_ROWS)
    for round_number, (row, heading) in enumerate(BYE_ROWS, 1):
        f = bye_formula(heading)
        assert re.fullmatch(r'=IF\(Config!\$B\$2>=VALUE\(REGEXEXTRACT\(\$A\$\d+;"\[0-9\]\+"\)\);1;0\)', f), f
        assert (expected_score(round_number, 6) == 1) == (round_number <= 6)
        print(f"B{row}: {f}")
    print("Validado: rodada de referência 6 => 6 Byes com 1 ponto, 3 com zero.")


if __name__ == "__main__":
    verify()
