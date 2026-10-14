"""
SQLAlchemy models — re-export all models here so Alembic can discover them.
"""

from app.models.amarre_costo_periodo import (  # noqa: F401
    AmarreCostoArchivoOriginal,
    AmarreCostoConsignacionRenglon,
    AmarreCostoPeriodo,
)
from app.models.saldo_cuenta_huesped import SaldoCuentaHuespedLinea  # noqa: F401
from app.models.archivo_procesado import ArchivoProcesado  # noqa: F401
from app.models.balanza_cuenta import BalanzaCuenta  # noqa: F401
from app.models.catalogo_producto import CatalogoProducto  # noqa: F401
from app.models.catalogo_producto_cafeteria import CatalogoProductoCafeteria  # noqa: F401
from app.models.catalogo_producto_carreta_mariscos import CatalogoProductoCarretaMariscos  # noqa: F401
from app.models.cfdi_ingreso import CfdiIngreso  # noqa: F401
from app.models.comanda_emitida import ComandaEmitidaDetalle  # noqa: F401
from app.models.costeo_config import ConfiguracionCosteo, CosteoIncrementoGrupo, CosteoPrecioSugeridoOverride  # noqa: F401
from app.models.costeo_config_cafeteria import (  # noqa: F401
    ConfiguracionCosteoCafeteria,
    CosteoIncrementoGrupoCafeteria,
    CosteoPrecioSugeridoOverrideCafeteria,
)
from app.models.costeo_config_carreta_mariscos import (  # noqa: F401
    ConfiguracionCosteoCarretaMariscos,
    CosteoIncrementoGrupoCarretaMariscos,
    CosteoPrecioSugeridoOverrideCarretaMariscos,
)
from app.models.facturacion_factura_adjunta import FacturacionFacturaAdjunta  # noqa: F401
from app.models.facturacion_tabla_forma_pago import FacturacionTablaFormaPagoDetalle  # noqa: F401
from app.models.fiesta_fin_anio import (  # noqa: F401
    FiestaBitacora,
    FiestaEvento,
    FiestaHistorico,
    FiestaMesa,
    FiestaPago,
    FiestaPolizaDia,
    FiestaPrecio,
    FiestaReservacion,
    FiestaReservacionSilla,
    FiestaSilla,
)
from app.models.historial_cambio_pago import HistorialCambioPago  # noqa: F401
from app.models.historial_eliminacion_pago import HistorialEliminacionPago  # noqa: F401
from app.models.nota_fecha_heatmap import NotaFechaHeatmap  # noqa: F401
from app.models.pago import Pago  # noqa: F401
from app.models.pago_recepcion_dia import PagoRecepcionDia  # noqa: F401
from app.models.producto_vendido import ProductoVendidoDetalle  # noqa: F401
from app.models.producto_vendido_cafeteria import ProductoVendidoDetalleCafeteria  # noqa: F401
from app.models.producto_vendido_carreta_mariscos import ProductoVendidoDetalleCarretaMariscos  # noqa: F401
from app.models.reporte_produccion import (  # noqa: F401
    ReporteProduccionCaptura,
    ReporteProduccionDia,
    ReporteProduccionPesaje,
    ReporteProduccionProductoBase,
    ReporteProduccionRenglon,
)
from app.models.recibo_emitido import ReciboEmitidoDetalle  # noqa: F401
from app.models.usuario import Auditoria, PermisoRol, Rol, Sesion, Usuario  # noqa: F401
