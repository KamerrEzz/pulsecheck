# PulseCheck

Un monitor de estado de servicios auto-hospedado, simple y eficiente. Construido con Node.js, HTMX y Redis.

## Stack Tecnológico

*   **Backend:** Node.js, Express
*   **Base de Datos:** PostgreSQL (ORM: Prisma)
*   **Cache & Mensajería:** Redis (Status cache, Time-series buffering, Session store)
*   **Frontend:** Handlebars (SSR), TailwindCSS
*   **Interactividad:** HTMX (Polling, Partial swaps), Chart.js
*   **Infraestructura:** Docker Compose (DBs)

## Funcionalidades

*   **Monitoreo en Segundo Plano:** Worker dedicado (`node-cron`) que verifica los servicios periódicamente.
*   **Dashboard en Tiempo Real:** Actualizaciones automáticas de estado sin recarga de página (HTMX Polling).
*   **Métricas:**
    *   Cálculo de Uptime y Tiempo de Respuesta Promedio (ventana de 1 hora).
    *   Gráficos históricos (Sparklines y Chart.js).
    *   Logs de eventos recientes.
*   **Gestión de Servicios:** CRUD completo, borrado suave, chequeo manual inmediato ("Check Now").
*   **Autenticación:** Sistema de usuarios seguro con Passport.js.

## Configuración Local

### Prerrequisitos

*   Node.js (v18+)
*   pnpm
*   Docker & Docker Compose

### Instalación

1.  **Instalar dependencias:**
    ```bash
    pnpm install
    ```

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

## Estructura del Proyecto

*   `src/app.js`: Punto de entrada y configuración de Express.
*   `src/services/monitor.js`: Lógica del worker de monitoreo en segundo plano.
*   `src/controllers/`: Lógica de negocio (Servicios, Auth, Dashboard).
*   `src/views/`: Plantillas Handlebars y componentes parciales.
*   `prisma/`: Esquema de base de datos y scripts de seed.

## Notas de Desarrollo

*   **HTMX:** Se utiliza extensivamente para evitar recargas completas. Busca atributos `hx-*` en las vistas para entender el flujo de datos.
*   **Redis:** Se usa como "source of truth" para el estado en tiempo real para reducir la carga en Postgres. La persistencia histórica se guarda en Postgres asíncronamente (o directamente en el worker).

## 🚀 Puntos Destacados de Ingeniería

*   **Arquitectura Híbrida (SSR + HTMX):** En lugar de cargar megabytes de JavaScript (React/Vue) para una tarea simple, utilizamos **HTML-over-the-wire**. El servidor renderiza HTML parcial y el cliente solo intercambia el DOM necesario. Resultado: Tiempos de carga casi instantáneos y consumo de memoria mínimo en el navegador.
*   **Estrategia "Redis-First" para Tiempo Real:** El dashboard no castiga la base de datos principal (PostgreSQL) con lecturas constantes. El estado actual y el historial inmediato (Sparklines) se sirven directamente desde la memoria (Redis), permitiendo escalar a miles de servicios monitoreados sin saturar el disco I/O.
*   **Worker de Monitoreo Desacoplado:** El proceso de verificación (`monitor.js`) corre independientemente del servidor web HTTP. Si la interfaz web recibe mucho tráfico, el monitoreo no se ralentiza; y si el monitoreo es pesado, la interfaz no se congela.
*   **Visualización de Datos Eficiente:** Los gráficos históricos ("sparklines") se construyen con estructuras de datos de lista en Redis (`RPUSH`/`LRANGE`), optimizadas para escrituras frecuentes y lecturas de rangos temporales, evitando consultas SQL complejas para datos efímeros.

### 💡 ¿Por qué Handlebars y no Next.js/React?

En un ecosistema dominado por SPAs (Single Page Applications) y frameworks pesados, PulseCheck apuesta por la simplicidad radical:

1.  **Cero Build Step en Frontend:** No hay Webpack, ni Babel, ni hidratación compleja. El servidor entrega HTML listo para usar. Esto significa arranques más rápidos y un despliegue trivial.
2.  **Menor Huella de Memoria:** Al mover la lógica de renderizado al servidor (Node.js), el cliente recibe solo HTML y CSS. Esto hace que el dashboard sea accesible incluso desde dispositivos con recursos limitados o conexiones lentas, donde una SPA pesada sufriría.
3.  **HATEOAS Real:** Con HTMX, el estado de la aplicación está en el HTML mismo, no en un store de JSON sincronizado. Esto simplifica drásticamente la gestión de estado: el servidor es la única fuente de verdad.
4.  **Enfoque "Backend-Driven":** Permite iterar la UI modificando solo las plantillas del backend, sin tener que mantener dos bases de código separadas (API + Frontend) y sus respectivos contratos de tipos.
