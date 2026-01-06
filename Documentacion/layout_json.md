{
  "schema_version": 1,
  "panel": {
    "id": "pan_01HZZZ1ABCDEF1234567890",
    "nombre": "Mi tablero",
    "descripcion": "Resumen personal de ventas y cobranza",
    "visibilidad": "personal",
    "etiquetas": ["ventas", "resumen"],
    "creado_en": "2026-01-06T10:00:00-06:00",
    "actualizado_en": "2026-01-06T10:10:00-06:00"
  },
  "rejilla": {
    "columnas": 12,
    "alto_fila": 36,
    "margen": [12, 12],
    "contenedor_padding": [12, 12],
    "compactacion": "vertical",
    "bloquear_colision": false
  },
  "contexto": {
    "empresa_id": "emp_0001",
    "sistema_fuente": ["SAE", "COI"],
    "zona_horaria": "America/Mexico_City",
    "moneda": "MXN"
  },
  "widgets": [
    {
      "id": "wid_01HZZZ2ABCDEF1234567890",
      "tipo": "kpi",
      "titulo": "Ventas netas del mes",
      "subtitulo": "Mes actual",
      "origen": {
        "motor": "duckdb",
        "dataset": "ventas_resumen_mes",
        "metrica_id": "ventas_netas_mes"
      },
      "parametros": {
        "periodo": { "modo": "mes_actual" },
        "filtros": [],
        "agrupar_por": [],
        "limite": 0,
        "orden": []
      },
      "visual": {
        "formato": "moneda",
        "decimales": 2,
        "mostrar_tendencia": true,
        "comparativo": { "modo": "mes_anterior" }
      },
      "disposicion": {
        "x": 0,
        "y": 0,
        "w": 3,
        "h": 2,
        "minW": 2,
        "minH": 2,
        "maxW": 12,
        "maxH": 10
      },
      "refresco": {
        "modo": "cache",
        "minutos": 0
      },
      "permisos": {
        "roles": ["admin", "analista"],
        "solo_lectura": true
      }
    }
  ],
  "versionado": {
    "plantilla_id": null,
    "clonado_desde_panel_id": null
  }
}




### Campos clave (significado)

* `schema_version`: versión del contrato (para migraciones futuras)
* `rejilla`: configuración para `react-grid-layout`
* `widgets[]`: lista completa de widgets con:
  * `origen`: qué dataset/métrica consume (DuckDB)
  * `parametros`: filtros, periodo, agrupación
  * `visual`: opciones de UI
  * `disposicion`: coordenadas/tamaño en grid


## Tipos permitidos para `tipo`

Valores recomendados:

* `"kpi"`
* `"linea"`
* `"barras"`
* `"tabla"`
* `"alerta"`


## Periodos (estandarizados)

<pre class="overflow-visible! px-0!" data-start="2812" data-end="2986"><div class="contain-inline-size rounded-2xl corner-superellipse/1.1 relative bg-token-sidebar-surface-primary"><div class="sticky top-[calc(--spacing(9)+var(--header-height))] @w-xl/main:top-9"><div class="absolute end-0 bottom-0 flex h-9 items-center pe-2"><div class="bg-token-bg-elevated-secondary text-token-text-secondary flex items-center gap-4 rounded-sm px-2 font-sans text-xs"></div></div></div><div class="overflow-y-auto p-4" dir="ltr"><code class="whitespace-pre! language-json"><span><span>{</span><span></span><span>"modo"</span><span>:</span><span></span><span>"mes_actual"</span><span></span><span>}</span><span>
</span><span>{</span><span></span><span>"modo"</span><span>:</span><span></span><span>"ultimos_n_meses"</span><span>,</span><span></span><span>"n"</span><span>:</span><span></span><span>12</span><span></span><span>}</span><span>
</span><span>{</span><span></span><span>"modo"</span><span>:</span><span></span><span>"rango_fechas"</span><span>,</span><span></span><span>"desde"</span><span>:</span><span></span><span>"2025-01-01"</span><span>,</span><span></span><span>"hasta"</span><span>:</span><span></span><span>"2025-12-31"</span><span></span><span>}</span><span>
</span><span>{</span><span></span><span>"modo"</span><span>:</span><span></span><span>"anio_actual"</span><span></span><span>}</span></span></code></div></div></pre>


## Filtros (formato estándar)

<pre class="overflow-visible! px-0!" data-start="3022" data-end="3100"><div class="contain-inline-size rounded-2xl corner-superellipse/1.1 relative bg-token-sidebar-surface-primary"><div class="sticky top-[calc(--spacing(9)+var(--header-height))] @w-xl/main:top-9"><div class="absolute end-0 bottom-0 flex h-9 items-center pe-2"><div class="bg-token-bg-elevated-secondary text-token-text-secondary flex items-center gap-4 rounded-sm px-2 font-sans text-xs"></div></div></div><div class="overflow-y-auto p-4" dir="ltr"><code class="whitespace-pre! language-json"><span><span>{</span><span>
  </span><span>"campo"</span><span>:</span><span></span><span>"cliente"</span><span>,</span><span>
  </span><span>"operador"</span><span>:</span><span></span><span>"eq"</span><span>,</span><span>
  </span><span>"valor"</span><span>:</span><span></span><span>"C000123"</span><span>
</span><span>}</span><span>
</span></span></code></div></div></pre>

Operadores sugeridos:

* `eq`, `neq`, `in`, `nin`
* `gt`, `gte`, `lt`, `lte`
* `contains`, `starts_with`
* `between`
