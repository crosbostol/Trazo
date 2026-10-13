using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Progress.Api.Migrations
{
    /// <inheritdoc />
    public partial class InitialSqlServer : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "Activities",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Date = table.Column<DateOnly>(type: "date", nullable: false),
                    Type = table.Column<string>(type: "nvarchar(20)", maxLength: 20, nullable: false, collation: "Latin1_General_100_BIN2"),
                    DurationSeconds = table.Column<int>(type: "int", nullable: false),
                    Notes = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    Mood = table.Column<int>(type: "int", nullable: true),
                    Energy = table.Column<int>(type: "int", nullable: true),
                    Rpe = table.Column<int>(type: "int", nullable: true),
                    SubjectiveNotes = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    RawPayload = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "datetime2(7)", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "datetime2(7)", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Activities", x => x.Id);
                    table.CheckConstraint("CK_Activities_Duration", "\"DurationSeconds\" > 0");
                    table.CheckConstraint("CK_Activities_RawPayload", "[RawPayload] IS NULL OR ISJSON([RawPayload], VALUE) = 1");
                    table.CheckConstraint("CK_Activities_Subjective", "\"Mood\" BETWEEN 1 AND 5 AND \"Energy\" BETWEEN 1 AND 5 AND \"Rpe\" BETWEEN 1 AND 10");
                    table.CheckConstraint("CK_Activities_Type", "\"Type\" IN ('Running', 'Strength', 'Walking', 'Cycling', 'Hiking')");
                });

            migrationBuilder.CreateTable(
                name: "BodyMeasurements",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Date = table.Column<DateOnly>(type: "date", nullable: false),
                    WeightKg = table.Column<double>(type: "float", nullable: false),
                    BodyFatPercentage = table.Column<double>(type: "float", nullable: true),
                    Notes = table.Column<string>(type: "nvarchar(max)", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_BodyMeasurements", x => x.Id);
                    table.CheckConstraint("CK_BodyMeasurement_BodyFat", "\"BodyFatPercentage\" BETWEEN 0 AND 100");
                    table.CheckConstraint("CK_BodyMeasurement_Weight", "\"WeightKg\" > 0");
                });

            migrationBuilder.CreateTable(
                name: "DataProtectionKeys",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    FriendlyName = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    Xml = table.Column<string>(type: "nvarchar(max)", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_DataProtectionKeys", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "SeedHistory",
                columns: table => new
                {
                    Name = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                    RecordedAtUtc = table.Column<DateTime>(type: "datetime2(7)", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_SeedHistory", x => x.Name);
                });

            migrationBuilder.CreateTable(
                name: "RunningDetails",
                columns: table => new
                {
                    ActivityId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    DistanceKm = table.Column<double>(type: "float", nullable: true),
                    TotalDurationSeconds = table.Column<int>(type: "int", nullable: true),
                    MovingDurationSeconds = table.Column<int>(type: "int", nullable: true),
                    RunningDurationSeconds = table.Column<int>(type: "int", nullable: true),
                    WalkingDurationSeconds = table.Column<int>(type: "int", nullable: true),
                    AveragePaceSecondsPerKm = table.Column<double>(type: "float", nullable: true),
                    MovingPaceSecondsPerKm = table.Column<double>(type: "float", nullable: true),
                    BestPaceSecondsPerKm = table.Column<double>(type: "float", nullable: true),
                    AverageHeartRate = table.Column<int>(type: "int", nullable: true),
                    MaxHeartRate = table.Column<int>(type: "int", nullable: true),
                    RecoveryHeartRate = table.Column<int>(type: "int", nullable: true),
                    AveragePowerWatts = table.Column<int>(type: "int", nullable: true),
                    MaxPowerWatts = table.Column<int>(type: "int", nullable: true),
                    AverageCadence = table.Column<int>(type: "int", nullable: true),
                    MaxCadence = table.Column<int>(type: "int", nullable: true),
                    AverageStrideLengthMeters = table.Column<double>(type: "float", nullable: true),
                    TotalAscentMeters = table.Column<double>(type: "float", nullable: true),
                    TotalDescentMeters = table.Column<double>(type: "float", nullable: true),
                    MinElevationMeters = table.Column<double>(type: "float", nullable: true),
                    MaxElevationMeters = table.Column<double>(type: "float", nullable: true),
                    AerobicTrainingEffect = table.Column<double>(type: "float", nullable: true),
                    AnaerobicTrainingEffect = table.Column<double>(type: "float", nullable: true),
                    TrainingLoad = table.Column<double>(type: "float", nullable: true),
                    ActiveCalories = table.Column<int>(type: "int", nullable: true),
                    TotalCalories = table.Column<int>(type: "int", nullable: true),
                    EstimatedFluidLossMl = table.Column<int>(type: "int", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_RunningDetails", x => x.ActivityId);
                    table.CheckConstraint("CK_RunningDetails_ActiveCalories", "\"ActiveCalories\" >= 0");
                    table.CheckConstraint("CK_RunningDetails_AerobicTrainingEffect", "\"AerobicTrainingEffect\" >= 0");
                    table.CheckConstraint("CK_RunningDetails_AnaerobicTrainingEffect", "\"AnaerobicTrainingEffect\" >= 0");
                    table.CheckConstraint("CK_RunningDetails_AverageCadence", "\"AverageCadence\" >= 0");
                    table.CheckConstraint("CK_RunningDetails_AverageHeartRate", "\"AverageHeartRate\" >= 0");
                    table.CheckConstraint("CK_RunningDetails_AveragePaceSecondsPerKm", "\"AveragePaceSecondsPerKm\" >= 0");
                    table.CheckConstraint("CK_RunningDetails_AveragePowerWatts", "\"AveragePowerWatts\" >= 0");
                    table.CheckConstraint("CK_RunningDetails_AverageStrideLengthMeters", "\"AverageStrideLengthMeters\" >= 0");
                    table.CheckConstraint("CK_RunningDetails_BestPaceSecondsPerKm", "\"BestPaceSecondsPerKm\" >= 0");
                    table.CheckConstraint("CK_RunningDetails_Cadence", "\"AverageCadence\" <= \"MaxCadence\"");
                    table.CheckConstraint("CK_RunningDetails_Calories", "\"ActiveCalories\" <= \"TotalCalories\"");
                    table.CheckConstraint("CK_RunningDetails_DistanceKm", "\"DistanceKm\" >= 0");
                    table.CheckConstraint("CK_RunningDetails_Durations", "\"TotalDurationSeconds\" > 0 AND \"MovingDurationSeconds\" <= \"TotalDurationSeconds\" AND CAST(COALESCE(\"RunningDurationSeconds\", 0) AS bigint) + CAST(COALESCE(\"WalkingDurationSeconds\", 0) AS bigint) <= \"TotalDurationSeconds\"");
                    table.CheckConstraint("CK_RunningDetails_Elevation", "\"MinElevationMeters\" <= \"MaxElevationMeters\"");
                    table.CheckConstraint("CK_RunningDetails_EstimatedFluidLossMl", "\"EstimatedFluidLossMl\" >= 0");
                    table.CheckConstraint("CK_RunningDetails_HeartRate", "\"AverageHeartRate\" > 0 AND \"MaxHeartRate\" > 0 AND \"RecoveryHeartRate\" > 0 AND \"AverageHeartRate\" <= \"MaxHeartRate\"");
                    table.CheckConstraint("CK_RunningDetails_MaxCadence", "\"MaxCadence\" >= 0");
                    table.CheckConstraint("CK_RunningDetails_MaxHeartRate", "\"MaxHeartRate\" >= 0");
                    table.CheckConstraint("CK_RunningDetails_MaxPowerWatts", "\"MaxPowerWatts\" >= 0");
                    table.CheckConstraint("CK_RunningDetails_MovingDurationSeconds", "\"MovingDurationSeconds\" >= 0");
                    table.CheckConstraint("CK_RunningDetails_MovingPaceSecondsPerKm", "\"MovingPaceSecondsPerKm\" >= 0");
                    table.CheckConstraint("CK_RunningDetails_Pace", "\"AveragePaceSecondsPerKm\" > 0 AND \"MovingPaceSecondsPerKm\" > 0 AND \"BestPaceSecondsPerKm\" > 0");
                    table.CheckConstraint("CK_RunningDetails_Power", "\"AveragePowerWatts\" <= \"MaxPowerWatts\"");
                    table.CheckConstraint("CK_RunningDetails_RecoveryHeartRate", "\"RecoveryHeartRate\" >= 0");
                    table.CheckConstraint("CK_RunningDetails_RunningDurationSeconds", "\"RunningDurationSeconds\" >= 0");
                    table.CheckConstraint("CK_RunningDetails_TotalAscentMeters", "\"TotalAscentMeters\" >= 0");
                    table.CheckConstraint("CK_RunningDetails_TotalCalories", "\"TotalCalories\" >= 0");
                    table.CheckConstraint("CK_RunningDetails_TotalDescentMeters", "\"TotalDescentMeters\" >= 0");
                    table.CheckConstraint("CK_RunningDetails_TotalDurationSeconds", "\"TotalDurationSeconds\" >= 0");
                    table.CheckConstraint("CK_RunningDetails_TrainingEffect", "\"AerobicTrainingEffect\" <= 5 AND \"AnaerobicTrainingEffect\" <= 5");
                    table.CheckConstraint("CK_RunningDetails_TrainingLoad", "\"TrainingLoad\" >= 0");
                    table.CheckConstraint("CK_RunningDetails_WalkingDurationSeconds", "\"WalkingDurationSeconds\" >= 0");
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
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    ActivityId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    ExerciseName = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    Order = table.Column<int>(type: "int", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_StrengthExercise", x => x.Id);
                    table.CheckConstraint("CK_StrengthExercise_Values", "LEN(LTRIM(RTRIM(\"ExerciseName\"))) > 0 AND \"Order\" >= 0");
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
                    ActivityId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    LapNumber = table.Column<int>(type: "int", nullable: false),
                    DistanceKm = table.Column<double>(type: "float", nullable: true),
                    DurationSeconds = table.Column<int>(type: "int", nullable: true),
                    AveragePaceSecondsPerKm = table.Column<double>(type: "float", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_RunningLap", x => new { x.ActivityId, x.LapNumber });
                    table.CheckConstraint("CK_RunningLap_HasMeasurement", "\"DistanceKm\" IS NOT NULL OR \"DurationSeconds\" IS NOT NULL");
                    table.CheckConstraint("CK_RunningLap_Values", "\"LapNumber\" > 0 AND \"DurationSeconds\" > 0 AND \"DistanceKm\" > 0 AND \"AveragePaceSecondsPerKm\" > 0");
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
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    StrengthExerciseId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    SetNumber = table.Column<int>(type: "int", nullable: false),
                    Reps = table.Column<int>(type: "int", nullable: false),
                    WeightKg = table.Column<double>(type: "float", nullable: true),
                    DurationSeconds = table.Column<int>(type: "int", nullable: true),
                    Side = table.Column<string>(type: "nvarchar(10)", maxLength: 10, nullable: true, collation: "Latin1_General_100_BIN2")
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_StrengthSet", x => x.Id);
                    table.CheckConstraint("CK_StrengthSet_HasWork", "\"Reps\" > 0 OR COALESCE(\"DurationSeconds\", 0) > 0");
                    table.CheckConstraint("CK_StrengthSet_Values", "\"SetNumber\" > 0 AND \"Reps\" >= 0 AND \"DurationSeconds\" > 0 AND \"WeightKg\" >= 0 AND \"Side\" IN ('Left', 'Right', 'Both')");
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
                name: "DataProtectionKeys");

            migrationBuilder.DropTable(
                name: "RunningLap");

            migrationBuilder.DropTable(
                name: "SeedHistory");

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
