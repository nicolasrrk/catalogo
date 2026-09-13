# Catálogo web GenStore

Catálogo responsive conectado al stock real del ERP de GenStore. La experiencia pública está pensada para una tarea breve: ver, elegir y comprar por WhatsApp.

## Funcionalidades

- Catálogo con búsqueda, categorías, disponibilidad y carga progresiva.
- Precio y stock sincronizados desde `public.erp_data.stock`.
- Canal Realtime limitado a `public.catalog_products`.
- Mensaje de WhatsApp automático con producto y precio.
- Galería y detalle de producto accesible mediante `dialog` nativo.
- Ingreso administrativo con Supabase Auth, sin registro público.
- Carga múltiple de fotos por producto desde el panel administrativo.
- Orden manual de la vidriera, productos destacados y precios de oferta desde el panel administrativo.
- Panel privado con resumen del inventario del ERP.
- Diseño mobile-first con la paleta marfil, negro, caramelo y acero.
- Respaldo local si el servicio de stock no responde.

## Ejecutar localmente

El catálogo usa módulos remotos y consultas a Supabase, por lo que conviene servirlo por HTTP:

```powershell
python -m http.server 4173
```

Después abrí `http://127.0.0.1:4173`.

## Configuración comercial

Editá `js/config.js` para cambiar:

- `whatsappNumber`: número con código de país, sin `+`, espacios ni guiones.
- `genericMessage`, `recommendationMessage` y `productMessage`.
- `hiddenProductSlugs`: productos que deben permanecer en el ERP pero no mostrarse en la vidriera online.
- `socialLinks`: pegá las URLs completas de Instagram, Facebook y TikTok. Los enlaces vacíos no se muestran.

Las fotos nuevas se guardan en el bucket público `product-images` de Supabase Storage. La tabla `catalog_product_images` las relaciona con la clave estable `catalog_products.slug`; `js/products.js` queda únicamente como respaldo local. El precio y el stock siempre llegan de Supabase.

El orden y las promociones viven en `catalog_product_merchandising`, una tabla separada del stock para que la sincronización del ERP no los sobrescriba. `position` controla el orden; `is_featured` publica el producto en **Destacados** y `offer_price` lo publica en **Ofertas** cuando es menor que el precio normal.

## Ordenar productos y crear promociones

1. Iniciá sesión desde **Acceso administrativo**.
2. En **Ordenar y promocionar**, elegí **Todos**, **Destacados** u **Ofertas** para ordenar cada grupo por separado.
3. Arrastrá productos o usá las flechas para cambiar su posición.
4. Activá **Destacado** para mostrar un producto en esa sección.
5. Activá **Oferta** y escribí un precio menor al normal.
6. Presioná **Guardar cambios**. La vidriera se actualiza en tiempo real.

## Agregar fotos como administrador

1. Abrí el acceso administrativo e iniciá sesión con las credenciales del ERP.
2. En **Agregar imágenes**, elegí el producto.
3. Seleccioná entre 1 y 8 archivos JPG, PNG, WebP o AVIF de hasta 5 MB cada uno.
4. Presioná **Agregar imágenes**. La primera foto publicada para ese producto se usa como portada.

El navegador usa solamente la clave pública. Las políticas RLS permiten subir archivos y escribir metadatos únicamente al usuario que posee la fila privada de `erp_data`.

## Arquitectura de datos

`erp_data` mantiene su RLS privada por usuario. Un trigger interno copia solamente estos campos a `catalog_products`:

- nombre
- categoría
- precio de venta
- stock actual
- fecha de actualización

Las tablas públicas conceden lectura anónima de productos y fotos, pero no permiten altas, cambios ni borrados públicos. `catalog_products` y `catalog_product_images` participan de `supabase_realtime`; ventas, clientes, gastos, costos y proveedores no se emiten al navegador.

## Seguridad

- La web utiliza exclusivamente una clave publicable de Supabase. Nunca agregues una `service_role` key al frontend.
- La sesión admin se mantiene en memoria y se pierde al cerrar o recargar la página.
- No existe pantalla pública de registro ni recuperación de cuentas.
- Los datos de Supabase se insertan en el DOM con `textContent`, no con HTML dinámico.
- La política CSP y los encabezados recomendados están en `index.html` y `_headers`.
- Para producción, activá Leaked Password Protection y CAPTCHA desde Supabase Auth, limitá los orígenes permitidos y serví siempre por HTTPS.

## Publicación

El proyecto no requiere build. Se puede publicar en Netlify, Cloudflare Pages, GitHub Pages o un hosting estático. En plataformas compatibles con el formato Netlify, `_headers` aplica los encabezados de seguridad automáticamente. En otros proveedores, copiá esas reglas a la configuración del hosting.
