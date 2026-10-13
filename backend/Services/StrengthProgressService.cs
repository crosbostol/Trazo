using Microsoft.EntityFrameworkCore;
using Progress.Api.Data;
using Progress.Api.Models;

namespace Progress.Api.Services;

public sealed class StrengthProgressService(ProgressDbContext db)
{
    public record ExerciseChoice(string Name, DateOnly LastDate);
    public record SetEntry(Guid ExerciseId, string ExerciseName, int ExerciseOrder, int SetNumber,
        int Reps, double? WeightKg, int? DurationSeconds, SetSide? Side, double? VolumeKg);
    public record Session(Guid ActivityId, DateOnly Date, List<SetEntry> Sets,
        int SetCount, long? KnownWeightReps, double? VolumeKg, double? BestWeightKg);
    public record PersonalRecord(Guid ActivityId, DateOnly Date, double Value, double? WeightKg,
        long? Reps, Guid? ExerciseId, int? SetNumber, SetSide? Side);
    public record Records(PersonalRecord? HeaviestWeight, PersonalRecord? MostRepsAtAnyWeight,
        PersonalRecord? HighestSetVolume, PersonalRecord? HighestSessionVolume);
    public record ChartPoint(Guid ActivityId, DateOnly Date, double? WeightKg);
    public record Progress(string Name, List<Session> Sessions, Records Prs, List<ChartPoint> Series);
    private record ExerciseRow(Guid Id, Guid ActivityId, string Name, int Order, DateOnly Date, DateTime CreatedAt);

    // Compare in .NET so grouping is exactly Trim + OrdinalIgnoreCase, independent
    // of SQL collation (which can also equate accents or other distinct names).
    // Only thin exercise metadata is read here; sets are fetched for the selected group.
    private Task<List<ExerciseRow>> Exercises(CancellationToken ct) =>
        (from e in db.Set<StrengthExercise>().AsNoTracking()
         join a in db.Activities.AsNoTracking() on e.ActivityId equals a.Id
         where a.Type == ActivityType.Strength
         orderby a.Date, a.CreatedAt, a.Id, e.Order, e.Id
         select new ExerciseRow(e.Id, a.Id, e.ExerciseName, e.Order, a.Date, a.CreatedAt)).ToListAsync(ct);

    public async Task<List<ExerciseChoice>> ListAsync(CancellationToken ct) =>
        (await Exercises(ct)).GroupBy(e => e.Name.Trim(), StringComparer.OrdinalIgnoreCase)
        .Select(g => new ExerciseChoice(g.Key, g.Max(e => e.Date)))
        .OrderByDescending(e => e.LastDate).ThenBy(e => e.Name, StringComparer.OrdinalIgnoreCase).ToList();

    public async Task<Progress?> GetAsync(string name, CancellationToken ct)
    {
        var exercises = (await Exercises(ct)).Where(e =>
            string.Equals(e.Name.Trim(), name.Trim(), StringComparison.OrdinalIgnoreCase)).ToList();
        if (exercises.Count == 0) return null;
        var ids = exercises.Select(e => e.Id).ToArray();
        var sets = await db.Set<StrengthSet>().AsNoTracking().Where(s => ids.Contains(s.StrengthExerciseId))
            .Select(s => new { s.StrengthExerciseId, s.SetNumber, s.Reps, s.WeightKg, s.DurationSeconds, s.Side })
            .ToListAsync(ct);
        var byExercise = sets.ToLookup(s => s.StrengthExerciseId);
        var sessions = exercises.GroupBy(e => e.ActivityId).Select(group =>
        {
            var entries = group.SelectMany(e => byExercise[e.Id].OrderBy(s => s.SetNumber)
                .Select(s => new SetEntry(e.Id, e.Name, e.Order, s.SetNumber, s.Reps, s.WeightKg,
                    s.DurationSeconds, s.Side, s.WeightKg.HasValue && s.Reps > 0 ? Finite(s.WeightKg.Value * s.Reps) : null))).ToList();
            var weighted = entries.Where(s => s.WeightKg.HasValue && s.Reps > 0).ToList();
            // Missing weights stay unknown. An actual weight of zero remains zero.
            return new Session(group.Key, group.First().Date, entries, entries.Count,
                weighted.Count == 0 ? null : weighted.Sum(s => (long)s.Reps),
                weighted.Count == 0 || weighted.Any(s => s.VolumeKg is null) ? null : Finite(weighted.Sum(s => s.VolumeKg!.Value)),
                entries.Select(s => s.WeightKg).DefaultIfEmpty().Max());
        }).ToList();
        var candidates = sessions.SelectMany(session => session.Sets.Select(set => (session, set))).ToList();
        PersonalRecord? Best(Func<SetEntry, double?> metric)
        {
            // Stable ordering above makes ties resolve to the earliest session, then
            // CreatedAt, ActivityId, exercise order/id and set number. No stored PR cache.
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
}
