using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Xml.Linq;
using Microsoft.AspNetCore.DataProtection.Repositories;

namespace Progress.Api.Persistence;

// Each key/revocation XML is an immutable item in a separate logical partition.
// Copying the original XML preserves the existing ASP.NET cookie key ring.
public sealed class CosmosXmlRepository(CosmosRecordStore store) : IXmlRepository
{
    private sealed record KeyDocument(string Id, string OwnerId, string DocumentType, string Xml);

    public IReadOnlyCollection<XElement> GetAllElements() => GetAllElementsAsync().GetAwaiter().GetResult();

    public async Task<IReadOnlyCollection<XElement>> GetAllElementsAsync(CancellationToken ct = default)
    {
        var rows = await store.QueryPartitionAsync<KeyDocument>(CosmosRecordStore.KeyOwnerId,
            "SELECT c.id, c.ownerId, c.documentType, c.xml FROM c WHERE c.documentType = 'dataProtectionKey'", ct: ct);
        return rows.Select(row => XElement.Parse(row.Xml, LoadOptions.PreserveWhitespace)).ToList();
    }

    public void StoreElement(XElement element, string friendlyName) => StoreElementAsync(element).GetAwaiter().GetResult();

    public async Task StoreElementAsync(XElement element, CancellationToken ct = default)
    {
        var xml = element.ToString(SaveOptions.DisableFormatting);
        var id = "key-" + Convert.ToHexStringLower(SHA256.HashData(Encoding.UTF8.GetBytes(xml)));
        var document = new KeyDocument(id, CosmosRecordStore.KeyOwnerId, "dataProtectionKey", xml);
        await store.CreateImmutableAsync(id, CosmosRecordStore.KeyOwnerId, JsonSerializer.SerializeToUtf8Bytes(document, CosmosRecordStore.JsonOptions), ct);
    }
}
