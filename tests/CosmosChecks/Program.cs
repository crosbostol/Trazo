using System.Security.Cryptography;
using System.Text.Json;
using System.Text.Json.Nodes;
using Progress.Api.Models;
using Progress.Api.Persistence;

static void Check(bool condition, string message)
{
    if (!condition) throw new Exception(message);
}
static void CorruptionFails(Action action, string message)
{
    try { action(); }
    catch (InvalidDataException) { return; }
    catch (FormatException) { return; }
    throw new Exception(message);
}

const string precise = "{\"id\":9007199254740993,\"huge\":1e200000,\"precise\":0.12345678901234567890123456789,\"duplicate\":1,\"duplicate\":2,\"nul\":\"\\u0000\",\"unicode\":\"ñ 🚴\"}";
foreach (var raw in new[] { precise, "1e200000", "9007199254740993", "\"\\u0000\"", "true", "null", "[]" })
{
    using var payload = JsonDocument.Parse(raw);
    var original = new Activity { Date = new(2026, 11, 8), Type = ActivityType.Other,
        DurationSeconds = 60, RawPayload = payload, CreatedAt = new(2026, 11, 8, 12, 0, 0, DateTimeKind.Utc) };
    var encoded = CosmosActivityCodec.Encode(original);
    var decoded = CosmosActivityCodec.Decode(encoded.DocumentBytes);
    Check(encoded.Chunks.Count == 0, "Small raw payload should remain inline");
    Check(decoded.RawPayloadJson == raw, "Inline raw JSON text must round-trip exactly");
    Check(decoded.Id == original.Id && decoded.Date == original.Date && decoded.Type == original.Type,
        "Metadata and IDs must remain intact");
    using var root = JsonDocument.Parse(encoded.DocumentBytes);
    Check(!root.RootElement.TryGetProperty("rawPayload", out _), "Cosmos must not numerically interpret rawPayload");
    Check(root.RootElement.GetProperty("ownerId").GetString() == "personal", "Owner partition must be explicit");
}
Console.WriteLine("PASS inline scalar/object JSON precision, duplicate keys, escaped NUL, Unicode and metadata");

var entropy = Convert.ToBase64String(RandomNumberGenerator.GetBytes(2_200_000));
var largeRaw = precise[..^1] + ",\"entropy\":\"" + entropy + "\"}";
using var largePayload = JsonDocument.Parse(largeRaw);
var large = new Activity { Date = new(2026, 11, 8), Type = ActivityType.Other,
    DurationSeconds = 60, RawPayload = largePayload };
var first = CosmosActivityCodec.Encode(large);
var second = CosmosActivityCodec.Encode(large);
Check(first.Chunks.Count > 1, "High-entropy payload above 2 MB must use multiple chunks");
Check(first.DocumentBytes.Length < CosmosActivityCodec.MaximumDocumentBytes, "Root must fit the Cosmos document limit");
Check(first.Chunks.All(c => JsonSerializer.SerializeToUtf8Bytes(c, CosmosActivityCodec.JsonOptions).Length < CosmosActivityCodec.MaximumDocumentBytes),
    "Every chunk document must fit the Cosmos document limit");
Check(first.Chunks.Select(c => c.Id).SequenceEqual(second.Chunks.Select(c => c.Id)), "Repeated writes must address the same immutable bytes");
Check(CosmosActivityCodec.Decode(first.DocumentBytes, first.Chunks).RawPayloadJson == largeRaw, "Large raw payload text must round-trip exactly");
Console.WriteLine("PASS high-entropy >2 MB raw JSON, bounded documents and deterministic chunk addressing");

CorruptionFails(() => CosmosActivityCodec.Decode(first.DocumentBytes, first.Chunks.Skip(1).ToArray()), "Missing chunk must fail closed");
CorruptionFails(() => CosmosActivityCodec.Decode(first.DocumentBytes, first.Chunks.Reverse().ToArray()), "Reordered chunks must fail closed");
var wrongOwner = first.Chunks.ToArray();
wrongOwner[0] = wrongOwner[0] with { OwnerId = "different-owner" };
CorruptionFails(() => CosmosActivityCodec.Decode(first.DocumentBytes, wrongOwner), "Wrong-owner chunk must fail closed");
var changedBytes = first.Chunks.ToArray();
var damaged = Convert.FromBase64String(changedBytes[0].Data);
damaged[damaged.Length / 2] ^= 1;
changedBytes[0] = changedBytes[0] with { Data = Convert.ToBase64String(damaged) };
CorruptionFails(() => CosmosActivityCodec.Decode(first.DocumentBytes, changedBytes), "Changed compressed bytes must fail checksum validation");
var manifest = JsonNode.Parse(first.DocumentBytes)!.AsObject();
manifest["payloadReference"]!["byteLength"] = 1;
CorruptionFails(() => CosmosActivityCodec.Decode(JsonSerializer.SerializeToUtf8Bytes(manifest), first.Chunks),
    "Decompressed bytes must not exceed their declared length");
Console.WriteLine("PASS missing/reordered/foreign/corrupt chunks and bounded decompression fail closed");

var nullRaw = new Activity { Date = new(2026, 11, 8), Type = ActivityType.Walking,
    DurationSeconds = 60, Walking = new WalkingDetails { TotalDurationSeconds = 60, DistanceKm = null } };
var nullDecoded = CosmosActivityCodec.Decode(CosmosActivityCodec.Encode(nullRaw).DocumentBytes);
Check(nullDecoded.RawPayload is null && nullDecoded.RawPayloadJson is null, "Absent payload stays absent");
Check(nullDecoded.Walking?.DistanceKm is null && nullDecoded.Walking?.TotalDurationSeconds == 60,
    "Unknown normalized metrics stay null");
Console.WriteLine("PASS absent payload and unknown metrics remain null");

const string spaced = "{\n  \"huge\": 1e200000,\r\n  \"id\": 9007199254740993, \"unicode\": \"ñ\", \"escaped\": \"\\u00f1\"\n}";
var snapshotActivity = new Activity { Date = new(2026, 11, 8), Type = ActivityType.Other, DurationSeconds = 60, RawPayload = JsonDocument.Parse(spaced) };
using var snapshotJson = JsonDocument.Parse(JsonSerializer.Serialize(new { Activities = new[] { snapshotActivity } }, CosmosActivityCodec.JsonOptions));
var restored = snapshotJson.RootElement.GetProperty("activities").Deserialize<List<Activity>>(CosmosActivityCodec.JsonOptions)!;
Check(restored[0].RawPayloadJson != spaced, "Regression must exercise whitespace normalization by nested JSON serialization");
CosmosSnapshotCodec.RestoreOriginalPayloads(snapshotJson.RootElement.GetProperty("activities"), restored);
Check(restored[0].RawPayloadJson == spaced, "Snapshot restore must use the exact original text field, including whitespace and escaping");
Check(CosmosActivityCodec.Decode(CosmosActivityCodec.Encode(restored[0]).DocumentBytes).RawPayloadJson == spaced, "Restored original text must round-trip through Cosmos");
Console.WriteLine("PASS migration snapshot preserves original whitespace, escaping, Unicode and number tokens");
