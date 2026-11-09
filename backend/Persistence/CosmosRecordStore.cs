using System.Net;
using System.Text.Json;
using System.Text.Json.Nodes;
using Azure.Identity;
using Microsoft.Azure.Cosmos;
using Progress.Api.Models;

namespace Progress.Api.Persistence;

public sealed class CosmosPersistenceException() : Exception("No se pudo completar la operación de almacenamiento. Inténtalo nuevamente.");

public sealed class CosmosRecordStore : IDisposable
{
    public const string OwnerId = CosmosActivityCodec.OwnerId;
    public const string KeyOwnerId = "system:dataprotection";
    public string DatabaseName { get; }
    public string ContainerName { get; }
    public static JsonSerializerOptions JsonOptions => CosmosActivityCodec.JsonOptions;
    private readonly CosmosClient client;
    private readonly Container container;

    public CosmosRecordStore(IConfiguration configuration)
    {
        var endpoint = configuration["Cosmos:Endpoint"] ?? throw new InvalidOperationException("Configura Cosmos:Endpoint.");
        if (!Uri.TryCreate(endpoint, UriKind.Absolute, out var uri) || uri.Scheme != "https" || !uri.Host.EndsWith(".documents.azure.com", StringComparison.OrdinalIgnoreCase))
            throw new InvalidOperationException("Cosmos:Endpoint debe ser un endpoint HTTPS de Azure Cosmos DB.");
        DatabaseName = configuration["Cosmos:Database"] ?? "trazo";
        ContainerName = configuration["Cosmos:Container"] ?? "records";
        var options = new CosmosClientOptions
        {
            ConnectionMode = ConnectionMode.Gateway,
            UseSystemTextJsonSerializerWithOptions = JsonOptions,
            RequestTimeout = TimeSpan.FromSeconds(30),
            MaxRetryAttemptsOnRateLimitedRequests = 5,
            MaxRetryWaitTimeOnRateLimitedRequests = TimeSpan.FromSeconds(20),
            ApplicationName = "Trazo",
        };
        var key = configuration["Cosmos:Key"];
        client = string.IsNullOrEmpty(key)
            ? new CosmosClient(endpoint, new DefaultAzureCredential(new DefaultAzureCredentialOptions
                { ManagedIdentityClientId = configuration["Cosmos:ManagedIdentityClientId"] }), options)
            : new CosmosClient(endpoint, key, options);
        container = client.GetContainer(DatabaseName, ContainerName);
    }

    public Task<List<T>> QueryAsync<T>(string sql, IReadOnlyDictionary<string, object?>? parameters = null, CancellationToken ct = default) =>
        QueryPartitionAsync<T>(OwnerId, sql, parameters, ct);

    internal async Task<List<T>> QueryPartitionAsync<T>(string owner, string sql, IReadOnlyDictionary<string, object?>? parameters = null, CancellationToken ct = default)
    {
        try
        {
            var query = new QueryDefinition(sql);
            foreach (var (name, value) in parameters ?? new Dictionary<string, object?>())
                query.WithParameter(name.StartsWith('@') ? name : "@" + name, value);
            using var iterator = container.GetItemQueryIterator<T>(query, requestOptions: new QueryRequestOptions
            { PartitionKey = new PartitionKey(owner), MaxItemCount = 1000 });
            var rows = new List<T>();
            while (iterator.HasMoreResults) rows.AddRange(await iterator.ReadNextAsync(ct));
            return rows;
        }
        catch (CosmosException) { throw new CosmosPersistenceException(); }
    }

    public Task<List<Guid>> ListActivityIdsAsync(CancellationToken ct = default) =>
        QueryAsync<Guid>("SELECT VALUE c.id FROM c WHERE c.documentType = 'activity'", ct: ct);

