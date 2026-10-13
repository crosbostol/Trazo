using System;
using System.Text.Json;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Progress.Api.Migrations
{
    /// <inheritdoc />
    public partial class InitialCreate : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "Activities",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    Date = table.Column<DateOnly>(type: "date", nullable: false),
                    Type = table.Column<string>(type: "text", nullable: false),
                    DurationSeconds = table.Column<int>(type: "integer", nullable: false),
                    Notes = table.Column<string>(type: "text", nullable: true),
                    Mood = table.Column<int>(type: "integer", nullable: true),
                    Energy = table.Column<int>(type: "integer", nullable: true),
                    Rpe = table.Column<int>(type: "integer", nullable: true),
                    SubjectiveNotes = table.Column<string>(type: "text", nullable: true),
                    RawPayload = table.Column<JsonDocument>(type: "jsonb", nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Activities", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "BodyMeasurements",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    Date = table.Column<DateOnly>(type: "date", nullable: false),
                    WeightKg = table.Column<double>(type: "double precision", nullable: false),
                    BodyFatPercentage = table.Column<double>(type: "double precision", nullable: true),
                    Notes = table.Column<string>(type: "text", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_BodyMeasurements", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "RunningDetails",
                columns: table => new
                {
                    ActivityId = table.Column<Guid>(type: "uuid", nullable: false),
                    DistanceKm = table.Column<double>(type: "double precision", nullable: true),
                    TotalDurationSeconds = table.Column<int>(type: "integer", nullable: true),
                    MovingDurationSeconds = table.Column<int>(type: "integer", nullable: true),
                    RunningDurationSeconds = table.Column<int>(type: "integer", nullable: true),
                    WalkingDurationSeconds = table.Column<int>(type: "integer", nullable: true),
                    AveragePaceSecondsPerKm = table.Column<double>(type: "double precision", nullable: true),
                    MovingPaceSecondsPerKm = table.Column<double>(type: "double precision", nullable: true),
                    BestPaceSecondsPerKm = table.Column<double>(type: "double precision", nullable: true),
                    AverageHeartRate = table.Column<int>(type: "integer", nullable: true),
                    MaxHeartRate = table.Column<int>(type: "integer", nullable: true),
                    RecoveryHeartRate = table.Column<int>(type: "integer", nullable: true),
                    AveragePowerWatts = table.Column<int>(type: "integer", nullable: true),
                    MaxPowerWatts = table.Column<int>(type: "integer", nullable: true),
                    AverageCadence = table.Column<int>(type: "integer", nullable: true),
                    MaxCadence = table.Column<int>(type: "integer", nullable: true),
                    AverageStrideLengthMeters = table.Column<double>(type: "double precision", nullable: true),
                    TotalAscentMeters = table.Column<double>(type: "double precision", nullable: true),
                    TotalDescentMeters = table.Column<double>(type: "double precision", nullable: true),
                    MinElevationMeters = table.Column<double>(type: "double precision", nullable: true),
                    MaxElevationMeters = table.Column<double>(type: "double precision", nullable: true),
                    AerobicTrainingEffect = table.Column<double>(type: "double precision", nullable: true),
                    AnaerobicTrainingEffect = table.Column<double>(type: "double precision", nullable: true),
                    TrainingLoad = table.Column<double>(type: "double precision", nullable: true),
                    ActiveCalories = table.Column<int>(type: "integer", nullable: true),
                    TotalCalories = table.Column<int>(type: "integer", nullable: true),
                    EstimatedFluidLossMl = table.Column<int>(type: "integer", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_RunningDetails", x => x.ActivityId);
                    table.ForeignKey(
                        name: "FK_RunningDetails_Activities_ActivityId",
                        column: x => x.ActivityId,
                        principalTable: "Activities",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "StrengthExercise",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    ActivityId = table.Column<Guid>(type: "uuid", nullable: false),
                    ExerciseName = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    Order = table.Column<int>(type: "integer", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_StrengthExercise", x => x.Id);
                    table.ForeignKey(
                        name: "FK_StrengthExercise_Activities_ActivityId",
                        column: x => x.ActivityId,
                        principalTable: "Activities",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "RunningLap",
                columns: table => new
                {
                    ActivityId = table.Column<Guid>(type: "uuid", nullable: false),
                    LapNumber = table.Column<int>(type: "integer", nullable: false),
                    DistanceKm = table.Column<double>(type: "double precision", nullable: true),
                    DurationSeconds = table.Column<int>(type: "integer", nullable: true),
                    AveragePaceSecondsPerKm = table.Column<double>(type: "double precision", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_RunningLap", x => new { x.ActivityId, x.LapNumber });
                    table.ForeignKey(
                        name: "FK_RunningLap_RunningDetails_ActivityId",
                        column: x => x.ActivityId,
                        principalTable: "RunningDetails",
                        principalColumn: "ActivityId",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "StrengthSet",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    StrengthExerciseId = table.Column<Guid>(type: "uuid", nullable: false),
                    SetNumber = table.Column<int>(type: "integer", nullable: false),
                    Reps = table.Column<int>(type: "integer", nullable: false),
                    WeightKg = table.Column<double>(type: "double precision", nullable: true),
                    DurationSeconds = table.Column<int>(type: "integer", nullable: true),
                    Side = table.Column<string>(type: "text", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_StrengthSet", x => x.Id);
                    table.ForeignKey(
                        name: "FK_StrengthSet_StrengthExercise_StrengthExerciseId",
                        column: x => x.StrengthExerciseId,
                        principalTable: "StrengthExercise",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_Activities_Date",
                table: "Activities",
                column: "Date");

            migrationBuilder.CreateIndex(
                name: "IX_BodyMeasurements_Date",
                table: "BodyMeasurements",
                column: "Date");

            migrationBuilder.CreateIndex(
                name: "IX_StrengthExercise_ActivityId_Order",
                table: "StrengthExercise",
                columns: new[] { "ActivityId", "Order" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_StrengthSet_StrengthExerciseId_SetNumber",
                table: "StrengthSet",
                columns: new[] { "StrengthExerciseId", "SetNumber" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "BodyMeasurements");

            migrationBuilder.DropTable(
                name: "RunningLap");

            migrationBuilder.DropTable(
                name: "StrengthSet");

            migrationBuilder.DropTable(
                name: "RunningDetails");

            migrationBuilder.DropTable(
                name: "StrengthExercise");

            migrationBuilder.DropTable(
                name: "Activities");
        }
    }
}
