using Progress.Api.Models;
using Progress.Api.Persistence;
using static Progress.Api.Services.StrengthProgressService;

namespace Progress.Api.Services;

public sealed class CosmosStrengthProgressService(CosmosRecordStore store)
{
    private async Task<List<ExerciseRow>> Exercises(CancellationToken ct)
    {
        var rows = await store.QueryAsync<ExerciseRow>("""
            SELECT e.id, c.id AS activityId, e.exerciseName AS name, e["order"] AS exerciseOrder,
              c.date, c.createdAt
            FROM c JOIN e IN c.exercises
            WHERE c.documentType = "activity" AND c.type = "Strength"
            """, ct: ct);
        // Keep exactly Trim + OrdinalIgnoreCase in .NET, avoiding different
        // Unicode/collation semantics in a database-side text comparison.
        return rows.OrderBy(e => e.Date).ThenBy(e => e.CreatedAt)
            .ThenBy(e => e.ActivityId, SqlGuidComparer.Instance).ThenBy(e => e.ExerciseOrder)
            .ThenBy(e => e.Id, SqlGuidComparer.Instance).ToList();
    }

    public async Task<List<ExerciseChoice>> ListAsync(CancellationToken ct) =>
        (await Exercises(ct)).GroupBy(e => e.Name.Trim(), StringComparer.OrdinalIgnoreCase)
        .Select(g => new ExerciseChoice(g.Key, g.Max(e => e.Date)))
        .OrderByDescending(e => e.LastDate).ThenBy(e => e.Name, StringComparer.OrdinalIgnoreCase).ToList();

    public async Task<StrengthProgressService.Progress?> GetAsync(string name, CancellationToken ct)
    {
        var exercises = (await Exercises(ct)).Where(e =>
            string.Equals(e.Name.Trim(), name.Trim(), StringComparison.OrdinalIgnoreCase)).ToList();
        if (exercises.Count == 0) return null;
        var ids = exercises.Select(e => e.Id.ToString()).ToArray();
        // Select only the matching sets; no activity payload or unrelated exercise
        // history is loaded. Array parameterization also handles arbitrary names.
        var sets = await store.QueryAsync<SetRow>("""
            SELECT e.id AS strengthExerciseId, s.setNumber, s.reps, s.weightKg, s.durationSeconds, s.side
            FROM c JOIN e IN c.exercises JOIN s IN e.sets
            WHERE c.documentType = "activity" AND c.type = "Strength" AND ARRAY_CONTAINS(@ids, e.id)
            """, new Dictionary<string, object?> { ["ids"] = ids }, ct);
        var byExercise = sets.ToLookup(s => s.StrengthExerciseId);
        var sessions = exercises.GroupBy(e => e.ActivityId).Select(group =>
        {
            var entries = group.SelectMany(e => byExercise[e.Id].OrderBy(s => s.SetNumber)
                .Select(s => new SetEntry(e.Id, e.Name, e.ExerciseOrder, s.SetNumber, s.Reps, s.WeightKg,
                    s.DurationSeconds, s.Side, s.WeightKg.HasValue && s.Reps > 0 ? Finite(s.WeightKg.Value * s.Reps) : null))).ToList();
            var weighted = entries.Where(s => s.WeightKg.HasValue && s.Reps > 0).ToList();
            return new Session(group.Key, group.First().Date, entries, entries.Count,
                weighted.Count == 0 ? null : weighted.Sum(s => (long)s.Reps),
                weighted.Count == 0 || weighted.Any(s => s.VolumeKg is null) ? null : Finite(weighted.Sum(s => s.VolumeKg!.Value)),
                entries.Select(s => s.WeightKg).DefaultIfEmpty().Max());
        }).ToList();
        var candidates = sessions.SelectMany(session => session.Sets.Select(set => (session, set))).ToList();
        PersonalRecord? Best(Func<SetEntry, double?> metric)
        {
            var best = candidates.Where(x => metric(x.set).HasValue)
                .OrderByDescending(x => metric(x.set)).FirstOrDefault();
            return best.set is null ? null : new(best.session.ActivityId, best.session.Date,
                metric(best.set)!.Value, best.set.WeightKg, best.set.Reps, best.set.ExerciseId, best.set.SetNumber, best.set.Side);
        }
        var bestSession = sessions.Where(s => s.VolumeKg.HasValue).OrderByDescending(s => s.VolumeKg).FirstOrDefault();
        var records = new Records(Best(s => s.WeightKg), Best(s => s.Reps > 0 ? s.Reps : null), Best(s => s.VolumeKg),
            bestSession is null ? null : new(bestSession.ActivityId, bestSession.Date, bestSession.VolumeKg!.Value,
                null, bestSession.KnownWeightReps, null, null, null));
        return new(exercises[0].Name.Trim(), sessions, records,
            sessions.Select(s => new ChartPoint(s.ActivityId, s.Date, s.BestWeightKg)).ToList());
    }

    private static double? Finite(double value) => double.IsFinite(value) ? value : null;

    public sealed class ExerciseRow
    {
        public Guid Id { get; set; }
        public Guid ActivityId { get; set; }
        public string Name { get; set; } = "";
        public int ExerciseOrder { get; set; }
        public DateOnly Date { get; set; }
        public DateTime CreatedAt { get; set; }
    }

    public sealed class SetRow
    {
        public Guid StrengthExerciseId { get; set; }
        public int SetNumber { get; set; }
        public int Reps { get; set; }
        public double? WeightKg { get; set; }
        public int? DurationSeconds { get; set; }
        public SetSide? Side { get; set; }
    }
}
