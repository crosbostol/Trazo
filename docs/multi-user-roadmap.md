# Evolución futura a cuentas de usuario

Esta fase no implementa multiusuario ni agrega un `UserId` ficticio. La identidad
`personal` del servicio de autenticación actual es temporal y no forma parte del
modelo de entrenamientos.

## Entidad y ownership

Una futura entidad `User` tendrá un identificador interno estable (por ejemplo
UUID), independiente de correo, proveedor o nombre visible. Las identidades OIDC
se asociarán por `(Issuer, Subject)`, únicos, sin usar el correo como identificador
de seguridad. Si se admiten contraseñas propias, usar ASP.NET Core Identity o una
implementación estándar con hash por usuario, rotación y políticas explícitas.

`Activity` y `BodyMeasurement` necesitarán `UserId NOT NULL` con FK. RunningDetails,
laps, ejercicios y sets pueden heredar ownership a través de Activity; duplicar
UserId en todas las tablas introduce riesgos de inconsistencia sin aportar valor
inmediato. No hacer cascade desde User hacia todos sus datos sin diseñar antes
un procedimiento deliberado de cierre de cuenta, exportación y retención.

## Migración desde el diario personal

1. Respaldar y verificar recuperación; identificar inequívocamente al dueño real.
2. Crear la cuenta y columnas UserId inicialmente nullable.
3. Asignar todos los registros existentes a esa cuenta mediante una migración de
   datos explícita, transaccional y auditable. Nunca asignar al primer usuario que
   se registre ni aceptar UserId enviado por un cliente.
4. Verificar cero registros huérfanos y consistencia de dependientes; agregar FK y
   NOT NULL. Crear índices nuevos antes de habilitar tráfico multiusuario.
5. Invalidar las sesiones del mecanismo personal y habilitar el nuevo login.

## Autenticación y autorización

Reemplazar `IPersonalAuthenticator` y los endpoints de login por cuentas
persistentes / Identity / OpenID Connect. Mantener cookies HttpOnly, CSRF,
protección de claves compartidas y respuestas 401/403. Una sesión autenticada no
equivale a acceso a todos los registros: introducir un servicio de usuario actual
y autorización de ownership obligatoria para cada consulta, detalle, importación,
modificación y borrado. No confiar en IDs de la URL ni parámetros del cliente.

Un filtro global EF puede ayudar, pero no sustituye revisión de SQL directo,
ExecuteDelete/Update, procesos administrativos ni endpoints. Para un producto con
mayor riesgo, evaluar PostgreSQL RLS como segunda barrera, con contexto transaccional
por usuario y pruebas explícitas del pool de conexiones.

## Consultas, índices y constraints

- Activities: índice `(UserId, Date DESC, CreatedAt DESC)` para historial y
  dashboard; agregar paginación estable. Evaluar `(UserId, Type, Date)` con planes
  reales antes de agregarlo.
- BodyMeasurements: `(UserId, Date DESC, Id)`; no imponer fecha única sin definir
  si se permiten varias mediciones diarias.
- Mantener los constraints actuales de integridad y unicidad de laps/sets/orden
  dentro de sus padres. Las claves UUID pueden seguir siendo globales.
- Agregados, gráficos, búsquedas, exportaciones y cachés deben estar particionados
  por usuario. Una clave de caché global filtraría información entre cuentas.
- Seeds solo en entornos demo explícitos; nunca crear cuentas reales por seed.

## Pruebas obligatorias antes de habilitarlo

Dos usuarios con actividades y mediciones distintas: cada uno debe ver solo sus
filas y agregados. Probar lectura/borrado con UUID del otro usuario, importación
con UserId falsificado, sesiones revocadas, SQL directo y restauración de backup.
Revisar cuotas, rate limiting por identidad, políticas de privacidad y eliminación
de cuenta cuando exista realmente un producto multiusuario.
