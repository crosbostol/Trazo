using System.Text.Json;
using System.Text.Json.Serialization;
using Progress.Api.Models;

namespace Progress.Api.DTOs;

public record CreateActivityRequest(DateOnly Date, [property: JsonRequired] ActivityType Type, int DurationSeconds,
    string? Notes, int? Mood, int? Energy, int? Rpe, string? SubjectiveNotes,
    JsonDocument? RawPayload, RunningDetails? Running, List<ExerciseRequest>? Exercises, string? ActivitySubtype = null, WalkingDetails? Walking = null);
public record ExerciseRequest(string ExerciseName, int Order, List<SetRequest> Sets);
public record SetRequest(int SetNumber, int Reps, double? WeightKg, int? DurationSeconds, SetSide? Side);
public record CreateBodyRequest(DateOnly Date, double WeightKg, double? BodyFatPercentage, string? Notes);
