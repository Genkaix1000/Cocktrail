# Integrar el procesamiento de pagos

El procesamiento de pagos con código QR se realiza mediante la creación de orders que incluyen una transacción de pago asociada. Al crear una order, el comprador podrá realizar el pago de forma presencial escaneando el código. 

Existen tres modelos de Código QR disponibles para integración, definidos en el momento de la creación de la order:

* **Modelo estático**: En este modelo, un único código QR asociado a la caja creada previamente recibe la información de cada order generada.
* **Modelo dinámico**: Un código QR exclusivo y de pago único es generado para cada transacción, conteniendo los datos específicos de la order creada.
* **Modelo híbrido**: Permite que el pago se realice tanto por el QR estático como por el dinámico. La order se vincula al código QR estático de la caja, mientras que también se genera un QR dinámico simultáneamente. Una vez que se realice el pago con cualquiera de los dos códigos, el otro quedará automáticamente inhabilitado para su uso.

Esta integración permite crear, procesar y cancelar orders, además de realizar reembolsos y consultar información y actualizaciones de estado de las transacciones. 

> NOTE
>
> Si deseas configurar que las cuotas sean [con](https://www.mercadopago.com.ar/ayuda/24694) o [sin interés](/developers/es/support/cuotas-sin-interes_3299), previo a crear una order, **deberás configurarlas en tu cuenta de Mercado Pago**.

:::::AccordionComponent{title="Crear una order"}
Para configurar el procesamiento de pagos con código QR, es necesario identificar la sucursal y la caja a los que se asociará la order. Recuerda que tanto la tienda como la caja deben haber sido [creados previamente](/developers/es/docs/qr-code/create-store-and-pos).

Luego, podrás crear la order. Para ello, envía una solicitud **POST** al endpoint :TagComponent{tag="API" text="/v1/orders API" href="/developers/es/reference/in-person-payments/qr-code/orders/create-order/post"}, incluyendo tu :toolTipComponent[Access Token de prueba]{link="/developers/es/docs/qr-code/create-application" linkText="Acceder a las credenciales de prueba" content="Clave privada de la aplicación creada en Mercado Pago, que es utilizada en el backend. Puedes acceder a ella a través de *Tus integraciones > Datos de integración > Pruebas > Credenciales de prueba*. Durante la integración, utiliza el Access Token de prueba y, al finalizar, reemplázalo por el Access Token de producción si se trata de una integración propia, o por el Access Token obtenido mediante OAuth en el caso de integraciones de terceros. Para más información, dirígete a la documentación. El _Access Token_ de prueba comienza con el prefijo `APP_USR`."}. Además, asegúrate de incluir el `external_pos_id` de la caja a la que deseas asignar la order, obtenido en el paso anterior.

```curl
curl -X POST \
  'https://api.mercadopago.com/v1/orders'\
  -H 'Content-Type: application/json' \
  -H 'X-Idempotency-Key: 0d5020ed-1af6-469c-ae06-c3bec19954bb' \
  -H 'Authorization: Bearer ACCESS_TOKEN' \
  -d '{
 "type": "qr",
 "total_amount": "50.00",
 "description": "Smartphone",
 "external_reference": "ext_ref_1234",
 "expiration_time": "PT16M",
 "config": {
  "qr": {
  "external_pos_id": "STORE001POS001",
  "mode": "static | dynamic | hibrid"
  }
 },
 "transactions": {
  "payments": [
  {
  "amount": "50.00"
  }
  ]
 },
 "items": [
  {
  "title": "Smartphone",
  "unit_price": "50.00",
  "quantity": 1,
  "unit_measure": "kg",
  "external_code": "777489134",
  "external_categories": [
  {
  "id": "device"
  }
  ]
  }
 ],
 "discounts": {
  "payment_methods": [
  {
  "new_total_amount": "47.28",
  "type": "account_money"

  }
  ]
  }
}'
```

Consulta en la tabla debajo las descripciones de los parámetros que tienen alguna particularidad importante que debe destacarse.

| Parámetro | Tipo | Descripción | Obligatoriedad |
| ---- | ---- | ---- | ---- |
| `Authorization` | *header* | Clave privada de la aplicación creada en Mercado Pago, que es utilizada en el backend en ambientes de desarrollo y al momento de recibir pagos reales. Puedes acceder a ella a través de *Tus integraciones > Datos de integración > Pruebas > Credenciales de prueba*. Durante el proceso de integración, utiliza el **Access Token de prueba**. Una vez finalizado el desarrollo y las pruebas de la integración, reemplaza el Access Token de prueba por el **Access Token de producción**, en caso de estar realizando una integración propia, o el **Access Token obtenido por medio de OAuth**, en caso de estar realizando una integración para terceros. | Obligatorio |
| `X-Idempotency-Key` | *header* | Clave de idempotencia. Esta clave garantiza que cada solicitud sea procesada solo una vez, evitando duplicidades. Utiliza un valor exclusivo en el `header` de la solicitud, como un UUID (Universally Unique Identifier - Identificador Universalmente Único) V4 o una *string* aleatoria. | Obligatorio |
| `type` | *string* | Tipo de order, asociada a la solución de Mercado Pago para la cual fue creada. Para pagos con Código QR de Mercado Pago, el único valor posible es *qr*. | Obligatorio |
| `total_amount` | *string* | Valor total de la order. Representa la suma de las transacciones. Puede contener dos decimales o ninguno. Ejemplo: 50.00. | Opcional |
| `description` | *string* | Descripción del producto o servicio. El límite máximo es de 150 caracteres y no puede utilizarse para enviar datos PII. | Opcional |
| `external_reference` | *string* | Es la referencia externa de la order, asignada al momento de la creación. El límite máximo permitido es de 64 caracteres y los permitidos son: letras mayúsculas y minúsculas, números y los símbolos guion (-) y guion bajo (_). El campo no puede utilizarse para enviar datos PII. Además, este valor debe ser único para cada order, ya que actúa como el identificador de dicha order. | Obligatorio |
| `expiration_time` | *string* | Especifica el período de validez de la order en formato de duración ISO 8601 (ej.: P3Y6M4DT12H30M5S). Mínimo de 30 segundos y máximo de 3600 horas. En todos los modos (QR Dinámico, QR Estático y QR Híbrido), el valor predeterminado es de 15 minutos y el valor enviado siempre es respetado. | Opcional |
| `config.qr.external_pos_id` | *string* | Identificador externo de la caja, definido por el integrador durante su creación. Al incluirlo, la información de la order queda asociada a la caja y a la tienda previamente creados dentro del sistema Mercado Pago. Importante: El campo `external_pos_id` debe tener el mismo valor definido como `external_id` en la creación de tu caja. | Obligatorio |
| `mode` | *string* | Modo de código QR asociado a la order. Los valores posibles están listados abajo y, si no se envía ninguno, el valor por defecto será `static`. <br> `static`: Modo estático, donde el código QR estático asociado a la caja definido en el campo `external_pos_id` recibe la información de la order. <br>`dynamic`: Modo dinámico, donde un código QR único es generado para cada transacción, incluyendo los datos específicos de la order creada. Este código debe construirse a partir de la información retornada en el campo `qr_data` de la respuesta, cuyo valor es exclusivo para cada order. <br>`hybrid`: Permite que el pago se realice usando cualquiera de los dos modos, estático o dinámico, ya que la order será vinculada al código QR estático asociado a la caja (`external_pos_id`), y un QR se generará dinámicamente en paralelo. Sin embargo, solo uno de los QR generados podrá ser pagado por el cliente. | Opcional |
| `transactions.payments` | *array* | El nodo *transactions* contiene información sobre la transacción asociada a la order. Cuando el `type` sea `qr`, pueden incluirse transacciones de pago *payments*, que a su vez contienen información sobre la order de pago. Solo una transacción de pago puede ser enviada por order. | Obligatorio |
| `transactions.payments.amount` | *string* | Valor del pago. Puede contener dos decimales o ninguno. Ejemplo: 50.00. | Obligatorio |

> NOTE
>
> Para más detalles sobre los parámetros que deben enviarse en esta solicitud, consulta nuestra [Referencia de API](/developers/es/reference/in-person-payments/qr-code/orders/create-order/post). 

La respuesta varía según el modelo de QR elegido para la integración. Selecciona abajo la opción que corresponde a tu caso.

::::TabsComponent

:::TabComponent{title="Modelo estático"}
Al crear una order especificando el `campo config.qr.mode` como `static`, el QR que deberá ser escaneado por el cliente es **el obtenido en la respuesta a la solicitud de creación de la caja**, pues es el que recibirá la información de la order creada. Si la solicitud es exitosa, la respuesta devolverá una order con status `created`.

Consulta debajo un ejemplo de respuesta para una solicitud de creación de una order para pagos con código QR estático.

> NOTE
>
> Durante el desarrollo de la integración, es posible escanear los códigos QR generados utilizando la aplicación de Mercado Pago, accediendo con una cuenta de prueba de comprador. Para más información, consulta la documentación [Probar la integración](/developers/es/docs/qr-code/test-integration). 

```json
{
  "id": "ORD01K371WBFDS4MD9JG0K8ZMECBE",
  "type": "qr",
  "processing_mode": "automatic",
  "external_reference": "ext_ref_1234",
  "description": "Smartphone",
  "total_amount": "50.00",
  "expiration_time": "PT16M",
  "country_code": "ARG",
  "user_id": "{{USER_ID}}",
  "status": "created",
  "status_detail": "created",
  "currency": "ARS",
  "created_date": "2025-08-21T19:32:21.621Z",
  "last_updated_date": "2025-08-21T19:32:21.621Z",
  "integration_data": {
  "application_id": "{{APPLICATION_ID}}"
  },
  "transactions": {
  "payments": [
  {
  "id": "PAY01K371WBFDS4MD9JG0KCV6PRKQ",
  "amount": "50.00",
  "status": "created",
  "status_detail": "ready_to_process"
  }
  ]
  },
  "config": {
  "qr": {
  "external_pos_id": "STORE001POS001",
  "mode": "static"
  }
  },
  "items": [
  {
  "title": "Smartphone",
  "unit_price": "50.00",
  "unit_measure": "kg",
  "external_code": "777489134",
  "quantity": 1,
  "external_categories": [
  {
  "id": "device"
  }
  ]
  }
  ],
  "discounts": {
  "payment_methods": [
  {
  "type": "account_money",
  "new_total_amount": "47.28"
  }
  ]
  }
}
```

> WARNING
>
> Guarda el `id` de la order y el `id` del pago (`transactions.payments.id`) retornados en la creación. Son necesarios para futuras operaciones y para validar notificaciones. Consulta **Recursos** para más [detalles sobre el status de la order y la transacción](/developers/es/docs/qr-code/resources/status-order-transaction). 

La order creada será vinculada automáticamente a la caja especificada en la solicitud, permitiendo que el comprador realice el pago en el punto de venta físico. Además, esta vinculación también facilita la conciliación. Tras el pago, la transacción será procesada de forma integrada.

:::

:::TabComponent{title="Modelo dinámico"}
Al crear una order especificando el modo `dynamic` en el campo `config.qr.mode`, la respuesta de la solicitud incluirá el campo adicional `type_response.qr_data`. Este campo contiene una *string* en el formato [EMVCo](https://www.emvco.com/emv-technologies/qr-codes/), que puede convertirse en un código QR para ser impreso o mostrado en una pantalla o dispositivo. Si la solicitud es exitosa, la respuesta devolverá una order con status `created`.

> NOTE
>
> Durante el desarrollo de la integración, es posible escanear los códigos QR generados utilizando la aplicación de Mercado Pago, accediendo con una cuenta de prueba de comprador. Para más información, consulta la documentación [Probar la integración](/developers/es/docs/qr-code/test-integration).

Consulta debajo un ejemplo de respuesta para una solicitud de creación de una order para pagos con ** código QR dinámico**.

```json
{
  "id": "ORD01K372G4J4FXZ9HGHZMJMGGPKE",
  "type": "qr",
  "processing_mode": "automatic",
  "external_reference": "ext_ref_1234",
  "description": "Smartphone",
  "total_amount": "50.00",
  "expiration_time": "PT16M",
  "country_code": "ARG",
  "user_id": "{{USER_ID}}",
  "status": "created",
  "status_detail": "created",
  "currency": "ARS",
  "created_date": "2025-08-21T19:43:10.13Z",
  "last_updated_date": "2025-08-21T19:43:10.13Z",
  "integration_data": {
  "application_id": "{{APPLICATION_ID}}"
  },
  "transactions": {
  "payments": [
  {
  "id": "PAY01K372G4J4FXZ9HGHZMKWSQS20",
  "amount": "50.00",
  "status": "created",
  "status_detail": "ready_to_process"
  }
  ]
  },
  "config": {
  "qr": {
  "external_pos_id": "STORE001POS001",
  "mode": "dynamic"
  }
  },
  "type_response": {
  "qr_data": "00020101021226580014br.gov.bcb.qr01368ee55a9c-7db3-41e0-a8cd-fbff4d4765b5204000053039865802BR5925PABLO JOSE DE OLIVEIRA CA6009SAO PAULO61088051040062070503***630442E4"
  },
  "items": [
  {
  "title": "Smartphone",
  "unit_price": "50.00",
  "unit_measure": "kg",
  "external_code": "777489134",
  "quantity": 1,
  "external_categories": [
  {
  "id": "device"
  }
  ]
  }
  ],
  "discounts": {
  "payment_methods": [
  {
  "type": "account_money",
  "new_total_amount": "47.28"
  }
  ]
  }
}
```

> WARNING
>
> Guarda el `id` de la order y el `id` del pago (`transactions.payments.id`) retornados en la creación. Son necesarios para futuras operaciones y para validar notificaciones. Consulta **Recursos** para más [detalles sobre el status de la order y la transacción](/developers/es/docs/qr-code/resources/status-order-transaction).

En este modelo, un código QR exclusivo es generado para cada order creada, incorporando los datos específicos de la transacción. Tras el pago, la transacción es procesada de forma integrada.

:::

:::TabComponent{title="Modelo híbrido"}
Al crear una order especificando el modo `hybrid` en el modo `config.qr.mode`, la respuesta de la solicitud incluye el campo adicional `type_response.qr_data`. Igual que en el modelo dinámico, el valor de este campo contiene una *string* en el formato [EMVCo](https://www.emvco.com/emv-technologies/qr-codes/), que puede convertirse en un código QR para impresión y pago del cliente.

Además, el cliente también podrá escanear el código QR obtenido en la respuesta de la solicitud de creación de la caja para realizar el pago, como ocurre en el modelo estático, pues es el que recibirá la información de la order creada.

De esta forma, el pago puede realizarse tanto mediante el **QR estático de la caja** como por un **QR dinámico** generado al mismo tiempo. La order siempre está vinculada al QR estático, pero el cliente puede optar por utilizar cualquiera de los dos. Una vez que el pago se completa en uno de ellos, el otro se deshabilita automáticamente, evitando la duplicidad de transacciones.

> NOTE
>
> Durante el desarrollo de la integración, es posible escanear los códigos QR generados utilizando la aplicación de Mercado Pago, accediendo con una cuenta de prueba de comprador. Para más información, consulta la documentación [Probar la integración](/developers/es/docs/qr-code/test-integration).

Si la solicitud es exitosa, la respuesta devolverá una order con `status created`. Consulta abajo un ejemplo de respuesta para una solicitud de creación de una order para pagos con ** código QR modelo híbrido**.

```json
{
  "id": "ORD01K37A6R7EAD3BQQJZJD4Q5K0E",
  "type": "qr",
  "processing_mode": "automatic",
  "external_reference": "ext_ref_1234",
  "description": "Smartphone",
  "total_amount": "50.00",
  "expiration_time": "PT16M",
  "country_code": "ARG",
  "user_id": "{{USER_ID}}",
  "status": "created",
  "status_detail": "created",
  "currency": "ARS",
  "created_date": "2025-08-21T20:21:43.987Z",
  "last_updated_date": "2025-08-21T20:21:43.987Z",
  "integration_data": {
  "application_id": "{{APPLICATION_ID}}"
  },
  "transactions": {
  "payments": [
  {
  "id": "PAY01K37A6R7EAD3BQQJZK3PKA90",
  "amount": "50.00",
  "status": "created",
  "status_detail": "ready_to_process"
  }
  ]
  },
  "config": {
  "qr": {
  "external_pos_id": "STORE001POS001",
  "mode": "hybrid"
  }
  },
  "type_response": {
  "qr_data": "00020101021226580014br.gov.bcb.qr01363f78b8c2-6f94-4c67-b593-4aad44e2ec51204000053039865802BR5925PABLO JOSE DE OLIVEIRA CA6009SAO PAULO61088051040062070503***6304CAC0"
  },
  "items": [
  {
  "title": "Smartphone",
  "unit_price": "50.00",
  "unit_measure": "kg",
  "external_code": "777489134",
  "quantity": 1,
  "external_categories": [
  {
  "id": "device"
  }
  ]
  }
  ],
  "discounts": {
  "payment_methods": [
  {
  "type": "account_money",
  "new_total_amount": "47.28"
  }
  ]
  }
}
```

> WARNING
>
> Guarda el `id` de la order y el `id` del pago (`transactions.payments.id`) retornados en la creación. Son necesarios para futuras operaciones y para validar notificaciones. Consulta **Recursos** para más [detalles sobre el status de la order y la transacción](/developers/es/docs/qr-code/resources/status-order-transaction). 

:::

:::::

:::AccordionComponent{title="Cancelar una order"}
La cancelación de una order solo puede realizarse cuando su `status` es `created`. Si la solicitud de cancelación se realiza con otro status, la API devolverá un error informando el conflicto.

Para cancelar una order, envía un **POST** al endpoint :TagComponent{tag="API" text="/v1/orders/{order_id}/cancel" href="/developers/es/reference/in-person-payments/qr-code/orders/cancel-order/post"}, incluyendo tu :toolTipComponent[Access Token de prueba]{link="/developers/es/docs/qr-code/create-application" linkText="Acceder a las credenciales de prueba" content="Clave privada de la aplicación creada en Mercado Pago, que es utilizada en el backend. Puedes acceder a ella a través de *Tus integraciones > Datos de integración > Pruebas > Credenciales de prueba*. Durante la integración, utiliza el Access Token de prueba y, al finalizar, reemplázalo por el Access Token de producción si se trata de una integración propia, o por el Access Token obtenido mediante OAuth en el caso de integraciones de terceros. Para más información, dirígete a la documentación. El _Access Token_ de prueba comienza con el prefijo `APP_USR`."}. También es necesario enviar el *`id`* de la order que deseas cancelar, obtenido en la respuesta a su creación.

```curl
curl -X POST \
  'https://api.mercadopago.com/v1/orders/ORD01K371WBFDS4MD9JG0K8ZMECBE/cancel'\
  -H 'Content-Type: application/json' \
  -H 'X-Idempotency-Key: 0d5020ed-1af6-469c-ae06-c3bec19954bb' \
  -H 'Authorization: Bearer ACCESS_TOKEN' \
  
```

Si la solicitud es exitosa, la respuesta incluirá el campo `status` con el valor `canceled`.

```json
{
  "id": "ORD01K371WBFDS4MD9JG0K8ZMECBE",
  "type": "qr",
  "processing_mode": "automatic",
  "external_reference": "ext_ref_1234",
  "description": "Smartphone",
  "total_amount": "50.00",
  "expiration_time": "PT16M",
  "country_code": "ARG",
  "user_id": "{{USER_ID}}",
  "status": "canceled",
  "status_detail": "canceled",
  "currency": "ARS",
  "created_date": "2025-08-21T19:32:21.621Z",
  "last_updated_date": "2025-08-21T19:33:52.012Z",
  "integration_data": {
  "application_id": "{{APPLICATION_ID}}"
  },
  "transactions": {
  "payments": [
  {
  "id": "PAY01K371WBFDS4MD9JG0KCV6PRKQ",
  "amount": "50.00",
  "status": "canceled",
  "status_detail": "canceled_by_api"
  }
  ]
  },
  "config": {
  "qr": {
  "external_pos_id": "STORE001POS001",
  "mode": "static"
  }
  },
  "items": [
  {
  "title": "Smartphone",
  "unit_price": "50.00",
  "unit_measure": "kg",
  "external_code": "777489134",
  "quantity": 1,
  "external_categories": [
  {
  "id": "device"
  }
  ]
  }
  ],
  "discounts": {
  "payment_methods": [
  {
  "type": "account_money",
  "new_total_amount": "47.28"
  }
  ]
  }
}
```

:::

:::::AccordionComponent{title="Reembolsar una order"}

En caso de necesitarlo, es posible reembolsar una order creada mediante nuestra API. Este endpoint permite realizar la devolución **total o parcial** de una transacción de pago asociada a la order. Para solicitar un reembolso total, no es necesario enviar un `body` en la llamada. Para el reembolso parcial, es necesario informar en el `body` el valor a reembolsar y el identificador de la transacción.

> WARNING
> 
> Una order podrá ser reembolsada vía API hasta **180 días después de que se haya realizado el pago**. Después de ese período, no será posible realizar la devolución. 

Elige la opción que mejor se adapte a tus necesidades y sigue las instrucciones correspondientes.

::::TabsComponent

:::TabComponent{title="Reembolso total"}

Para realizar el reembolso **total** de una order, envía un **POST** al endpoint :TagComponent{tag="API" text="/v1/orders/{order_id}/refund" href="/developers/es/reference/in-person-payments/qr-code/orders/refund-order/post"} **sin enviar body** en la requisición. Asegúrate de incluir tu :toolTipComponent[Access Token de prueba]{link="/developers/es/docs/qr-code/create-application" linkText="Acceder a las credenciales de prueba" content="Clave privada de la aplicación creada en Mercado Pago, que es utilizada en el backend. Puedes acceder a ella a través de *Tus integraciones > Datos de integración > Pruebas > Credenciales de prueba*. Durante la integración, utiliza el Access Token de prueba y, al finalizar, reemplázalo por el Access Token de producción si se trata de una integración propia, o por el Access Token obtenido mediante OAuth en el caso de integraciones de terceros. Para más información, dirígete a la documentación. El _Access Token_ de prueba comienza con el prefijo `APP_USR`."}. También es necesario informar el `id` de la order que deseas reembolsar, obtenido en la respuesta a su creación.

```curl
curl -X POST \
  'https://api.mercadopago.com/v1/orders/ORDER_ID/refund' \
  -H 'Content-Type: application/json' \
  -H 'X-Idempotency-Key: 0d5020ed-1af6-469c-ae06-c3bec19954bb' \
  -H 'Authorization: Bearer ACCESS_TOKEN'
```

Si la solicitud fue exitosa, la respuesta mostrará el `status=refunded` y un nuevo nodo `transactions.refunds`, que contendrá los detalles del reembolso, junto con el `id` del pago original y el `id` de la transacción de reembolso.

```json
{
  "id": "ORD0000ABCD222233334444555566",
  "status": "refunded",
  "status_detail": "refunded",
  "transactions": {
  "refunds": [
  {
  "id": "REF01J67CQQH5904WDBVZEM1234D",
  "transaction_id": "PAY01J67CQQH5904WDBVZEM4JMEP3",
  "reference_id": "12345678",
  "amount": "38.00",
  "status": "processed"
  }
  ]
  }
}
```

:::

:::TabComponent{title="Reembolso parcial"}

Para realizar el reembolso **parcial** de una order, envía un **POST** al endpoint :TagComponent{tag="API" text="/v1/orders/{order_id}/refund" href="/developers/es/reference/in-person-payments/qr-code/orders/refund-order/post"}, incluyendo en el **body** de la solicitud el array `transactions` con el identificador de la transacción de pago (`id`) y el valor a reembolsar (`amount`). Asegúrate de incluir tu :toolTipComponent[Access Token de prueba]{link="/developers/es/docs/qr-code/create-application" linkText="Acceder a las credenciales de prueba" content="Clave privada de la aplicación creada en Mercado Pago, que es utilizada en el backend. Puedes acceder a ella a través de *Tus integraciones > Datos de integración > Pruebas > Credenciales de prueba*. Durante la integración, utiliza el Access Token de prueba y, al finalizar, reemplázalo por el Access Token de producción si se trata de una integración propia, o por el Access Token obtenido mediante OAuth en el caso de integraciones de terceros. Para más información, dirígete a la documentación. El _Access Token_ de prueba comienza con el prefijo `APP_USR`."}. También es necesario informar el `id` de la order que deseas reembolsar, obtenido en la respuesta a su creación.

```curl
curl -X POST \
  'https://api.mercadopago.com/v1/orders/ORDER_ID/refund' \
  -H 'Content-Type: application/json' \
  -H 'X-Idempotency-Key: 0d5020ed-1af6-469c-ae06-c3bec19954bb' \
  -H 'Authorization: Bearer ACCESS_TOKEN' \
  -d '{
  "transactions": [
  {
  "id": "TRANSACTION_ID",
  "amount": "24.90"
  }
  ]
  }'
```
| Atributo | Tipo | Descripción | Obligatoriedad |
|-|-|-|-|
| `order_id` | _String_ | ID de la order que contiene la transacción de pago asociada a reembolsar. Este valor se devuelve en la respuesta a la solicitud de [Crear una order](/developers/es/docs/qr-code/payment-processing#:~:text=Crear%20una%20order-,Para,-configurar%20el%20procesamiento). | Obligatorio. |
| `transactions` | _Array_ | Contiene información sobre la transacción asociada a la order que será reembolsada. | Obligatorio para reembolsos parciales. |
| `transactions.id` | _String_ | Identificador de la transacción de pago creada en la solicitud, obtenido en la respuesta a la creación de la order (`transactions.payments.id`). | Obligatorio para reembolsos parciales. |
| `transactions.amount` | _String_ | Valor a ser reembolsado. Es posible realizar múltiples reembolsos parciales, siempre que la suma no supere el valor total de la transacción. | Obligatorio para reembolsos parciales. |

Si la solicitud fue exitosa, la respuesta mostrará `status=processed` (si aún hay saldo en la order) y `status_detail=partially_refunded`, además del nodo `transactions.refunds` con los detalles del reembolso parcial.

```json
{
  "id": "ORD01J49MMW3SSBK5PSV3DFR32959",
  "status": "processed",
  "status_detail": "partially_refunded",
  "transactions": {
  "refunds": [
  {
  "id": "REF01J49MMW3SSBK5PSV3DFR32959",
  "transaction_id": "PAY01JEVQM06WDW16MAQ8B5SC0MSC",
  "reference_id": "12345678",
  "amount": "24.90",
  "status": "processed"
  }
  ]
  }
}
```

:::

::::

:::::

:::AccordionComponent{title="Consultar datos de una order"}
Es posible consultar los datos de una order y sus transacciones asociadas, ya sean pagos o reembolsos, incluyendo sus estados o valores.

Para realizar la consulta, envía un **GET** al endpoint :TagComponent{tag="API" text="/v1/orders/{order_id}" href="/developers/es/reference/in-person-payments/qr-code/orders/get-order/get"} incluyendo tu :toolTipComponent[Access Token de prueba]{link="/developers/es/docs/qr-code/create-application" linkText="Acceder a las credenciales de prueba" content="Clave privada de la aplicación creada en Mercado Pago, que es utilizada en el backend. Puedes acceder a ella a través de *Tus integraciones > Datos de integración > Pruebas > Credenciales de prueba*. Durante la integración, utiliza el Access Token de prueba y, al finalizar, reemplázalo por el Access Token de producción si se trata de una integración propia, o por el Access Token obtenido mediante OAuth en el caso de integraciones de terceros. Para más información, dirígete a la documentación. El _Access Token_ de prueba comienza con el prefijo `APP_USR`."}. Además, asegúrate de incluir el `id` de la order obtenido en la respuesta a su creación.

```curl
curl --location --request GET 'https://api.mercadopago.com/v1/orders/ORDER_ID' \
--header 'Authorization: Bearer {{ACCESS_TOKEN}}'
```

> WARNING
>
> Esta solicitud está disponible solo para orders creadas hace menos de 3 meses. Para acceder a información de orders más antiguas, es necesario contactar nuestro servicio de atención al cliente. 

Si la solicitud es exitosa, la respuesta devolverá toda la información de la order, incluyendo su status, el status del pago y/o el status del reembolso en tiempo real.

```json
{
  "id": "ORD01K371WBFDS4MD9JG0K8ZMECBE",
  "type": "qr",
  "processing_mode": "automatic",
  "external_reference": "ext_ref_1234",
  "description": "Smartphone",
  "total_amount": "50.00",
  "expiration_time": "PT16M",
  "country_code": "ARG",
  "user_id": "{{USER_ID}}",
  "status": "canceled",
  "status_detail": "canceled",
  "currency": "ARS",
  "created_date": "2025-08-21T19:32:21.621Z",
  "last_updated_date": "2025-08-21T19:33:52.012Z",
  "integration_data": {
  "application_id": "{{APPLICATION_ID}}"
  },
  "transactions": {
  "payments": [
  {
  "id": "PAY01K371WBFDS4MD9JG0K8ZMECBE",
  "amount": "50.00",
  "status": "canceled",
  "status_detail": "canceled_by_api"
  }
  ]
  },
  "config": {
  "qr": {
  "external_pos_id": "STORE001POS001",
  "mode": "static"
  }
  },
  "items": [
  {
  "title": "Smartphone",
  "unit_price": "50.00",
  "unit_measure": "kg",
  "external_code": "777489134",
  "quantity": 1,
  "external_categories": [
  {
  "id": "device"
  }
  ]
  }
  ],
  "discounts": {
  "payment_methods": [
  {
  "type": "account_money",
  "new_total_amount": "47.28"
  }
  ]
  }
}
```

:::

Después de la integración del procesamiento de pagos, podrás [configurar las notificaciones](/developers/es/docs/qr-code/notifications).

# Create order

This endpoint allows to create an order for QR Code for payment transactions. In case of success, the request will return a response with status 201.

**POST** `/v1/orders`

## Request parameters

### Header

- `X-Idempotency-Key` (string, required)
  This feature allows you to safely retry requests without the risk of accidentally performing the same action more than once. This is useful for avoiding errors, such as creating two identical payments. To ensure that each request is unique, you must use an exclusive value in the header of each unique value for each call. If you use a value already assigned to another request, you will receive information corresponding to that created resource in response, not this new request. We suggest using a UUID V4 or random strings.

- `type` (string, optional)
  Order type, associated with the Mercado Pago solution for which it is created. For Mercado Pago's QR Code payments, the only possible value is "qr".
Possible enum values:

  - `qr`
  Value associated with the creation of orders for Mercado Pago QR Code payments.

- `total_amount` (string, optional)
  Total order amount. Represents the sum of the transactions. The field can contain two decimal places or none.

- `description` (string, optional)
  Description of the purchased product or service, the reason for the order. The maximum limit is 150 characters and it must not contain PII data.

- `external_reference` (string, optional)
  It is the external reference of the order, assigned when creating it. The maximum allowed limit is 64 characters, and the allowed characters are: uppercase and lowercase letters, numbers, and the symbols hyphen (-) and underscore (_). This field must not contain PII data).

- `expiration_time` (string, optional)
  Specifies the order's validity period in ISO 8601 duration format (e.g., P3Y6M4DT12H30M5S). Minimum of 30 seconds and maximum of 3600 hours. In all modes (Dynamic QR, Static QR, and Hybrid QR), the default value is 15 minutes and the value sent is always respected.

- `marketplace_fee` (string, optional)
  This field is exclusive to OAuth integrations. It represents the marketplace fee, which will be given to the marketplace owner account. The field can contain two decimal places or none.

- `integration_data` (object, optional)
  Contains information about the Mercado Pago application that created the order.

  - `integration_data.platform_id` (string, optional)
  Identifier of the platform, assigned by Mercado Pago.

  - `integration_data.integrator_id` (string, optional)
  Identifier of the user who develops the integration that creates the order, assigned by Mercado Pago. It must contain the prefix "dev_"

  - `integration_data.sponsor` (object, optional)

  - `integration_data.sponsor.id` (string, optional)
  Mercado Pago's USER_ID of the integrator system.

- `config` (object, optional)
  Order type configuration.

  - `config.qr` (object, optional)
  QR order configuration.

  - `config.qr.external_pos_id` (string, optional)
  External identifier of the POS, defined by the integrator during its creation. With its inclusion, the order information is associated with the pos and store previously created within the Mercado Pago system.

  - `config.qr.mode` (string, optional)
  QR code mode associated with the order. The possible values ​​are listed below, and if you don't submit one, the default value will be "static".
Possible enum values:

  - `static`
  Static model, in which the static QR code, associated to the POS defined by the "external_pos_id" field, receives the order information.

  - `dynamic`
  Dynamic mode, in which a unique QR code for each transaction contains the specific data of the created order. This code must be generated from the information returned in the response, in the "qr_data" field, whose value will be unique for each order.

  - `hybrid`
  Allows payment to be made using either of the two modes, static or dynamic, since the order will be linked to the static QR code associated with the POS ("external_pos_id"), and a frame will be dynamically generated in parallel.

- `transactions` (object, optional)
  Contains information about the transaction associated with the order. When the "type" is "qr", payment transactions ("payments") can be included.

  - `transactions.payments` (array, optional)
  Contains information about the payment order. Only one payment transaction can be sent per order.

  - `transactions.payments.amount` (string, optional)
  Payment amount. The field can contain two decimal places or none.

- `items` (array, optional)
  Information about the list of items to be paid. It is possible to send a maximum of 10 items.

  - `items.title` (string, optional)
  Item name. The character limit is 150.

  - `items.unit_price` (string, optional)
  Unit price of the purchased item. The field can contain two decimal places or none.

  - `items.quantity` (integer, optional)
  Purchased items quantity.

  - `items.unit_measure` (string, optional)
  A value that represents a unit of measurement associated with the item. It can contain a maximum of 10 characters, and we suggest sending the value in lowercase.

  - `items.external_code` (string, optional)
  Code that identifies the item within the external system, for example, an EAN code. It is allowed a maximum of 30 characters.

  - `items.external_categories` (array, optional)
  List of categories associated with the item within the external system. A maximum of 10 categories ("id"). This field enables the category discount feature and therefore cannot be set together with the &quot;discounts&quot; field. If you want to apply discounts by category, use only this field (&quot;external_categories&quot;) and remove the &quot;discounts&quot; field.

  - `items.external_categories.id` (string, optional)
  Identifier of the category associated with the item.

- `discounts` (object, optional)
  Contains information about the discounts the seller wants to offer on the payment transaction ("payment") of the order. Discounts can be configured for any payment method, but they will only apply if the payment is made through Mercado Pago wallet. If this node is sent, it is necessary to define the new payment value, which will replace the "total_amount" of the order. In case the payer does not use any of the payment methods assigned with a discount, the amount to be paid will continue to be the one defined in the "total_amount" field of the order. This field cannot be used with the &quot;external categories&quot; field. If you want to apply discounts by category, use only the &quot;external categories&quot; field (&quot;external_categories&quot;) and remove this field (&quot;discounts&quot;).

  - `discounts.payment_methods` (array, optional)
  Information about the payment method with which the discount is applied.

  - `discounts.payment_methods.new_total_amount` (string, optional)
  Defines the new total value of the order when the discount is applied. The field can contain two decimal places or none.

  - `discounts.payment_methods.type` (string, optional)
  Identifier of the payment method with which the discount will be applied if used by the payer to make the payment through Mercado Pago wallet. Discounts can be defined for the 4 payment methods listed below, and a maximum of 4 available payment methods can be entered.
Possible enum values:

  - `debit_card`
  Debit card that is registered in Mercado Pago wallet.

  - `credit_card`
  Credit card that is registered in Mercado Pago wallet.

  - `account_money`
  Available money in the Mercado Pago wallet.

  - `prepaid_card`
  Prepaid card that is registered in Mercado Pago wallet.

## Response parameters

- `id` (string, optional)
  Identifier of the order created in the request, automatically generated by Mercado Pago.

- `user_id` (string, optional)
  ID of the Mercado Pago account that created the order.

- `type` (string, optional)
  Order type.
Possible enum values:

  - `qr`
  Order created for Mercado Pago QR Code payments.

- `external_reference` (string, optional)
  External reference of the order, assigned when creating it.

- `description` (string, optional)
  Description of the product or service that is being sold, the reason for the payment order.

- `expiration_time` (string, optional)
  Specifies the order's validity period in ISO 8601 duration format (e.g., P3Y6M4DT12H30M5S). Minimum of 30 seconds and maximum of 3600 hours. In all modes (Dynamic QR, Static QR, and Hybrid QR), the default value is 15 minutes and the value sent is always respected.

- `processing_mode` (string, optional)
  Indicates how the order will be processed. For QR orders, the only allowed value is "automatic", that sets the order to be ready to process.

- `total_amount` (string, optional)
  Total amount of the order, assigned when creating it. Represents the addition of the transactions associated with the order.

- `country_code` (string, optional)
  Identifier of the site (country) to which the Mercado Pago application that created the order belongs.

- `marketplace_fee` (string, optional)
  This field is exclusive to OAuth integrations. It represents the marketplace fee, which will be given to the seller's account.

- `integration_data` (object, optional)
  Contains information about the Mercado Pago application that created the order.

  - `integration_data.application_id` (string, optional)
  Identifier of the Mercado Pago application that created the order.

  - `integration_data.platform_id` (string, optional)
  Identifier of the platform, assigned by Mercado Pago.

  - `integration_data.integrator_id` (string, optional)
  Identifier of the user who develops the integration that creates the order, assigned by Mercado Pago.

  - `integration_data.sponsor` (object, optional)

  - `integration_data.sponsor.id` (string, optional)
  Mercado Pago's USER_ID of the integrator system.

- `status` (string, optional)
  Current status of the order.
Possible enum values:

  - `created`
  The order has been succesfully created.

- `status_detail` (string, optional)
  Details about the status of the order.
Possible enum values:

  - `created`
  The order has been succesfully created.

- `currency` (string, optional)
  Identifier of the currency used in the order. We currently have the following options.
Possible enum values:

  - `BRL`
  Brazilian real.

  - `ARS`
  Argentine peso.

  - `CLP`
  Chilean peso.

  - `UYU`
  Urugayan peso.

- `created_date` (string, optional)
  Order's creation date, in "yyyy-MM-ddTHH:mm:ss.sssZ" format.

- `last_updated_date` (string, optional)
  Order's las update date, in "yyyy-MM-ddTHH:mm:ss.sssZ" format.

- `config` (object, optional)
  Order type configuration.

  - `config.qr` (object, optional)
  QR Code order configuration.

  - `config.qr.external_pos_id` (string, optional)
  External identifier of the POS, defined by the integrator during its creation.

  - `config.qr.mode` (string, optional)
  QR code mode associated with the order. The possible values ​​are listed below, and if none was submitted, the default value will be "static".
Possible enum values:

  - `static`
  Static model, in which the static QR code, associated to the POS defined by the "external_pos_id" field, receives the order information.

  - `dynamic`
  Dynamic mode, in which a unique QR code for each transaction contains the specific data of the created order. This code must be generated from the information returned in the response, in the "qr_data" field, whose value will be unique for each order.

  - `hybrid`
  Allows payment to be made using either of the two modes, static or dynamic, since the order will be linked to the static QR code associated with the POS ("external_pos_id"), and a frame will be dynamically generated in parallel.

- `transactions` (object, optional)
  Contains information about the transactions associated with the order.

  - `transactions.payments` (array, optional)
  Contains information about the payment associated with the order.

  - `transactions.payments[].id` (string, optional)
  Identifier of the payment transaction created in the request, automatically generated by Mercado Pago.

  - `transactions.payments[].amount` (string, optional)
  Payment amount, assigned when creating the order.

  - `transactions.payments[].status` (string, optional)
  Current payment status.
Possible enum values:

  - `created`
  The payment has been succesfully created.

  - `transactions.payments[].status_detail` (string, optional)
  Details about the status of the payment.
Possible enum values:

  - `ready_to_process`
  The payment has been succesfully created and is ready to process.

- `items` (array, optional)
  Information about the list of items to be paid.

  - `items[].title` (string, optional)
  Item name.

  - `items[].unit_price` (string, optional)
  Unit price of the item. The field can contain two decimal places or none.

  - `items[].quantity` (integer, optional)
  Sold items quantity.

  - `items[].unit_measure` (string, optional)
  A value that represents a unit of measurement associated with the item, assigned when creating the order.

  - `items[].external_code` (string, optional)
  Code that identifies the item within the external system, assigned when creating the order. For example, an EAN code.

  - `items[].external_categories` (array, optional)
  List of categories associated with the item within the external system. A maximum of 10 categories ("id"). This field enables the category discount feature and therefore cannot be set together with the &quot;discounts&quot; field. If you want to apply discounts by category, use only this field (&quot;external_categories&quot;) and remove the &quot;discounts&quot; field.

  - `items[].external_categories[].id` (string, optional)
  Identifier of the category associated with the item.

- `discounts` (object, optional)
  Contains information about the discounts the seller set for the payment transaction ("payment") of the order, associated with a payment method.

  - `discounts.payment_methods` (array, optional)
  Information about the payment method selected to apply the discount, assigned when creating the order.

  - `discounts.payment_methods[].new_total_amount` (string, optional)
  New total value of the order when the discount is applied.

  - `discounts.payment_methods[].type` (string, optional)
  Identifier of the payment method with which the discount will be applied if used by the payer to make the payment.
Possible enum values:

  - `debit_card`
  Debit card that is registered in Mercado Pago wallet.

  - `credit_card`
  Credit card that is registered in Mercado Pago wallet.

  - `account_money`
  Available money in the Mercado Pago wallet.

  - `prepaid_card`
  Prepaid card that is registered in Mercado Pago wallet.

- `type_response` (object, optional)
  Object returned if the "config.qr.mode" field has been set to "dynamic" or "hybrid".

  - `type_response.qr_data` (string, optional)
  QR frame, which must be transformed into a QR code so that payment can be made.

## Errors

| Status | Error | Description |
| ------- | ------- | ----------- |
| 400 | empty_required_header | The "X-Idempotency-Key" header is required and was not sent. Make the request again including it. |
| 400 | unsupported_site | An attempt was made to create the order from an unsupported country. Make sure you have the necessary authorization. |
| 400 | unsupported_properties | An unsupported property was sent. Check the message returned in the error details to find out what the problem was and try again. |
| 400 | bad_request | An attempt was made to create the order with unsupported or invalid fields. Please retry sending the request, validating all fields and. |
| 400 | property_value | An incorrect value for some property was sent. Check the message returned in the error details to find out what the problem was and try again. |
| 400 | property_type | An incorrect property type was sent. Check the message returned in the error details to find out what the problem was and try again. |
| 400 | marketplace_not_valid | The Access Token sent as a header in the request is not one obtained through the OAuth protocol and, therefore, it is not possible to identify a valid marketplace. Please verify that you have completed the process correctly. |
| 400 | sponsor_id_not_valid | An invalid value was sent as the Mercado Pago account identifier ("USER_ID"). Check the returned message in the error details to find out what the problem was and try again. |
| 401 | unauthorized | The value sent as Access Token is incorrect. Please check and try again with the correct value. |
| 404 | marketplace_fee_not_allowed | The "marketplace_fee" field cannot be submitted because the marketplace could not be found. Please verify if the correct Access Token was sent and try again. |
| 404 | pos_not_found | The value for the "external_pos_id" field does not belong to any POS. Please confirm that you entered the correct value and try again. |
| 409 | idempotency_key_already_used | The value sent as the idempotency header has already been used with a different request within the last 24 hours. Please try the request again sending a new value. |
| 500 | 500 | Generic error. Please check the returned message and try submitting the request again. |

## Request example

### cURL

```bash
curl -X POST \
  'https://api.mercadopago.com/v1/orders' \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer <ACCESS_TOKEN>' \
  -d '{
  "type": "qr",
  "total_amount": "50.00",
  "description": "Smartphone",
  "external_reference": "ext_ref_1234",
  "expiration_time": "PT16M",
  "marketplace_fee": "11.20",
  "integration_data": {
  "platform_id": "dev_1234567890",
  "integrator_id": "dev_1234",
  "sponsor": {
  "id": "446566691"
  }
  },
  "config": {
  "qr": {
  "external_pos_id": "EXTERNALPOS019285",
  "mode": "static"
  }
  },
  "transactions": {
  "payments": {
  "amount": "24.50"
  }
  },
  "items": {
  "title": "Smartphone",
  "unit_price": "24.50",
  "quantity": 1,
  "unit_measure": "kg",
  "external_code": "777489134",
  "external_categories": {
  "id": "device"
  }
  },
  "discounts": {
  "payment_methods": {
  "new_total_amount": "47.28",
  "type": "account_money"
  }
  }
  }'
```

## Response example

```json
{
  "id": "ORD00001111222233334444555566",
  "user_id": "5238400195",
  "type": "qr",
  "external_reference": "ext_ref_1234",
  "description": "Smartphone",
  "expiration_time": "PT16M",
  "processing_mode": "automatic",
  "total_amount": "50.00",
  "country_code": "AR",
  "marketplace_fee": "11.20",
  "integration_data": {
  "application_id": "1234567890",
  "platform_id": "dev_1234567890",
  "integrator_id": "dev_1234",
  "sponsor": {
  "id": "446566691"
  }
  },
  "status": "created",
  "status_detail": "created",
  "currency": "ARS",
  "created_date": "2024-09-10T14:26:42.109Z",
  "last_updated_date": "2024-09-10T14:27:42.109Z",
  "config": {
  "qr": {
  "external_pos_id": "EXTERNALPOS019285",
  "mode": "static"
  }
  },
  "transactions": {
  "payments": [
  {
  "id": "PAY01J67CQQH5904WDBVZEM4JMEP3",
  "amount": "24.50",
  "status": "created",
  "status_detail": "ready_to_process"
  }
  ]
  },
  "items": [
  {
  "title": "Smartphone",
  "unit_price": "24.50",
  "quantity": 1,
  "unit_measure": "kg",
  "external_code": "777489134",
  "external_categories": [
  {
  "id": null
  }
  ]
  }
  ],
  "discounts": {
  "payment_methods": [
  {
  "new_total_amount": "47.28",
  "type": "account_money"
  }
  ]
  },
  "type_response": {
  "qr_data": "00020101021243650016com.mercadolibre020130636261ba79b-e543-41c7-b71a-cec05c18e72b50120008326594305204970053030325802AR5904Test6004CABA63041094"
  }
}
```# Integrar el procesamiento de pagos

El procesamiento de pagos con Mercado Pago Point integrado a tu punto de venta se basa en la creación de orders que contienen asociada una transacción de pago. Al crear una order, esta será cargada automáticamente a la terminal indicada, y el comprador podrá realizar su pago de manera presencial.

El procesamiento de pagos integrado con Mercado Pago Point te permitirá crear orders, procesarlas, cancelarlas o bien realizar reembolsos y consultar su información o actualizaciones de estado. 

> NOTE
>
> Si deseas configurar que las cuotas sean [con](https://www.mercadopago.com.ar/ayuda/24694) o [sin interés](/developers/es/support/cuotas-sin-interes_3299), previo a crear una order, **deberás configurarlas en tu cuenta de Mercado Pago**.

:::AccordionComponent{title="Crear una order"}
Para comenzar a procesar pagos con Point desde los puntos de venta, primero necesitas identificar a qué terminal deseas asignar la order. Recuerda que esta terminal debe haber sido [configurada en modo PDV](/developers/es/reference/in-person-payments/point/terminals/update-operation-mode/patch).

Para eso, envía un **GET** el endpoint :TagComponent{tag="API" text="Obtener lista de terminals" href="/developers/es/reference/in-person-payments/point/terminals/get-terminals/get"}. Utiliza tu :toolTipComponent[Access Token de prueba]{link="/developers/es/docs/mp-point/create-application#bookmark_acceder_a_las_credenciales_de_prueba" linkText="Acceder a las credenciales de prueba" content="Clave privada de la aplicación creada en Mercado Pago, utilizada en el _backend_ durante el desarrollo de la integración. Puedes acceder a ella en *Tus integraciones > Datos de integración > Pruebas > Credenciales de prueba*. Al salir a producción, reemplázalo por el Access Token de producción si se trata de una integración propia, o por el Access Token obtenido mediante OAuth en el caso de integraciones de terceros. El _Access Token_ de prueba comienza con el prefijo `APP_USR`."}.

Recomendamos filtrar la búsqueda utilizando los query params opcionales _query params_ `store_id` y `pos_id`, identificadores de la tienda y la caja devueltos en la respuesta a la creación de cada una.

```curl
curl -X GET \
  'https://api.mercadopago.com/terminals/v1/list?limit=50&offset=0&store_id=12354567&pos_id=23545678' \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer TEST-232********97488-12********26f67454********f4c8b49c********9526408'
```

La respuesta a esta solicitud te permitirá ver las terminals asociadas a tu cuenta y seleccionar la que deseas usar para crear tu order. Podrás identificarla por medio de los últimos caracteres del campo `id`, que deberán coincidir con el serial de la etiqueta trasera de la terminal física.

```json
{
  "data": {
  "terminals": [
  {
  "id": "NEWLAND_N950__N950NCB801293324",
  "pos_id": "23545678",
  "store_id": "12354567",
  "external_pos_id": "SUC0101POS",
  "operating_mode": "PDV"
  }
  ]
  },
  "paging": {
  "total": 1,
  "offset": 0,
  "limit": 50
  }
}
```

Luego, deberás crear la order. Para eso, envía un **POST** al endpoint :TagComponent{tag="API" text="/v1/orders" href="/developers/es/reference/in-person-payments/point/orders/create-order/post"}, cuidando de incluir tu :toolTipComponent[Access Token de prueba]{link="/developers/es/docs/mp-point/create-application#bookmark_acceder_a_las_credenciales_de_prueba" linkText="Acceder a las credenciales de prueba" content="Clave privada de la aplicación creada en Mercado Pago, utilizada en el _backend_ durante el desarrollo de la integración. Puedes acceder a ella en *Tus integraciones > Datos de integración > Pruebas > Credenciales de prueba*. Al salir a producción, reemplázalo por el Access Token de producción si se trata de una integración propia, o por el Access Token obtenido mediante OAuth en el caso de integraciones de terceros. El _Access Token_ de prueba comienza con el prefijo `APP_USR`."}, y el id de la terminal a la que quieres asignar la order, obtenido en el paso anterior.

```curl
curl -X POST \
  'https://api.mercadopago.com/v1/orders' \
  -H 'Content-Type: application/json' \
  -H 'X-Idempotency-Key: 0d5020ed-1af6-469c-ae06-c3bec19954bb' \
  -H 'Authorization: Bearer TEST-232********97488-12********26f67454********f4c8b49c********9526408' \
  -d '{
  "type": "point",
  "external_reference": "ext_ref_1234",
  "expiration_time": "PT16M",
  "transactions": {
  "payments": [
  {
  "amount": "24.00"
  }
  ]
  },
  "config": {
  "point": {
  "terminal_id": "NEWLAND_N950__N950NCB801293324",
  "print_on_terminal": "no_ticket",
  "ticket_number": "S0392JED"
  },
  "payment_method": {
  "default_type": "credit_card"
  }
  },
  "description": "Point Smart 2",
  "integration_data": {
  "platform_id": "dev_1234567890",
  "integrator_id": "dev_1234567890",
  "sponsor": {
  "id": "446566691"
  }
  }
  }'
```

Consulta en la tabla a continuación las descripciones de los parámetros que poseen alguna particularidad importante que debe destacarse.

| Atributo | Tipo | Descripción | Obligatoriedad |
|-----------------------------|--------------|---------------------------------------------------------------------------------------------------------------------------------------------------------------------|-----------|
| `Authorization` | _Header_ | Hace referencia a tu :toolTipComponent[Access Token de prueba]{link="/developers/es/docs/mp-point/create-application#bookmark_acceder_a_las_credenciales_de_prueba" linkText="Acceder a las credenciales de prueba" content="Clave privada de la aplicación creada en Mercado Pago, utilizada en el _backend_ durante el desarrollo de la integración. Puedes acceder a ella en *Tus integraciones > Datos de integración > Pruebas > Credenciales de prueba*. Al salir a producción, reemplázalo por el Access Token de producción si se trata de una integración propia, o por el Access Token obtenido mediante OAuth en el caso de integraciones de terceros. El _Access Token_ de prueba comienza con el prefijo `APP_USR`."}. | Requerido |
| `X-Idempotency-Key` | _Header_ | Llave de idempotencia. Esta llave garantiza que cada solicitud sea procesada una única vez, evitando duplicidades. Utiliza un valor exclusivo en el encabezado de tu solicitud, como un UUID V4 o _strings_ aleatorias. | Requerido |
| `type` | _Body.String_ | Tipo de order, asociado a la solución de Mercado Pago para la que se crea. Para pagos con Mercado Pago Point, el único valor posible es `point`. | Requerido |
| `external_reference` | _Body.String_ | Es una referencia externa de la order, asignada al momento de su creación. Debe ser un valor único para cada order, y no puede contener datos PII. El límite máximo permitido es de 64 caracteres y los permitidos son: **letras mayúsculas y minúsculas**, **números** y **los símbolos de guion (-) y guion bajo (_)**. | Requerido |
| `expiration_time` | _Body. String_ | Indica el **período de validez** de la order de pago a partir de su creación. Durante este tiempo, la order estará habilitada para ser procesada por el cliente; si la order no se procesa dentro del plazo especificado, expirará automáticamente y no podrá ser utilizada, siendo necesario generar una nueva order de pago para continuar. El valor mínimo permitido es 30 segundos (PT30S) y el máximo es 3 horas (PT3H). Ejemplos de uso: para una expiración de 30 segundos: "PT30S", para 10 minutos: "PT10M", y para 1 hora y 15 minutos: "PT1H15M". | Opcional |
| `transaction.payments.amount`| _Body.String_ | Monto total de la order de pago. El campo debe llevar obligatoriamente 2 números decimales, incluso cuando es un número entero (por ejemplo, "10.00"). | Requerido |
| `config.point.terminal_id` | _Body.String_ | Identificador de la terminal Point que obtendrá la order. Debes enviarlo tal cual fue devuelto en el llamado :TagComponent{tag="API" text="Obtener terminals" href="/developers/es/reference/in-person-payments/point/terminals/get-terminals/get"}, como en el siguiente ejemplo: "NEWLAND_N950__N950NCB801293324". | Requerido |

> NOTE
>
> Para conocer en detalle todos los parámetros a ser enviados en esta requisición, consulta nuestra [Referencia de API](/developers/es/reference/in-person-payments/point/orders/create-order/post).

Si la solicitud fue exitosa, la respuesta devolverá una order con estado `created`.

```json
{
  "id": "ORD00001111222233334444555566",
  "type": "point",
  "user_id": "5238400195",
  "external_reference": "ext_ref_1234",
  "description": "Point Smart 2",
  "expiration_time": "PT16M",
  "processing_mode": "automatic",
  "country_code": "ARG",
  "integration_data": {
  "application_id": "1234567890",
  "platform_id": "dev_1234567890",
  "integrator_id": "dev_1234567890",
  "sponsor": {
  "id": "446566691"
  }
  },
  "status": "created",
  "status_detail": "created",
  "created_date": "2024-09-10T14:26:42.109320977Z",
  "last_updated_date": "2024-09-10T14:26:42.109320977Z",
  "config": {
  "point": {
  "terminal_id": "NEWLAND_N950__N950NCB801293324",
  "print_on_terminal": "no_ticket",
  "ticket_number": "S0392JED"
  },
  "payment_method": {
  "default_type": "credit_card",
  }
  },
  "transactions": {
  "payments": [
  {
  "id": "PAY01J67CQQH5904WDBVZEM4JMEP3",
  "amount": "24.00",
  "status": "created"
  }
  ]
  },
}
```

> NOTE
>
> Como la order es la base del procesamiento del pago, es importante que guardes su `id` y el `id` del pago (`transactions.payments.id`) obtenidos al crearla, porque te permitirán realizar otras operaciones y consultar tus notificaciones de manera adecuada. Adicionalmente, puedes consultar nuestra documentación en la **sección Recursos** para conocer mejor sobre los [posibles _status_ de una order y de una transacción](/developers/es/docs/mp-point/resources/status-order-transaction).

Esta order creada será recibida automáticamente por la terminal a la que fue asignada. Si la order no se carga automáticamente en la terminal, debes presionar el botón **Actualizar** o, si la terminal lo tiene, el **botón verde** para recibir la order. Así, el pago podrá ser realizado por el comprador en la terminal y luego procesado. **Ten en cuenta que, si no completas el parámetro `expiration_time`, el pago debe realizarse dentro de los 15 minutos posteriores a la creación de la order; pasado ese tiempo, la order expirará.**

:::
:::::AccordionComponent{title="Cancelar una order"}
La cancelación de una order se puede realizar por dos vías, dependiendo del estado en el que se encuentre.

- Si el `status` de la order es `created`, su cancelación debe realizarse vía API.
- Si su `status` es `at_terminal`, significa que la order ya fue obtenida por la terminal y deberá ser cancelada desde allí.

> WARNING
>
> Si no completas el parámetro `expiration_time`, si la order no es procesada en **hasta 15 minutos después de su creación**, su `status` pasará a ser `expired` y ya no podrás cancelarla.
> <br>
> Además, en el caso de cancelaciones desde la terminal, es importante tener previamente configuradas tus [notificaciones Webhooks](/developers/es/docs/mp-point/notifications) para recibir el aviso de la cancelación en tu sistema, lo que te permitirá mantener tu conciliación.

Elige la opción que mejor se adecúe a tus necesidades para conocer cómo cancelar tu order.

::::TabsComponent

:::TabComponent{title="Vía API"}
Si deseas cancelar una order con estado `created`, deberás enviar un **POST** al endpoint :TagComponent{tag="API" text="/v1/orders/{order_id}/cancel" href="/developers/es/reference/in-person-payments/point/orders/cancel-order/post"}, cuidando de incluir tu :toolTipComponent[Access Token de prueba]{link="/developers/es/docs/mp-point/create-application#bookmark_acceder_a_las_credenciales_de_prueba" linkText="Acceder a las credenciales de prueba" content="Clave privada de la aplicación creada en Mercado Pago, utilizada en el _backend_ durante el desarrollo de la integración. Puedes acceder a ella en *Tus integraciones > Datos de integración > Pruebas > Credenciales de prueba*. Al salir a producción, reemplázalo por el Access Token de producción si se trata de una integración propia, o por el Access Token obtenido mediante OAuth en el caso de integraciones de terceros. El _Access Token_ de prueba comienza con el prefijo `APP_USR`."}, y el `id` de la order cuya cancelación quieres realizar, obtenido en la respuesta a su creación.

```curl
curl -X POST \
  'https://api.mercadopago.com/v1/orders/ORDER_ID/cancel' \
  -H 'Content-Type: application/json' \
  -H 'X-Idempotency-Key: 0d5020ed-1af6-469c-ae06-c3bec19954bb' \
  -H 'Authorization: Bearer ACCESS_TOKEN'
```

Si la solicitud fue exitosa, la respuesta mostrará un `status=canceled`.

```json
{
  "id": "ORD0000ABCD222233334444555566",
  "user_id": "5238400195",
  "type": "point",
  "external_reference": "ext_ref_1234",
  "description": "Point Smart 2",
  "expiration_time": "PT16M",
  "country_code": "ARG",
  "processing_mode": "automatic",
  "integration_data": {
  "application_id": "1234567890",
  "platform_id": "dev_1234567890",
  "integrator_id": "dev_1234567890",
  "sponsor": {
  "id": "446566691"
  }
  },
  "status": "canceled",
  "status_detail": "canceled",
  "created_date": "2024-09-10T14:26:42.109320977Z",
  "last_updated_date": "2024-09-10T14:26:42.109320977Z",
  "config": {
  "point": {
  "terminal_id": "NEWLAND_N950__N950NCB801293324",
  "print_on_terminal": "no_ticket",
  "ticket_number": "S0392JED"
  },
  "payment_method": {
  "default_type": "credit_card",
  "default_installments": "6",
  "installments_cost": "seller"
  }
  },
  "transactions": {
  "payments": [
  {
  "id": "PAY01J67CQQH5904WDBVZEM4JMEP3",
  "amount": "24.00",
  "status": "canceled",
  "status_detail": "canceled_by_api"
  }
  ]
  },
}
```

:::
:::TabComponent{title="Desde la terminal"}

Como la order es obtenida de manera automática por la terminal, para cancelarla deberás salir de la pantalla sin finalizar el cobro. Para eso, presiona el **botón inferior derecho** en la terminal. 

Luego, cuando aparezca la pregunta por si deseas salir sin finalizar, elige la opción **Sí**.

Al finalizar la cancelación vía terminal, y una vez configuradas tus [notificaciones Webhooks](/developers/es/docs/mp-point/notifications), recibirás el aviso en tu sistema, que te permitirá mantener tu conciliación.

:::
::::
:::::

:::::AccordionComponent{title="Reembolsar una order"}

En caso de necesitarlo, es posible reembolsar una order creada mediante nuestra API. Este endpoint permite realizar la devolución **total o parcial** de una transacción de pago asociada a la order. Para solicitar un reembolso total, no es necesario enviar un `body` en la requisición. Para el reembolso parcial, es necesario informar en el `body` el valor a reembolsar y el identificador de la transacción.

> WARNING
>
> Una order podrá ser reembolsada vía API **hasta 90 días después de realizado su pago**. Pasado ese plazo, ya no será posible realizar la devolución. En algunas orders, dependiendo del adquirente y de la bandera de la tarjeta, el reembolso deberá procesarse directamente en la terminal física, ya que es necesario insertar la tarjeta en el dispositivo.

Elige la opción que mejor se adapte a tus necesidades y sigue las instrucciones correspondientes.

::::TabsComponent

:::TabComponent{title="Reembolso total"}

Para realizar el reembolso **total** de una order, envía un **POST** al endpoint :TagComponent{tag="API" text="/v1/orders/{order_id}/refund" href="/developers/es/reference/in-person-payments/point/orders/refund-order/post"} **sin enviar body** en la requisición. Asegúrate de incluir tu :toolTipComponent[Access Token de prueba]{link="/developers/es/docs/mp-point/create-application#bookmark_acceder_a_las_credenciales_de_prueba" linkText="Acceder a las credenciales de prueba" content="Clave privada de la aplicación creada en Mercado Pago, utilizada en el _backend_ durante el desarrollo de la integración. Puedes acceder a ella en *Tus integraciones > Datos de integración > Pruebas > Credenciales de prueba*. Al salir a producción, reemplázalo por el Access Token de producción si se trata de una integración propia, o por el Access Token obtenido mediante OAuth en el caso de integraciones de terceros. El _Access Token_ de prueba comienza con el prefijo `APP_USR`."}. También es necesario informar el `id` de la order que deseas reembolsar, obtenido en la respuesta a su creación.

```curl
curl -X POST \
  'https://api.mercadopago.com/v1/orders/ORDER_ID/refund' \
  -H 'Content-Type: application/json' \
  -H 'X-Idempotency-Key: 0d5020ed-1af6-469c-ae06-c3bec19954bb' \
  -H 'Authorization: Bearer ACCESS_TOKEN'
```

Si la solicitud fue exitosa, la respuesta mostrará el `status=refunded` y un nuevo nodo `transactions.refunds`, que contendrá los detalles del reembolso, junto con el `id` del pago original y el `id` de la transacción de reembolso.

```json
{
  "id": "ORD0000ABCD222233334444555566",
  "status": "refunded",
  "status_detail": "refunded",
  "transactions": {
  "refunds": [
  {
  "id": "REF01J67CQQH5904WDBVZEM1234D",
  "transaction_id": "PAY01J67CQQH5904WDBVZEM4JMEP3",
  "reference_id": "12345678",
  "amount": "38.00",
  "status": "processed"
  }
  ]
  }
}
```

:::

:::TabComponent{title="Reembolso parcial"}

Para realizar el reembolso **parcial** de una order, envía un **POST** al endpoint :TagComponent{tag="API" text="/v1/orders/{order_id}/refund" href="/developers/es/reference/in-person-payments/point/orders/refund-order/post"}, incluyendo en el **body** de la requisición el array `transactions` con el identificador de la transacción de pago (`id`) y el valor a reembolsar (`amount`). Asegúrate de incluir tu :toolTipComponent[Access Token de prueba]{link="/developers/es/docs/mp-point/create-application#bookmark_acceder_a_las_credenciales_de_prueba" linkText="Acceder a las credenciales de prueba" content="Clave privada de la aplicación creada en Mercado Pago, utilizada en el _backend_ durante el desarrollo de la integración. Puedes acceder a ella en *Tus integraciones > Datos de integración > Pruebas > Credenciales de prueba*. Al salir a producción, reemplázalo por el Access Token de producción si se trata de una integración propia, o por el Access Token obtenido mediante OAuth en el caso de integraciones de terceros. El _Access Token_ de prueba comienza con el prefijo `APP_USR`."}. Deberás enviar los campos tal como se indica en la tabla a continuación.

> WARNING
>
> Los reembolsos parciales están disponibles para pagos realizados con tarjeta, códigos QR pagados con la billetera de Mercado Pago y otras billeteras.

```curl
curl -X POST \
  'https://api.mercadopago.com/v1/orders/ORDER_ID/refund' \
  -H 'Content-Type: application/json' \
  -H 'X-Idempotency-Key: 0d5020ed-1af6-469c-ae06-c3bec19954bb' \
  -H 'Authorization: Bearer ACCESS_TOKEN' \
  -d '{
  "transactions": [
  {
  "id": "TRANSACTION_ID",
  "amount": "24.90"
  }
  ]
  }'
```
| Atributo | Tipo | Descripción | Obligatoriedad |
|-|-|-|-|
| `order_id` | _String_ | ID de la order que contiene la transacción de pago asociada a reembolsar. Este valor se devuelve en la respuesta a la solicitud de [Crear una order](/developers/es/docs/mp-point/payment-processing#:~:text=Crear%20una%20order-,Para,-comenzar%20a%20procesar). | Obligatorio. |
| `transactions` | _Array_ | Contiene información sobre la transacción asociada a la order que será reembolsada. | Obligatorio para reembolsos parciales. |
| `transactions.id` | _String_ | Identificador de la transacción de pago creada en la solicitud, obtenido en la respuesta a la creación de la order (`transactions.payments.id`). | Obligatorio para reembolsos parciales. |
| `transactions.amount` | _String_ | Valor a ser reembolsado. Es posible realizar múltiples reembolsos parciales, siempre que la suma no supere el valor total de la transacción. | Obligatorio para reembolsos parciales. |

Si la solicitud fue exitosa, la respuesta mostrará `status=processed` (si aún hay saldo en la order) y `status_detail=partially_refunded`, además del nodo `transactions.refunds` con los detalles del reembolso parcial.

```json
{
  "id": "ORD01J49MMW3SSBK5PSV3DFR32959",
  "status": "processed",
  "status_detail": "partially_refunded",
  "transactions": {
  "refunds": [
  {
  "id": "REF01J49MMW3SSBK5PSV3DFR32959",
  "transaction_id": "PAY01JEVQM06WDW16MAQ8B5SC0MSC",
  "reference_id": "12345678",
  "amount": "24.90",
  "status": "processed"
  }
  ]
  }
}
```

:::

::::

:::::

:::::AccordionComponent{title="Consultar datos de una order"}
Si lo necesitas, puedes consultar los datos de una order y sus transacciones asociadas, sean pagos o reembolsos, incluídos sus estados o valores.

Si bien la utilización recurrente de esta consulta vía API **no es recomendada**, sí puede resultar útil en caso de que requieras información adicional sobre la order.

Para consultar los datos de una order, envía un **GET** al endpoint :TagComponent{tag="API" text="/v1/orders/{order_id}" href="/developers/es/reference/in-person-payments/point/orders/get-order/get"}, cuidando de incluir tu :toolTipComponent[Access Token de prueba]{link="/developers/es/docs/mp-point/create-application#bookmark_acceder_a_las_credenciales_de_prueba" linkText="Acceder a las credenciales de prueba" content="Clave privada de la aplicación creada en Mercado Pago, utilizada en el _backend_ durante el desarrollo de la integración. Puedes acceder a ella en *Tus integraciones > Datos de integración > Pruebas > Credenciales de prueba*. Al salir a producción, reemplázalo por el Access Token de producción si se trata de una integración propia, o por el Access Token obtenido mediante OAuth en el caso de integraciones de terceros. El _Access Token_ de prueba comienza con el prefijo `APP_USR`."}, y el `id` de la order cuya información quieres consultar, obtenido en la respuesta a su creación.

> WARNING
>
> Ten en cuenta que esta solicitud solo permitirá consultar las **orders creadas con una antigüedad menor a 3 meses**. Si necesitas información sobre orders anteriores, te recomendamos que contactes a nuestro servicio de atención al cliente para obtener asistencia adicional.

```curl
curl -X GET \
  'https://api.mercadopago.com/v1/orders/ORDER_ID' \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer ACCESS_TOKEN'
```

Si la solicitud fue exitosa, la respuesta te devolverá toda la información de la order, incluidos su estado y el estado del pago y/o del reembolso en tiempo real:

```json
{
  "id": "ORD00001111222233334444555566",
  "user_id": "5238400195",
  "type": "point",
  "external_reference": "ext_ref_1234",
  "processing_mode": "automatic",
  "description": "Point Smart 2",
  "expiration_time": "PT16M",
  "country_code": "ARG",
  "integration_data": {
  "application_id": "1234567890",
  "platform_id": "dev_1234567890",
  "integrator_id": "dev_1234567890",
  "sponsor": {
  "id": "446566691"
  }
  },
  "status": "refunded",
  "status_detail": "refunded",
  "created_date": "2024-09-10T14:26:42.109320977Z",
  "last_updated_date": "2024-09-10T14:26:42.109320977Z",
  "config": {
  "point": {
  "terminal_id": "NEWLAND_N950__N950NCB801293324",
  "print_on_terminal": "no_ticket",
  "ticket_number": "S0392JED"
  },
  "payment_method": {
  "default_type": "credit_card",
  "default_installments": "6",
  "installments_cost": "seller"
  }
  },
  "transactions": {
  "payments": [
  {
  "id": "PAY01J67CQQH5904WDBVZEM4JMEP3",
  "amount": "24.00",
  "refunded_amount": "38.00",
  "tip_amount": "14.00",
  "paid_amount": "38.00",
  "status": "refunded",
  "status_detail": "created",
  "reference_id": "12345678",
  "payment_method": {
  "type": "credit_card",
  "installments": 1,
  "id": "master"
  }
  }
  ],
  "refunds": [
  {
  "id": "REF01J67CQQH5904WDBVZEM1234D",
  "transaction_id": "PAY01J67CQQH5904WDBVZEM4JMEP3",
  "reference_id": "12345678",
  "amount": "38.00",
  "status": "processed"
  }
  ]
  },
}
```

:::::