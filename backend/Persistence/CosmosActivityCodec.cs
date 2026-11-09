using System.IO.Compression;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.Json.Serialization;
using System.Text.Json.Serialization.Metadata;
using Progress.Api.Models;

namespace Progress.Api.Persistence;

public sealed record CosmosPayloadReference(string Sha256, int ChunkCount, int ByteLength, int CompressedLength, string StorageSha256);
public sealed record CosmosPayloadChunk(string Id, string OwnerId, string DocumentType, string Sha256, int Number, string Data);
public sealed record EncodedCosmosActivity(byte[] DocumentBytes, IReadOnlyList<CosmosPayloadChunk> Chunks);

// No numeric parsing of rawPayload happens during storage: its exact UTF-8 text is
// inline or in immutable, verified gzip chunks. Only the final activity is published.
public static class CosmosActivityCodec
{
    public const string OwnerId = "personal";
    public const int MaximumDocumentBytes = 1_750_000;
    public const int ChunkBytes = 327_680;
    public static JsonSerializerOptions JsonOptions { get; } = CreateOptions();
    private static readonly JsonSerializerOptions MetadataOptions = CreateMetadataOptions();

    private static JsonSerializerOptions CreateOptions()
    {
        var options = new JsonSerializerOptions(JsonSerializerDefaults.Web);
        options.Converters.Add(new JsonStringEnumConverter(allowIntegerValues: false));
        return options;
    }

    private static JsonSerializerOptions CreateMetadataOptions()
    {
        var resolver = new DefaultJsonTypeInfoResolver();
        resolver.Modifiers.Add(type =>
        {
            if (type.Type != typeof(Activity)) return;
            foreach (var property in type.Properties.Where(x => x.Name is "rawPayload" or "rawPayloadJson"))
                property.ShouldSerialize = (_, _) => false;
        });
        return new(JsonOptions) { TypeInfoResolver = resolver };
    }

    public static EncodedCosmosActivity Encode(Activity activity)
    {
        var root = JsonSerializer.SerializeToNode(activity, MetadataOptions)!.AsObject();
        root["ownerId"] = OwnerId;
        root["documentType"] = "activity";
        root["schemaVersion"] = 1;
        root["createdAt"] = UtcTimestamp(activity.CreatedAt);
        root["updatedAt"] = UtcTimestamp(activity.UpdatedAt);
        var raw = activity.RawPayload?.RootElement.GetRawText();
        root["rawPayloadJson"] = raw;
        var bytes = JsonSerializer.SerializeToUtf8Bytes(root, JsonOptions);
        if (bytes.Length <= MaximumDocumentBytes) return new(bytes, []);
        root["rawPayloadJson"] = null;
        if (JsonSerializer.SerializeToUtf8Bytes(root, JsonOptions).Length > MaximumDocumentBytes - 1024)
            throw new BadHttpRequestException("Los detalles de la actividad exceden el tamaño admitido; el payload original no se ha guardado ni truncado.", StatusCodes.Status413PayloadTooLarge);
        if (raw is null) throw new InvalidDataException("Activity metadata exceeds the storage limit.");
        var rawBytes = Encoding.UTF8.GetBytes(raw);
        var sha = Convert.ToHexStringLower(SHA256.HashData(rawBytes));
        using var compressed = new MemoryStream();
        using (var gzip = new GZipStream(compressed, CompressionLevel.SmallestSize, leaveOpen: true)) gzip.Write(rawBytes);
        var compressedBytes = compressed.ToArray();
        var storageSha = Convert.ToHexStringLower(SHA256.HashData(compressedBytes));
        var count = (compressedBytes.Length + ChunkBytes - 1) / ChunkBytes;
        var chunks = Enumerable.Range(0, count).Select(number => new CosmosPayloadChunk(
            ChunkId(storageSha, number), OwnerId, "payloadChunk", storageSha, number,
            Convert.ToBase64String(compressedBytes, number * ChunkBytes, Math.Min(ChunkBytes, compressedBytes.Length - number * ChunkBytes)))).ToList();
        root["payloadReference"] = JsonSerializer.SerializeToNode(new CosmosPayloadReference(sha, count, rawBytes.Length, compressedBytes.Length, storageSha), JsonOptions);
        bytes = JsonSerializer.SerializeToUtf8Bytes(root, JsonOptions);
        if (bytes.Length > MaximumDocumentBytes) throw new InvalidDataException("Activity manifest exceeds the storage limit.");
        return new(bytes, chunks);
    }

