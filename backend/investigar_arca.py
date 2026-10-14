import sqlite3, json
conn = sqlite3.connect("local_db.sqlite3")
conn.row_factory = sqlite3.Row

uuids = ["09D3E2EA-FC36-4726-B023-252374E7FC0F", "FE951F9A-B8FD-438B-B252-91458D988CE5"]

print("=== CfdiIngreso ===")
for u in uuids:
    row = conn.execute("SELECT * FROM cfdi_ingresos WHERE lower(uuid)=lower(?)", (u,)).fetchone()
    d = dict(row)
    de = json.loads(d["datos_extra"])
    print(f"uuid(DB)={d['uuid']}  nombre_emisor={d['nombre_emisor']}")
    for k in ["Folio","Total","Total MXN","Subtotal","Subtotal MXN","Traslado IVA","Traslado IVA MXN","Neto","Neto MXN","folio","monto","fecha","CFDIs de pago relacionados","Metodo de pago","M\u00e9todo de pago","Fecha expedici\u00f3n"]:
        if k in de:
            print(f"   {k} = {de[k]}")
    print()

print("=== Pago ===")
for u in uuids:
    row = conn.execute("SELECT id, fecha, factura, uuid, estado, datos_extra FROM pagos WHERE lower(uuid)=lower(?)", (u,)).fetchone()
    print(dict(row))
