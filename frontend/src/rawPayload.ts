// Keep the validated JSON text intact: JSON.parse + JSON.stringify would round
// large Garmin identifiers and turn numbers outside JS's range into null.
export function serializeActivityRequest(
  fields: Record<string, unknown>,
  raw: string,
): string {
  const payload = raw.trim();
  if (payload) {
    try {
      JSON.parse(payload);
    } catch {
      throw new Error("El payload original debe ser un JSON válido.");
    }
  }
  const { rawPayload: _ignored, ...rest } = fields;
  const serialized = JSON.stringify(rest);
  return `${serialized.slice(0, -1)}${serialized === "{}" ? "" : ","}"rawPayload":${payload || "null"}}`;
}
