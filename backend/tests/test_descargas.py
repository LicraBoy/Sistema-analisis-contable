"""Cabeceras de descarga: sin inyección ni caracteres que rompan la respuesta."""

from app.core.descargas import cabecera_descarga, nombre_seguro


def test_quita_saltos_de_linea_y_comillas():
    h = cabecera_descarga('reporte"\r\nSet-Cookie: x=1.xlsx')["Content-Disposition"]
    assert "\r" not in h and "\n" not in h
    assert h.count('"') == 2  # solo las comillas del filename ASCII


def test_acentos_y_caracteres_raros_no_rompen():
    h = cabecera_descarga("Productos_PIÑA – COLADA.xlsx")["Content-Disposition"]
    h.encode("latin-1")  # Starlette codifica las cabeceras en latin-1: no debe lanzar
    assert "filename*=UTF-8''" in h and 'filename="Productos_PINA_COLADA.xlsx"' in h


def test_nombre_vacio_usa_respaldo():
    assert nombre_seguro("////", "reporte") == "reporte"
    assert cabecera_descarga("")["Content-Disposition"].startswith('attachment; filename="descarga"')


def test_ruta_relativa_no_pasa():
    assert "/" not in nombre_seguro("../../etc/passwd")