    public async Task<Activity?> ReadActivityAsync(Guid id, CancellationToken ct = default)
    {
        var bytes = await ReadBytesAsync(id.ToString("D"), OwnerId, ct);
        if (bytes is null) return null;
        using var doc = JsonDocument.Parse(bytes);
        if (doc.RootElement.GetProperty("documentType").GetString() != "activity") return null;
        var chunks = new List<CosmosPayloadChunk>();
        if (doc.RootElement.TryGetProperty("payloadReference", out var manifest) && manifest.ValueKind != JsonValueKind.Null)
        {
            var reference = manifest.Deserialize<CosmosPayloadReference>(JsonOptions) ?? throw new InvalidDataException("Missing payload manifest.");
            if (reference.ChunkCount < 1 || reference.CompressedLength < 1 ||
                reference.ChunkCount != ((long)reference.CompressedLength + CosmosActivityCodec.ChunkBytes - 1) / CosmosActivityCodec.ChunkBytes)
                throw new InvalidDataException("Invalid payload chunk count.");
            for (var i = 0; i < reference.ChunkCount; i++)
            {
                var bytesOfChunk = await ReadBytesAsync(CosmosActivityCodec.ChunkId(reference.StorageSha256, i, reference.Generation), OwnerId, ct)
                    ?? throw new InvalidDataException("A payload chunk is missing; no partial payload was returned.");
                chunks.Add(JsonSerializer.Deserialize<CosmosPayloadChunk>(bytesOfChunk, JsonOptions) ?? throw new InvalidDataException("Invalid payload chunk."));
            }
        }
        return CosmosActivityCodec.Decode(bytes, chunks);
    }

    public async Task CreateActivityAsync(Activity activity, CancellationToken ct = default)
    {
        var encoded = CosmosActivityCodec.Encode(activity);
        foreach (var chunk in encoded.Chunks) await CreateImmutableAsync(chunk.Id, OwnerId, JsonSerializer.SerializeToUtf8Bytes(chunk, JsonOptions), ct);
        // The root is the only discoverable activity and is committed last. No upsert:
        // a retry or migration must never overwrite a different existing activity.
        await CreateBytesAsync(encoded.DocumentBytes, OwnerId, ct);
    }

    public async Task ImportActivityAsync(Activity activity, CancellationToken ct = default)
    {
        var existing = await ReadActivityAsync(activity.Id, ct);
        if (existing is not null)
        {
            if (!JsonNode.DeepEquals(JsonNode.Parse(CosmosActivityCodec.Encode(existing).DocumentBytes), JsonNode.Parse(CosmosActivityCodec.Encode(activity).DocumentBytes)))
                throw new InvalidOperationException("La importación encontró una actividad distinta con el mismo ID; no se sobrescribió.");
            return;
        }
        await CreateActivityAsync(activity, ct);
    }

    public async Task<bool> DeleteActivityAsync(Guid id, CancellationToken ct = default)
    {
        var bytes = await ReadBytesAsync(id.ToString("D"), OwnerId, ct);
        if (bytes is null) return false;
        using var root = JsonDocument.Parse(bytes);
        CosmosPayloadReference? payload = null;
        if (root.RootElement.TryGetProperty("payloadReference", out var manifest) && manifest.ValueKind != JsonValueKind.Null)
            payload = manifest.Deserialize<CosmosPayloadReference>(JsonOptions);
        try
        {
            using var response = await container.DeleteItemStreamAsync(id.ToString("D"), new PartitionKey(OwnerId), cancellationToken: ct);
            if (response.StatusCode == HttpStatusCode.NotFound) return false;
            response.EnsureSuccessStatusCode();
            // New chunks belong to a single activity, so successful deletion also
            // removes its opaque payload. Legacy shared chunks require mark/sweep.
            if (payload?.Generation is not null)
                for (var i = 0; i < payload.ChunkCount; i++)
                {
                    using var chunkDelete = await container.DeleteItemStreamAsync(
                        CosmosActivityCodec.ChunkId(payload.StorageSha256, i, payload.Generation), new PartitionKey(OwnerId), cancellationToken: ct);
                    if (chunkDelete.StatusCode != HttpStatusCode.NotFound) chunkDelete.EnsureSuccessStatusCode();
                }
            return true;
        }
        catch (CosmosException) { throw new CosmosPersistenceException(); }
    }

    public async Task<List<BodyMeasurement>> ListBodyAsync(CancellationToken ct = default) =>
        (await QueryAsync<BodyMeasurement>("SELECT c.measurementId AS id, c.date, c.weightKg, c.bodyFatPercentage, c.notes FROM c WHERE c.documentType = 'body'", ct: ct))
        .OrderByDescending(x => x.Date).ThenBy(x => new System.Data.SqlTypes.SqlGuid(x.Id)).ToList();

