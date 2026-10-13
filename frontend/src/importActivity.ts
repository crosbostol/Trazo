// The input is the existing POST /api/activities contract. Parsed values are for
// local checks/preview only; the request body always comes from the source text.
export function field(object: unknown, name: string): unknown {
  if (!object || typeof object !== "object" || Array.isArray(object))
    return undefined;
  const matches = Object.entries(object).filter(
    ([key]) => key.toLowerCase() === name.toLowerCase(),
  );
  return matches.at(-1)?.[1];
}

export function validateActivityJson(source: string): Record<string, unknown> {
  let value: unknown;
  try {
    value = JSON.parse(source);
  } catch {
    throw new Error(
      "El JSON no es válido. Revisa comillas dobles, comas y llaves.",
    );
  }
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error(
      "Pega una actividad como objeto JSON, no una lista ni un valor aislado.",
    );
  const date = field(value, "date");
  if (
    typeof date !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
    date.startsWith("0000") ||
    !Number.isFinite(Date.parse(`${date}T12:00:00Z`)) ||
    new Date(`${date}T12:00:00Z`).toISOString().slice(0, 10) !== date
  )
    throw new Error("date: usa una fecha válida con formato AAAA-MM-DD.");
  const type = field(value, "type");
  if (
    typeof type !== "string" ||
    !["running", "strength", "walking", "cycling", "hiking", "other"].includes(
      type.toLowerCase(),
    )
  )
    throw new Error(
      "type: usa Running, Strength, Walking, Cycling, Hiking u Other.",
    );
  const subtype = field(value, "activitySubtype");
  if (
    subtype != null &&
    (type.toLowerCase() !== "other" ||
      typeof subtype !== "string" ||
      !subtype.trim() ||
      subtype.length > 200 ||
      subtype.includes("\0"))
  )
    throw new Error(
      "activitySubtype: solo Other admite un subtipo opcional; usa texto de hasta 200 caracteres, sin caracteres nulos ni solo espacios.",
    );
  const seconds = field(value, "durationSeconds");
  if (
    typeof seconds !== "number" ||
    !Number.isInteger(seconds) ||
    seconds <= 0 ||
    seconds > 2147483647
  )
    throw new Error(
      "durationSeconds: indica una duración entera positiva en segundos.",
    );
  for (const [name, max] of [
    ["mood", 5],
    ["energy", 5],
    ["rpe", 10],
  ] as const) {
    const score = field(value, name);
    if (
      score != null &&
      (typeof score !== "number" ||
        !Number.isInteger(score) ||
        score < 1 ||
        score > max)
    )
      throw new Error(`${name}: usa un entero de 1 a ${max}, o null.`);
  }
  for (const name of ["notes", "subjectiveNotes"]) {
    const text = field(value, name);
    if (
      text != null &&
      (typeof text !== "string" || text.length > 10000 || text.includes("\0"))
    )
      throw new Error(
        `${name}: usa texto de hasta 10.000 caracteres sin caracteres nulos, o null.`,
      );
  }
  const running = field(value, "running");
  const walking = field(value, "walking");
  if (type.toLowerCase() === "walking") {
    if (!walking || typeof walking !== "object" || Array.isArray(walking))
      throw new Error("Walking requiere un objeto walking, aunque sea {}.");
  } else if (walking != null)
    throw new Error("Solo Walking puede incluir walking.");
  const exercises = field(value, "exercises");
  if (type.toLowerCase() === "running") {
    if (!running || typeof running !== "object" || Array.isArray(running))
      throw new Error("Running requiere un objeto running, aunque sea {}.");
  } else if (running != null)
    throw new Error("Solo Running puede incluir running.");
  if (exercises != null && !Array.isArray(exercises))
    throw new Error("exercises debe ser una lista o null.");
  if (type.toLowerCase() === "strength") {
    if (!Array.isArray(exercises) || !exercises.length)
      throw new Error("Strength requiere al menos un ejercicio con sets.");
    for (const exercise of exercises) {
      const name = field(exercise, "exerciseName");
      const sets = field(exercise, "sets");
      if (
        typeof name !== "string" ||
        !name.trim() ||
        !Array.isArray(sets) ||
        !sets.length ||
        sets.some((s) => !s || typeof s !== "object" || Array.isArray(s))
      )
        throw new Error(
          "Cada ejercicio necesita exerciseName y una lista de sets no vacía.",
        );
    }
  } else if (Array.isArray(exercises) && exercises.length)
    throw new Error("Solo Strength puede incluir ejercicios.");
  // Full domain validation remains in the API. Never inspect rawPayload here:
  // SQL stores its original text; numeric tokens must not be converted by JavaScript.
  return value as Record<string, unknown>;
}

function tokens(source: string) {
  JSON.parse(source); // Syntax only. Do not stringify the parsed result.
  return [
    ...source.matchAll(/"(?:\\[\s\S]|[^"\\])*"|[^\s{}[\],:]+|[{}[\],:]/g),
  ];
}

export function formatActivityJson(source: string): string {
  let depth = 0;
  const parts = tokens(source);
  return parts
    .map((match, index) => {
      const token = match[0];
      const previous = parts[index - 1]?.[0];
      const next = parts[index + 1]?.[0];
      if (token === "{" || token === "[") {
        depth++;
        return (
          token +
          (next === "}" || next === "]" ? "" : `\n${"  ".repeat(depth)}`)
        );
      }
      if (token === "}" || token === "]") {
        depth--;
        return (
          (previous === "{" || previous === "["
            ? ""
            : `\n${"  ".repeat(depth)}`) + token
        );
      }
      if (token === ",") return `,\n${"  ".repeat(depth)}`;
      if (token === ":") return ": ";
      return token;
    })
    .join("");
}

// Edit only these scalar top-level fields. Nested rawPayload tokens are never
// parsed into new numbers or touched, including strings with braces/escapes.
export function updateSubjective(
  source: string,
  name: string,
  value: number | string | null,
): string {
  if (!["mood", "energy", "rpe", "subjectiveNotes"].includes(name))
    throw new Error("Campo no editable.");
  validateActivityJson(source);
  const parts = tokens(source);
  const replacements: { start: number; end: number }[] = [];
  let depth = 0;
  parts.forEach((match, index) => {
    const token = match[0];
    if (
      depth === 1 &&
      token.startsWith('"') &&
      parts[index + 1]?.[0] === ":" &&
      JSON.parse(token).toLowerCase() === name.toLowerCase()
    ) {
      const start = parts[index + 2];
      let endIndex = index + 2;
      if (start[0] === "{" || start[0] === "[") {
        let nested = 1;
        while (nested > 0) {
          const next = parts[++endIndex][0];
          if (next === "{" || next === "[") nested++;
          if (next === "}" || next === "]") nested--;
        }
      }
      const end = parts[endIndex];
      replacements.push({
        start: start.index!,
        end: end.index! + end[0].length,
      });
    }
    if (token === "{" || token === "[") depth++;
    if (token === "}" || token === "]") depth--;
  });
  const literal = JSON.stringify(value);
  if (!replacements.length) {
    const end = parts.at(-1)!.index!;
    return (
      source.slice(0, end) +
      `, ${JSON.stringify(name)}: ${literal}` +
      source.slice(end)
    );
  }
  return replacements
    .reverse()
    .reduce(
      (text, span) =>
        text.slice(0, span.start) + literal + text.slice(span.end),
      source,
    );
}
