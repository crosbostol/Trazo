using System.Security.Cryptography;
using System.Text.Json;
using System.Xml.Linq;
using Microsoft.EntityFrameworkCore;
using Progress.Api.Data;
using Progress.Api.Models;
using Progress.Api.Persistence;

namespace Progress.Api.Transfer;

// Offline copy/verification only. Never deletes SQL data or switches application traffic.
public static class CosmosMigration
{
    public sealed record KeyCopy(string Xml, string FriendlyName);
    public sealed record Snapshot(int Version, List<Activity> Activities, List<BodyMeasurement> Measurements, List<KeyCopy> Keys);

    public static async Task RunAsync(string[] args, IConfiguration configuration)
    {
        var command = args.First(a => a is "--export-cosmos-migration" or "--import-cosmos-migration" or "--verify-cosmos-migration" or "--repair-cosmos-payload-text");
        var position = Array.IndexOf(args, command);
        if (position + 1 >= args.Length) throw new InvalidOperationException("Indica un archivo privado de migración.");
        var path = Path.GetFullPath(args[position + 1]);
        if (command == "--export-cosmos-migration")
        {
            if (File.Exists(path)) throw new InvalidOperationException("El respaldo ya existe; no se sobrescribió.");
            var connection = configuration.GetConnectionString("Progress") ?? throw new InvalidOperationException("Configura la conexión SQL origen.");
            await using var db = new ProgressDbContext(new DbContextOptionsBuilder<ProgressDbContext>().UseSqlServer(connection,
                sql => sql.EnableRetryOnFailure(6, TimeSpan.FromSeconds(10), null)).Options);
            var activities = await db.Activities.AsNoTracking().Include(a => a.Running!).ThenInclude(r => r.Laps)
                .Include(a => a.Walking).Include(a => a.Exercises).ThenInclude(e => e.Sets).AsSplitQuery().ToListAsync();
            var measurements = await db.BodyMeasurements.AsNoTracking().ToListAsync();
            var keys = await db.DataProtectionKeys.AsNoTracking().Select(k => new KeyCopy(k.Xml!, k.FriendlyName ?? "imported")).ToListAsync();
            var snapshot = new Snapshot(1, activities, measurements, keys);
            // Caller pre-creates an ACL-restricted directory. FileMode.CreateNew avoids overwrites.
            await using var file = new FileStream(path, FileMode.CreateNew, FileAccess.Write, FileShare.None);
            await JsonSerializer.SerializeAsync(file, snapshot, CosmosActivityCodec.JsonOptions);
            Console.WriteLine(JsonSerializer.Serialize(new { ExportedActivities = activities.Count,
                ExportedMeasurements = measurements.Count, ExportedKeys = keys.Count,
                MaximumPayloadBytes = activities.Select(a => System.Text.Encoding.UTF8.GetByteCount(a.RawPayloadJson ?? "")).DefaultIfEmpty().Max() }));
            return;
        }
        await using var source = File.OpenRead(path);
        using var saved = await JsonDocument.ParseAsync(source);
        var data = saved.RootElement.Deserialize<Snapshot>(CosmosActivityCodec.JsonOptions)
            ?? throw new InvalidDataException("Respaldo vacío.");
        if (data.Version != 1) throw new InvalidDataException("Versión de respaldo no soportada.");
        var normalizedTexts = data.Activities.ToDictionary(a => a.Id, a => a.RawPayloadJson);
        CosmosSnapshotCodec.RestoreOriginalPayloads(saved.RootElement.GetProperty("activities"), data.Activities);
        using var store = new CosmosRecordStore(configuration);
        var repository = new CosmosXmlRepository(store);
        // Validate every activity before publishing any root item (including size/precision support).
        foreach (var activity in data.Activities) _ = CosmosActivityCodec.Encode(activity);
        if (command == "--repair-cosmos-payload-text")
        {
            var repaired = 0;
            var skippedDeleted = 0;
            foreach (var activity in data.Activities)
            {
                var actual = await store.ReadActivityAsync(activity.Id);
                if (actual is null) { skippedDeleted++; continue; }
                if (actual.RawPayloadJson == activity.RawPayloadJson) continue;
                if (actual.RawPayloadJson != normalizedTexts[activity.Id])
                    throw new InvalidDataException("El payload fue cambiado después de la migración; no se reemplazó.");
                actual.RawPayload = activity.RawPayload;
                if (Fingerprint(actual) != Fingerprint(activity))
                    throw new InvalidDataException("La actividad cambió después de la migración; no se reemplazó.");
                await store.RestoreOriginalPayloadTextAsync(activity, normalizedTexts[activity.Id]);
                var verified = await store.ReadActivityAsync(activity.Id) ?? throw new InvalidDataException("Actividad desapareció durante la reparación.");
                if (Fingerprint(verified) != Fingerprint(activity)) throw new InvalidDataException("La reparación no coincide con el origen.");
                repaired++;
            }
            Console.WriteLine(JsonSerializer.Serialize(new { RepairedPayloadTexts = repaired, SkippedDeletedActivities = skippedDeleted, SourcePayloadTextVerified = true }));
            return;
        }
        if (command == "--import-cosmos-migration")
        {
            foreach (var key in data.Keys) repository.StoreElement(XElement.Parse(key.Xml), key.FriendlyName);
            foreach (var activity in data.Activities) await store.ImportActivityAsync(activity, default);
            foreach (var body in data.Measurements) await store.ImportBodyAsync(body, default);
        }
        foreach (var activity in data.Activities)
        {
            var actual = await store.ReadActivityAsync(activity.Id, default) ?? throw new InvalidDataException("Falta una actividad migrada.");
            if (Fingerprint(activity) != Fingerprint(actual)) throw new InvalidDataException("La verificación de una actividad no coincide.");
        }
        var measurementsActual = await store.ListBodyAsync(default);
        foreach (var body in data.Measurements)
            if (!measurementsActual.Any(x => Fingerprint(x) == Fingerprint(body))) throw new InvalidDataException("No coincide una medición migrada.");
        var keyXmls = repository.GetAllElements().Select(x => x.ToString(SaveOptions.DisableFormatting)).ToHashSet(StringComparer.Ordinal);
        if (data.Keys.Any(k => !keyXmls.Contains(XElement.Parse(k.Xml).ToString(SaveOptions.DisableFormatting))))
            throw new InvalidDataException("Faltan claves originales de sesión.");
        var total = await store.QueryAsync<int>("SELECT VALUE COUNT(1) FROM c WHERE c.documentType = 'activity'");
        if (total.Single() != data.Activities.Count || measurementsActual.Count != data.Measurements.Count)
            throw new InvalidDataException("El destino contiene registros inesperados; no se eliminó ninguno.");
        Console.WriteLine(JsonSerializer.Serialize(new { VerifiedActivities = data.Activities.Count,
            VerifiedMeasurements = data.Measurements.Count, VerifiedKeys = data.Keys.Count, ExactContentVerified = true }));
    }

    private static string Fingerprint(object value)
    {
        // Canonical property order comes from CLR models. SQL dates are unspecified-kind;
        // normalize audit timestamps because Cosmos persists equivalent UTC strings.
        if (value is Activity a)
        {
            a.CreatedAt = DateTime.SpecifyKind(a.CreatedAt, DateTimeKind.Utc);
            a.UpdatedAt = DateTime.SpecifyKind(a.UpdatedAt, DateTimeKind.Utc);
            a.Exercises = a.Exercises.OrderBy(x => x.Order).ThenBy(x => x.Id).ToList();
            foreach (var e in a.Exercises) e.Sets = e.Sets.OrderBy(x => x.SetNumber).ToList();
            if (a.Running is not null) a.Running.Laps = a.Running.Laps.OrderBy(x => x.LapNumber).ToList();
        }
        return Convert.ToHexString(SHA256.HashData(JsonSerializer.SerializeToUtf8Bytes(value, value.GetType(), CosmosActivityCodec.JsonOptions)));
    }
}
