using System.Text.Json;
using Progress.Api.Models;

namespace Progress.Api.Persistence;

public static class CosmosSnapshotCodec
{
    // Serializing a JsonDocument as nested JSON normalizes whitespace/escaping.
    // The separate rawPayloadJson string in our snapshot is the authoritative text.
    public static void RestoreOriginalPayloads(JsonElement savedActivities, IList<Activity> activities)
    {
        if (savedActivities.GetArrayLength() != activities.Count) throw new InvalidDataException("Snapshot activity count mismatch.");
        for (var i = 0; i < activities.Count; i++)
        {
            var saved = savedActivities[i];
            if (saved.GetProperty("id").GetGuid() != activities[i].Id || !saved.TryGetProperty("rawPayloadJson", out var raw))
                throw new InvalidDataException("Snapshot is missing authoritative raw payload text.");
            activities[i].RawPayload?.Dispose();
            activities[i].RawPayload = raw.ValueKind switch
            {
                JsonValueKind.Null => null,
                JsonValueKind.String => JsonDocument.Parse(raw.GetString()!),
                _ => throw new InvalidDataException("Invalid snapshot raw payload text.")
            };
        }
    }
}
