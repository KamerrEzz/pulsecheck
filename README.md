# PulseCheck

![PulseCheck Dashboard Mockup](wallpaper.png)

Un monitor de estado de servicios auto-hospedado, simple y eficiente. Construido con Node.js, HTMX y Redis.

> 🔭 Si buscás algo más completo (métricas + logs + alertas), mirá **[theminidog](https://github.com/KamerrEzz/theminidog)** — la evolución de esta misma idea, escrita en Go.

## Stack Tecnológico

*   **Backend:** Node.js, Express
*   **Base de Datos:** PostgreSQL (ORM: Prisma)
*   **Cache & Mensajería:** Redis (Status cache, Time-series buffering, Session store)
*   **Frontend:** Handlebars (SSR), TailwindCSS
*   **Interactividad:** HTMX (Polling, Partial swaps), Chart.js
*   **Infraestructura:** Docker Compose (DBs)

## Funcionalidades

*   **Monitoreo Integrado:** Cron en el mismo proceso verifica los servicios periódicamente.
*   **Dashboard en Tiempo Real:** Actualizaciones automáticas de estado sin recarga de página (HTMX Polling).
*   **Métricas:**
    *   Cálculo de Uptime y Tiempo de Respuesta Promedio (ventana de 1 hora).
    *   Gráficos históricos (Sparklines y Chart.js).
    *   Logs de eventos recientes.
*   **Gestión de Servicios:** CRUD completo, borrado suave, chequeo manual inmediato ("Check Now").
*   **Autenticación:** Sistema de usuarios seguro con Passport.js.
*   **Análisis con IA (opcional):** narrativa técnica del estado del servicio generada por LLM, con severidad calculada de forma determinística en JS (ver [AI Analysis](#ai-analysis)).

## Configuración Local

### Prerrequisitos

*   Node.js (v22+, requerido por el Vercel AI SDK usado en la feature de análisis con IA)
*   pnpm
*   Docker & Docker Compose

### Instalación

1.  **Instalar dependencias:**
    ```bash
    pnpm install
    ```

    > ⚠️ Tras una instalación fresca, genera el cliente Prisma antes de arrancar:
    > ```bash
    > npx prisma generate
    > ```
    > Sin este paso el arranque falla con `Cannot find module .prisma/client/default`.

2.  **Levantar servicios de infraestructura:**
    ```bash
    docker-compose up -d
    ```
    *Esto iniciará contenedores para PostgreSQL y Redis.*

3.  **Configurar variables de entorno:**
    Crea un archivo `.env` en la raíz (puedes basarte en este ejemplo):
    ```env
    PORT=3000
    DATABASE_URL="postgresql://user:password@localhost:5432/pulsecheck?schema=public"
    REDIS_URL="redis://localhost:6379"
    SESSION_SECRET="tu_secreto_super_seguro"

    # Opcional — habilita el botón "Analyze with AI" en el detalle de servicio
    AI_PROVIDER="openai"              # "openai" | "anthropic" | "google"
    AI_API_KEY="sk-..."
    AI_MODEL="gpt-5-nano"             # opcional, usa el default más barato del provider
    AI_MAX_TOKENS=1024
    AI_TIMEOUT_MS=15000
    AI_GLOBAL_ANALYSIS_LIMIT=500      # techo global de análisis/mes
    AI_USER_ANALYSIS_LIMIT=50         # límite por usuario/día
    ```

4.  **Inicializar base de datos:**
    ```bash
    npx prisma migrate dev --name init
    ```

5.  **Datos de prueba (Opcional):**
    Genera usuarios y eventos de prueba para visualizar gráficos inmediatamente.
    ```bash
    npx prisma db seed
    ```

### Ejecución

Modo desarrollo (con hot-reload y watch de CSS):
```bash
pnpm run dev
```

El servidor estará disponible en `http://localhost:3000`.

## Docker

*   **Imagen de la aplicación:** el `Dockerfile` compila una imagen lista para producción (pnpm + cliente Prisma generado durante el build, por lo que no se necesita `prisma generate` en runtime).
    ```bash
    docker build -t pulsecheck .
    ```
    En runtime la imagen espera `DATABASE_URL`, `REDIS_URL` y `SESSION_SECRET`.
*   **Infraestructura local (PostgreSQL + Redis):** `docker-compose.yml` levanta solo las bases de datos (ver paso 2 de Configuración Local).

## AI Analysis

Desde el detalle de un servicio (`/services/:id`), el botón **"Analyze with AI"** dispara un análisis con LLM sobre los eventos de monitoreo recientes. Solo aparece si `AI_API_KEY` está configurada.

*   **Streaming:** la narrativa se transmite al navegador vía Server-Sent Events y aparece palabra a palabra. Los campos estructurados (severidad, categoría, recomendación) se entregan recién al finalizar el stream.
*   **Severidad determinística:** se calcula en JS (`src/services/ai/severity.js`) a partir de métricas — el modelo nunca decide la severidad, solo la recibe como contexto.
*   **Provider intercambiable:** usa el [Vercel AI SDK](https://sdk.vercel.ai) (`ai` + `@ai-sdk/openai` / `@ai-sdk/anthropic` / `@ai-sdk/google`); cambiar de proveedor es solo cambiar `AI_PROVIDER` y `AI_API_KEY`.
*   **Sanitización de prompt:** `service.name` y `service.url` se escapan y delimitan explícitamente (`src/services/ai/sanitize.js`) antes de entrar al prompt, para mitigar prompt injection.
*   **Límites de presupuesto:** techo global mensual (`AI_GLOBAL_ANALYSIS_LIMIT`) y por usuario diario (`AI_USER_ANALYSIS_LIMIT`), verificados contra la tabla `Analysis` antes de llamar al modelo.
*   **Persistencia:** cada análisis se guarda en la tabla `Analysis` (narrativa, métricas de tokens/latencia, proveedor/modelo, ventana de eventos analizada).
*   **Suite de evaluación:** `tests/ai/evaluation.test.js` corre 14 casos (8 normales + 4 adversariales) contra la API real con un juez LLM que verifica fidelidad de la narrativa a los datos de entrada. Se salta automáticamente si no hay `AI_API_KEY`; en CI corre en un job aparte (`eval-ai`) solo en PRs con la label `ai-eval`.

> Nota técnica: `ai` y `@ai-sdk/*` se distribuyen solo como ESM. Node 22.12+ soporta `require()` de grafos ESM síncronos de forma nativa, así que el resto del proyecto sigue en CommonJS sin cambios — ver `src/services/ai/provider.js`.

## Estructura del Proyecto

*   `src/app.js`: Punto de entrada y configuración de Express.
*   `src/services/monitor.js`: Lógica del worker de monitoreo en segundo plano.
*   `src/services/ai/`: Análisis con IA — provider factory, sanitización, severidad, orquestador.
*   `src/controllers/`: Lógica de negocio (Servicios, Auth, Dashboard, Análisis IA).
*   `src/views/`: Plantillas Handlebars y componentes parciales.
*   `prisma/`: Esquema de base de datos y scripts de seed.

## Notas de Desarrollo

*   **HTMX:** Se utiliza extensivamente para evitar recargas completas. Busca atributos `hx-*` en las vistas para entender el flujo de datos.
*   **Redis:** Se usa como "source of truth" para el estado en tiempo real para reducir la carga en Postgres. La persistencia histórica se guarda en Postgres asíncronamente (o directamente en el worker).

## 🚀 Puntos Destacados de Ingeniería

*   **Arquitectura Híbrida (SSR + HTMX):** En lugar de cargar megabytes de JavaScript (React/Vue) para una tarea simple, utilizamos **HTML-over-the-wire**. El servidor renderiza HTML parcial y el cliente solo intercambia el DOM necesario. Resultado: Tiempos de carga casi instantáneos y consumo de memoria mínimo en el navegador.
*   **Estrategia "Redis-First" para Tiempo Real:** El dashboard no castiga la base de datos principal (PostgreSQL) con lecturas constantes. El estado actual y el historial inmediato (Sparklines) se sirven directamente desde la memoria (Redis), permitiendo escalar a miles de servicios monitoreados sin saturar el disco I/O.
*   **Monitoreo en el Mismo Proceso:** La verificación (`monitor.js`) corre como cron dentro del proceso principal de Express, compartiendo el event loop con el servidor web. Esto mantiene la infraestructura simple, aunque un pico de tráfico web podría teóricamente afectar la latencia de las verificaciones.
*   **Visualización de Datos Eficiente:** Los gráficos históricos ("sparklines") se construyen con estructuras de datos de lista en Redis (`RPUSH`/`LRANGE`), optimizadas para escrituras frecuentes y lecturas de rangos temporales, evitando consultas SQL complejas para datos efímeros.

### 💡 ¿Por qué Handlebars y no Next.js/React?

En un ecosistema dominado por SPAs (Single Page Applications) y frameworks pesados, PulseCheck apuesta por la simplicidad radical:

1.  **Cero Build Step en Frontend:** No hay Webpack, ni Babel, ni hidratación compleja. El servidor entrega HTML listo para usar. Esto significa arranques más rápidos y un despliegue trivial.
2.  **Menor Huella de Memoria:** Al mover la lógica de renderizado al servidor (Node.js), el cliente recibe solo HTML y CSS. Esto hace que el dashboard sea accesible incluso desde dispositivos con recursos limitados o conexiones lentas, donde una SPA pesada sufriría.
3.  **HATEOAS Real:** Con HTMX, el estado de la aplicación está en el HTML mismo, no en un store de JSON sincronizado. Esto simplifica drásticamente la gestión de estado: el servidor es la única fuente de verdad.
4.  **Enfoque "Backend-Driven":** Permite iterar la UI modificando solo las plantillas del backend, sin tener que mantener dos bases de código separadas (API + Frontend) y sus respectivos contratos de tipos.
