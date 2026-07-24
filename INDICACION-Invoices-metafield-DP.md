# Indicación para el área "Aplicaciones Shopify para Invoices"

**Objetivo:** que la **nota de venta (invoice)** muestre la **Distancia Pupilar (DP)** del cliente cuando exista.

## Qué dato usar

Cuando un cliente mide su DP en el **Medidor Buhu** y la guarda en su pedido, se escribe un **metafield de la orden**:

| Campo | Valor |
|---|---|
| Owner | Order (pedido) |
| Namespace | `buhu` |
| Key | `distancia_pupilar` |
| Tipo | `single_line_text_field` |
| Valor | el **total** en mm, ej. `62.5 mm` |

La definición ya está creada y **fijada** en **Configuración → Datos personalizados → Pedidos** ("Distancia pupilar (DP)"). El metafield contiene **solo el total** (a propósito, para no confundir en la nota de venta). El detalle completo (OD/OI/cerca/fiabilidad) queda en las **Notas** del pedido, para el taller — no en la nota de venta.

## Cómo agregarlo a la nota de venta

### Si la app usa plantillas Liquid (Order Printer, Order Printer Pro, etc.)
Insertar donde corresponda (recomendado: bajo los datos del cliente o arriba del detalle de productos):

```liquid
{% if order.metafields.buhu.distancia_pupilar %}
  <p><strong>Distancia pupilar (DP):</strong> {{ order.metafields.buhu.distancia_pupilar }}</p>
{% endif %}
```

Si imprime en blanco, prueba con `.value`:
```liquid
{{ order.metafields.buhu.distancia_pupilar.value }}
```

### Si la app tiene selector de metafields (Sufio, Vify, etc.)
Buscar la opción de **campos personalizados / metafields** de la orden y referenciar:
- Namespace: `buhu`
- Key: `distancia_pupilar`

## Notas importantes
- El campo aparece **solo si** el cliente usó el medidor y guardó su DP. El `{% if %}` evita que salga una línea vacía en pedidos sin DP.
- El valor **ya incluye la unidad** ("mm"), así que no hay que agregar "mm" en la plantilla.
- Es una **medición orientativa** (así se le advierte al cliente); el tallado lo valida el taller.

## Ejemplo real para probar
El pedido **#1296** ya tiene el metafield con valor `62.5 mm` — sirve para previsualizar la nota de venta.
