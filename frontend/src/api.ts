let csrfToken = "";
export function setCsrfToken(value: string) {
  csrfToken = value;
}
export async function api<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`/api${path}`, {
    ...options,
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json",
      ...(options?.method &&
      !["GET", "HEAD"].includes(options.method.toUpperCase())
        ? { "X-CSRF-TOKEN": csrfToken }
        : {}),
      ...options?.headers,
    },
  });
  if (!response.ok) {
    if (response.status === 401 && path !== "/auth/login")
      window.dispatchEvent(new Event("trazo-session-expired"));
    const problem = await response.json().catch(() => null);
    const errors = problem?.errors
      ? Object.entries(problem.errors)
          .map(
            ([field, messages]) =>
              `${field}: ${(messages as string[]).join(" ")}`,
          )
          .join("\n")
      : null;
    throw new Error(
      errors ||
        (response.status === 429
          ? "Demasiados intentos. Espera un minuto antes de volver a entrar."
          : null) ||
        (response.status === 401
          ? "Contraseña incorrecta o sesión vencida."
          : null) ||
        (response.status === 400
          ? problem?.title ===
            "Sesión de formulario vencida o solicitud no válida. Recarga la página."
            ? problem.title
            : "El registro no cumple el formato esperado. Revisa los tipos de datos, nombres de campos y valores del JSON."
          : response.status === 404
            ? path.startsWith("/strength/progress?")
              ? "Este ejercicio no está en tu historial de fuerza."
              : "No encontramos esta actividad."
            : "No se pudo conectar con la API. Comprueba que el servicio esté disponible e inténtalo de nuevo."),
    );
  }
  return response.status === 204 ? (undefined as T) : response.json();
}