    public static string ChunkId(string sha, int number) => $"payload-{sha}-{number:D6}";
    private static string UtcTimestamp(DateTime value) => (value.Kind == DateTimeKind.Unspecified
        ? DateTime.SpecifyKind(value, DateTimeKind.Utc) : value.ToUniversalTime()).ToString("O");

    public static Activity Decode(ReadOnlyMemory<byte> document, IReadOnlyList<CosmosPayloadChunk>? chunks = null)
    {
        using var root = JsonDocument.Parse(document);
        var activity = root.RootElement.Deserialize<Activity>(JsonOptions) ?? throw new InvalidDataException("Missing activity.");
        string? raw = null;
        if (root.RootElement.TryGetProperty("payloadReference", out var manifest) && manifest.ValueKind != JsonValueKind.Null)
        {
            var reference = manifest.Deserialize<CosmosPayloadReference>(JsonOptions) ?? throw new InvalidDataException("Invalid payload manifest.");
            raw = DecodePayload(reference, chunks ?? []);
        }
        else if (root.RootElement.TryGetProperty("rawPayloadJson", out var inline) && inline.ValueKind == JsonValueKind.String)
            raw = inline.GetString();
        activity.RawPayload = raw is null ? null : JsonDocument.Parse(raw);
        return activity;
    }

    public static string DecodePayload(CosmosPayloadReference reference, IReadOnlyList<CosmosPayloadChunk> chunks)
    {
        if (reference.ChunkCount <= 0 || reference.ByteLength < 0 || reference.CompressedLength <= 0 ||
            chunks.Count != reference.ChunkCount || reference.Sha256.Length != 64 || reference.StorageSha256.Length != 64)
            throw new InvalidDataException("Incomplete payload manifest.");
        using var compressed = new MemoryStream();
        for (var number = 0; number < reference.ChunkCount; number++)
        {
            var chunk = chunks[number];
            if (chunk.Number != number || chunk.Sha256 != reference.StorageSha256 || chunk.OwnerId != OwnerId ||
                chunk.DocumentType != "payloadChunk" || chunk.Id != ChunkId(reference.StorageSha256, number))
                throw new InvalidDataException("Payload chunk identity mismatch.");
            var data = Convert.FromBase64String(chunk.Data);
            if (data.Length > ChunkBytes || compressed.Length + data.Length > reference.CompressedLength)
                throw new InvalidDataException("Payload chunk length mismatch.");
            compressed.Write(data);
        }
        if (compressed.Length != reference.CompressedLength) throw new InvalidDataException("Incomplete payload bytes.");
        if (Convert.ToHexStringLower(SHA256.HashData(compressed.GetBuffer().AsSpan(0, checked((int)compressed.Length)))) != reference.StorageSha256)
            throw new InvalidDataException("Compressed payload checksum mismatch.");
        compressed.Position = 0;
        using var gzip = new GZipStream(compressed, CompressionMode.Decompress);
        using var decoded = new MemoryStream(Math.Min(reference.ByteLength, 1024 * 1024));
        var buffer = new byte[65536];
        int read;
        while ((read = gzip.Read(buffer)) != 0)
        {
            if (decoded.Length + read > reference.ByteLength) throw new InvalidDataException("Payload decompression exceeds manifest length.");
            decoded.Write(buffer, 0, read);
        }
        var bytes = decoded.ToArray();
        if (bytes.Length != reference.ByteLength || Convert.ToHexStringLower(SHA256.HashData(bytes)) != reference.Sha256)
            throw new InvalidDataException("Payload checksum mismatch.");
        return new UTF8Encoding(false, true).GetString(bytes);
    }
}