    public Task CreateBodyAsync(BodyMeasurement measurement, CancellationToken ct = default) =>
        CreateBytesAsync(EncodeBody(measurement), OwnerId, ct);

    public async Task ImportBodyAsync(BodyMeasurement measurement, CancellationToken ct = default)
    {
        var bytes = await ReadBytesAsync("body-" + measurement.Id.ToString("D"), OwnerId, ct);
        if (bytes is not null)
        {
            if (!JsonNode.DeepEquals(JsonNode.Parse(bytes), JsonNode.Parse(EncodeBody(measurement))))
            {
                // Ignore Cosmos system properties in equality comparison.
                var existing = JsonNode.Parse(bytes)!.AsObject();
                foreach (var key in existing.Select(x => x.Key).Where(x => x.StartsWith('_')).ToList()) existing.Remove(key);
                if (!JsonNode.DeepEquals(existing, JsonNode.Parse(EncodeBody(measurement))))
                    throw new InvalidOperationException("La importación encontró una medición distinta con el mismo ID; no se sobrescribió.");
            }
            return;
        }
        await CreateBodyAsync(measurement, ct);
    }

    private static byte[] EncodeBody(BodyMeasurement measurement)
    {
        var node = JsonSerializer.SerializeToNode(measurement, JsonOptions)!.AsObject();
        node["id"] = "body-" + measurement.Id.ToString("D");
        node["measurementId"] = measurement.Id.ToString("D");
        node["ownerId"] = OwnerId;
        node["documentType"] = "body";
        node["schemaVersion"] = 1;
        return JsonSerializer.SerializeToUtf8Bytes(node, JsonOptions);
    }

    internal async Task<byte[]?> ReadBytesAsync(string id, string owner, CancellationToken ct = default)
    {
        try
        {
            using var response = await container.ReadItemStreamAsync(id, new PartitionKey(owner), cancellationToken: ct);
            if (response.StatusCode == HttpStatusCode.NotFound) return null;
            response.EnsureSuccessStatusCode();
            using var buffer = new MemoryStream();
            await response.Content.CopyToAsync(buffer, ct);
            return buffer.ToArray();
        }
        catch (CosmosException) { throw new CosmosPersistenceException(); }
    }

    internal async Task CreateImmutableAsync(string id, string owner, byte[] bytes, CancellationToken ct = default)
    {
        try
        {
            using var stream = new MemoryStream(bytes, writable: false);
            using var response = await container.CreateItemStreamAsync(stream, new PartitionKey(owner), cancellationToken: ct);
            if (response.StatusCode == HttpStatusCode.Conflict)
            {
                var existingBytes = await ReadBytesAsync(id, owner, ct) ?? throw new InvalidDataException("Immutable item disappeared.");
                var existing = JsonNode.Parse(existingBytes)!.AsObject();
                foreach (var key in existing.Select(x => x.Key).Where(x => x.StartsWith('_')).ToList()) existing.Remove(key);
                if (!JsonNode.DeepEquals(existing, JsonNode.Parse(bytes))) throw new InvalidDataException("Immutable item checksum/identity conflict.");
                return;
            }
            response.EnsureSuccessStatusCode();
        }
        catch (CosmosException) { throw new CosmosPersistenceException(); }
    }

    private async Task CreateBytesAsync(byte[] bytes, string owner, CancellationToken ct)
    {
        try
        {
            using var stream = new MemoryStream(bytes, writable: false);
            using var response = await container.CreateItemStreamAsync(stream, new PartitionKey(owner), cancellationToken: ct);
            response.EnsureSuccessStatusCode();
        }
        catch (CosmosException) { throw new CosmosPersistenceException(); }
    }

    public async Task CheckConnectivityAsync(CancellationToken ct = default)
    {
        try { await container.ReadContainerAsync(cancellationToken: ct); }
        catch (CosmosException) { throw new CosmosPersistenceException(); }
    }

    public void Dispose() => client.Dispose();
}
