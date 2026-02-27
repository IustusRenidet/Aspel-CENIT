# Aspel-CENIT
Plataforma inteligente para construir dashboards de SAE, COI, NOI y BANCO con metricas declarativas, diccionario semantico y agente MCP.

## Inicio rapido

```bash
npm install
npm start
```

API local: `http://127.0.0.1:3000/api/health`  
UI constructor: `http://127.0.0.1:3000/`

## Servidor MCP inteligente

```bash
npm run start:mcp
```

El servidor MCP expone herramientas para:

- listar sistemas y metricas
- buscar metricas por objetivo de negocio
- ejecutar metricas (auto: Firebird y fallback demo)
- sugerir dashboards inteligentes
- explorar tablas y diccionario semantico

# Reportes
Ventas, ABC clientes/productos, Kardex, Balanza, Nómina conceptos
REPORTES

SAE:

-clientes

Antigüedad de saldos{
Antigüedad de saldos (Archivo: Antigüedad de saldos (clientes))
}
CRM{
Clientes por campañas (Archivo: Clientes por campañas (clientes))
Contactos por clientes (Archivo: Contactos por clientes (clientes))
}
Clientes{
Acumulados de clientes (Archivo: Acumulado de clientes (clientes))
Catálogo de clientes (Archivo: Catálogo de clientes)
Directorio de clientes (Archivo: Catálogo de clientes (Contactos Dir))
Catálogo de clientes (Archivo: Catálogo de clientes (Contactos))
Directorio de clientes (Archivo: Catálogo de clientes (Directorio))
Catálogo de clientes agrupado por matriz (Archivo: Clientes agrupados por matriz (clientes))
Etiquetas de clientes (Archivo: Etiquetas de clientes (clientes))
Lista de precios por cliente (Archivo: Lista de precios por cliente (clientes))
}
Cobranza{
Cobranza general (Archivo: Cobranza general (clientes))
Pronóstico de cobranza (Archivo: Pronóstico de cobranza (clientes))
}
Conceptos{
Reporte por conceptos (Archivo: Conceptos (clientes))
}
Control de cobranza{
Abonos por período (Archivo: Abonos por período (clientes))
Documentos a revisión (Archivo: Documentos a revisión (clientes))
Documentos por cobrar (Archivo: Documentos por cobrar (clientes))
Resumen de abonos por período (Archivo: Resumen de abonos por período (clientes))
}
Corte de caja{
Corte de caja (Archivo: Corte de caja (clientes))
}
Emisión de documentos{
Alta de documentos por cobrar (Archivo: Reporte de AltaCxC)
Pagos (Archivo: Reporte de Recepción de Pagos y Anticipos)
}
Estado de cuenta{
Estado de cuenta detallado (Archivo: Estado de cuenta detallado (clientes))
Estado de cuenta general (Archivo: Estado de cuenta general (clientes))
Historial crediticio del cliente (Archivo: Historial crediticio (clientes))
}
Movimientos de CxC{
Movimientos (Archivo: Resumen de movimientos (Det) (clientes))
Resumen de movimientos (Archivo: Resumen de movimientos (clientes))
}

-Compras
Compras por proveedor{
Compras por proveedor (Archivo: Compras por proveedor)
}
Detallado{
Detallado de compras (Archivo: Compras (detallado))
Detallado de devoluciones (Archivo: Devoluciones de compras (detallado))
Detallado de órdenes (Archivo: Ordenes (detallado))
Detallado de recepciones (Archivo: Recepciones (detallado))
Detallado de requisiciones (Archivo: Requisiciones (detallado))
}
Emisión de documentos{
Emisión de compras - ser (Con lotes, pedimentos y números de serie)  (Archivo: Emisión de compras - ser Itp no serie (compras))

Emisión de compras (Con lotes, pedimentos y números de serie) (Archivo: Emisión de compras Itp no serie (compras))

Emisión de devoluciones - ser (Con lotes, pedimentos y números de serie) (Archivo: Emisión de devoluciones - ser Itp no serie (compras))

Emisión de devoluciones (Con lotes, pedimentos y números de serie) (Archivo: Emisión de devoluciones Itp no serie (compras))

Emisión de recepciones - ser (Con lotes, pedimentos y números de serie) (Archivo: Emisión de recepciones - ser Itp no serie (compras))

Emisión de recepciones (Con lotes, pedimentos y números de serie) (Archivo: Emisión de recepciones Itp no serie (compras))

Emisión de compras (Archivo: Emisión de compras (compras))
Emisión de devoluciones (Archivo: Emisión de devoluciones para compras)
Emisión de ordenes (Archivo: Emisión de ordenes (compras))
Emisión de recepciones (Archivo: Emisión de recepciones (compras))
Emisión de requisiciones (Archivo: Emisión de requisiciones (compras))
}
Fiscales{
Abonos a compras (Archivo: Abonos a compras)
}
Pendientes{
Pendientes por ordenar, recepcionar, comprar (Archivo: Pend. por Ordenar-Recepcionar-Comprar(compras))
Pendientes por recepcionar, comprar (Archivo: Pendientes por Recepcionar-Comprar(compras))
Pendientes por comprar (Archivo: Pendientes por comprar (compras))
Productos devueltos (Archivo: Productos devueltos (compras))
}
Pendientes por recibir{
Pendientes por proveedor (Archivo: Pendientes por producto por proveedor (compras))
Pendientes por producto (Archivo: Productos pendientes por recibir (compras))
}
Resumen{
Resumen de compras (Archivo: Resumen de compras)
Resumen de devoluciones (Archivo: Resumen de devoluciones (compras))
Resumen de ordenes (Archivo: Resumen de ordenes)
Resumen de recepciones (Archivo: Resumen de recepciones)
Resumen de requisiciones (Archivo: Resumen de requisiciones)
}

-Facturas
Apartados{
Artículos apartados  (Archivo: Artículos apartados (facturas))
Apartados por cliente  (Archivo: Artículos apartados por cliente (facturas))
}
CFDI cancelados{
CFDI cancelados (Archivo: CFDI cancelados)
}
Detallado{
Detallado de cotizaciones (Archivo: Cotizaciones (detallado))
Detallado de notas de crédito (Archivo: Detallado de notas de crédito(detallado))
Detallado de devoluciones (Archivo: Devoluciones de facturas (detallado))
Detallado de facturas (Archivo:Facturas (detallado))
Detallado de notas de venta (Archivo: Notas de venta (detallado))
Detallado de parcialidades (Archivo: Parcialidades (detallado))
Detallado de pedidos (Archivo: Pedidos (detallado))
Detallado de remisiones (Archivo: Remisiones (detallado))
}
Emisión de CFDI{

}
Emisión de documentos{

}
Fiscales{

}
Operaciones sin existencias{

}
Pago de comisiones{

}
Pendientes{

}
Pendientes por surtir{

}
Políticas{

}
Resumen{

}
Vendedores{

}
Ventas por cliente{

}

-Inventarios
{

}

-Proveedores
{

}

COI:



NOI:


BANCO:
