using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Progress.Api.Migrations
{
    /// <inheritdoc />
    public partial class IntegrityAndSeedGuard : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "SeedHistory",
                columns: table => new
                {
                    Name = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    RecordedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_SeedHistory", x => x.Name);
                });

            // Never reopen the seed gate on an existing installation, even if all
            // activities and measurements are subsequently deleted. Do not classify
            // or rewrite historical records based on their notes.
            migrationBuilder.Sql("""
                INSERT INTO "SeedHistory" ("Name", "RecordedAtUtc")
                SELECT 'demo-v1', CURRENT_TIMESTAMP
                WHERE EXISTS (SELECT 1 FROM "Activities")
                   OR EXISTS (SELECT 1 FROM "BodyMeasurements");
                """);

            migrationBuilder.AddCheckConstraint(
                name: "CK_StrengthSet_HasWork",
                table: "StrengthSet",
                sql: "\"Reps\" > 0 OR COALESCE(\"DurationSeconds\", 0) > 0");

            migrationBuilder.AddCheckConstraint(
                name: "CK_StrengthSet_Values",
                table: "StrengthSet",
                sql: "\"SetNumber\" > 0 AND \"Reps\" >= 0 AND \"DurationSeconds\" > 0 AND \"WeightKg\" >= 0 AND \"WeightKg\" < 'Infinity'::double precision AND \"Side\" IN ('Left', 'Right', 'Both')");

            migrationBuilder.AddCheckConstraint(
                name: "CK_StrengthExercise_Values",
                table: "StrengthExercise",
                sql: "length(btrim(\"ExerciseName\")) > 0 AND \"Order\" >= 0");

            migrationBuilder.AddCheckConstraint(
                name: "CK_RunningLap_HasMeasurement",
                table: "RunningLap",
                sql: "\"DistanceKm\" IS NOT NULL OR \"DurationSeconds\" IS NOT NULL");

            migrationBuilder.AddCheckConstraint(
                name: "CK_RunningLap_Values",
                table: "RunningLap",
                sql: "\"LapNumber\" > 0 AND \"DurationSeconds\" > 0 AND \"DistanceKm\" > 0 AND \"DistanceKm\" < 'Infinity'::double precision AND \"AveragePaceSecondsPerKm\" > 0 AND \"AveragePaceSecondsPerKm\" < 'Infinity'::double precision");

            migrationBuilder.AddCheckConstraint(
                name: "CK_RunningDetails_ActiveCalories",
                table: "RunningDetails",
                sql: "\"ActiveCalories\" >= 0");

            migrationBuilder.AddCheckConstraint(
                name: "CK_RunningDetails_AerobicTrainingEffect",
                table: "RunningDetails",
                sql: "\"AerobicTrainingEffect\" >= 0 AND \"AerobicTrainingEffect\" < 'Infinity'::double precision");

            migrationBuilder.AddCheckConstraint(
                name: "CK_RunningDetails_AnaerobicTrainingEffect",
                table: "RunningDetails",
                sql: "\"AnaerobicTrainingEffect\" >= 0 AND \"AnaerobicTrainingEffect\" < 'Infinity'::double precision");

            migrationBuilder.AddCheckConstraint(
                name: "CK_RunningDetails_AverageCadence",
                table: "RunningDetails",
                sql: "\"AverageCadence\" >= 0");

            migrationBuilder.AddCheckConstraint(
                name: "CK_RunningDetails_AverageHeartRate",
                table: "RunningDetails",
                sql: "\"AverageHeartRate\" >= 0");

            migrationBuilder.AddCheckConstraint(
                name: "CK_RunningDetails_AveragePaceSecondsPerKm",
                table: "RunningDetails",
                sql: "\"AveragePaceSecondsPerKm\" >= 0 AND \"AveragePaceSecondsPerKm\" < 'Infinity'::double precision");

            migrationBuilder.AddCheckConstraint(
                name: "CK_RunningDetails_AveragePowerWatts",
                table: "RunningDetails",
                sql: "\"AveragePowerWatts\" >= 0");

            migrationBuilder.AddCheckConstraint(
                name: "CK_RunningDetails_AverageStrideLengthMeters",
                table: "RunningDetails",
                sql: "\"AverageStrideLengthMeters\" >= 0 AND \"AverageStrideLengthMeters\" < 'Infinity'::double precision");

            migrationBuilder.AddCheckConstraint(
                name: "CK_RunningDetails_BestPaceSecondsPerKm",
                table: "RunningDetails",
                sql: "\"BestPaceSecondsPerKm\" >= 0 AND \"BestPaceSecondsPerKm\" < 'Infinity'::double precision");

            migrationBuilder.AddCheckConstraint(
                name: "CK_RunningDetails_Cadence",
                table: "RunningDetails",
                sql: "\"AverageCadence\" <= \"MaxCadence\"");

            migrationBuilder.AddCheckConstraint(
                name: "CK_RunningDetails_Calories",
                table: "RunningDetails",
                sql: "\"ActiveCalories\" <= \"TotalCalories\"");

            migrationBuilder.AddCheckConstraint(
                name: "CK_RunningDetails_DistanceKm",
                table: "RunningDetails",
                sql: "\"DistanceKm\" >= 0 AND \"DistanceKm\" < 'Infinity'::double precision");

            migrationBuilder.AddCheckConstraint(
                name: "CK_RunningDetails_Durations",
                table: "RunningDetails",
                sql: "\"TotalDurationSeconds\" > 0 AND \"MovingDurationSeconds\" <= \"TotalDurationSeconds\" AND COALESCE(\"RunningDurationSeconds\", 0)::bigint + COALESCE(\"WalkingDurationSeconds\", 0)::bigint <= \"TotalDurationSeconds\"");

            migrationBuilder.AddCheckConstraint(
                name: "CK_RunningDetails_Elevation",
                table: "RunningDetails",
                sql: "\"MinElevationMeters\" <= \"MaxElevationMeters\"");

            migrationBuilder.AddCheckConstraint(
                name: "CK_RunningDetails_EstimatedFluidLossMl",
                table: "RunningDetails",
                sql: "\"EstimatedFluidLossMl\" >= 0");

            migrationBuilder.AddCheckConstraint(
                name: "CK_RunningDetails_HeartRate",
                table: "RunningDetails",
                sql: "\"AverageHeartRate\" > 0 AND \"MaxHeartRate\" > 0 AND \"RecoveryHeartRate\" > 0 AND \"AverageHeartRate\" <= \"MaxHeartRate\"");

            migrationBuilder.AddCheckConstraint(
                name: "CK_RunningDetails_MaxCadence",
                table: "RunningDetails",
                sql: "\"MaxCadence\" >= 0");

            migrationBuilder.AddCheckConstraint(
                name: "CK_RunningDetails_MaxElevationMeters",
                table: "RunningDetails",
                sql: "\"MaxElevationMeters\" > '-Infinity'::double precision AND \"MaxElevationMeters\" < 'Infinity'::double precision");

            migrationBuilder.AddCheckConstraint(
                name: "CK_RunningDetails_MaxHeartRate",
                table: "RunningDetails",
                sql: "\"MaxHeartRate\" >= 0");

            migrationBuilder.AddCheckConstraint(
                name: "CK_RunningDetails_MaxPowerWatts",
                table: "RunningDetails",
                sql: "\"MaxPowerWatts\" >= 0");

            migrationBuilder.AddCheckConstraint(
                name: "CK_RunningDetails_MinElevationMeters",
                table: "RunningDetails",
                sql: "\"MinElevationMeters\" > '-Infinity'::double precision AND \"MinElevationMeters\" < 'Infinity'::double precision");

            migrationBuilder.AddCheckConstraint(
                name: "CK_RunningDetails_MovingDurationSeconds",
                table: "RunningDetails",
                sql: "\"MovingDurationSeconds\" >= 0");

            migrationBuilder.AddCheckConstraint(
                name: "CK_RunningDetails_MovingPaceSecondsPerKm",
                table: "RunningDetails",
                sql: "\"MovingPaceSecondsPerKm\" >= 0 AND \"MovingPaceSecondsPerKm\" < 'Infinity'::double precision");

            migrationBuilder.AddCheckConstraint(
                name: "CK_RunningDetails_Power",
                table: "RunningDetails",
                sql: "\"AveragePowerWatts\" <= \"MaxPowerWatts\"");

            migrationBuilder.AddCheckConstraint(
                name: "CK_RunningDetails_RecoveryHeartRate",
                table: "RunningDetails",
                sql: "\"RecoveryHeartRate\" >= 0");

            migrationBuilder.AddCheckConstraint(
                name: "CK_RunningDetails_RunningDurationSeconds",
                table: "RunningDetails",
                sql: "\"RunningDurationSeconds\" >= 0");

            migrationBuilder.AddCheckConstraint(
                name: "CK_RunningDetails_TotalAscentMeters",
                table: "RunningDetails",
                sql: "\"TotalAscentMeters\" >= 0 AND \"TotalAscentMeters\" < 'Infinity'::double precision");

            migrationBuilder.AddCheckConstraint(
                name: "CK_RunningDetails_TotalCalories",
                table: "RunningDetails",
                sql: "\"TotalCalories\" >= 0");

            migrationBuilder.AddCheckConstraint(
                name: "CK_RunningDetails_TotalDescentMeters",
                table: "RunningDetails",
                sql: "\"TotalDescentMeters\" >= 0 AND \"TotalDescentMeters\" < 'Infinity'::double precision");

            migrationBuilder.AddCheckConstraint(
                name: "CK_RunningDetails_TotalDurationSeconds",
                table: "RunningDetails",
                sql: "\"TotalDurationSeconds\" >= 0");

            migrationBuilder.AddCheckConstraint(
                name: "CK_RunningDetails_TrainingEffect",
                table: "RunningDetails",
                sql: "\"AerobicTrainingEffect\" <= 5 AND \"AnaerobicTrainingEffect\" <= 5");

            migrationBuilder.AddCheckConstraint(
                name: "CK_RunningDetails_TrainingLoad",
                table: "RunningDetails",
                sql: "\"TrainingLoad\" >= 0 AND \"TrainingLoad\" < 'Infinity'::double precision");

            migrationBuilder.AddCheckConstraint(
                name: "CK_RunningDetails_WalkingDurationSeconds",
                table: "RunningDetails",
                sql: "\"WalkingDurationSeconds\" >= 0");

            migrationBuilder.AddCheckConstraint(
                name: "CK_BodyMeasurement_BodyFat",
                table: "BodyMeasurements",
                sql: "\"BodyFatPercentage\" BETWEEN 0 AND 100");

            migrationBuilder.AddCheckConstraint(
                name: "CK_BodyMeasurement_Weight",
                table: "BodyMeasurements",
                sql: "\"WeightKg\" > 0 AND \"WeightKg\" < 'Infinity'::double precision");

            migrationBuilder.AddCheckConstraint(
                name: "CK_Activities_Duration",
                table: "Activities",
                sql: "\"DurationSeconds\" > 0");

            migrationBuilder.AddCheckConstraint(
                name: "CK_Activities_Subjective",
                table: "Activities",
                sql: "\"Mood\" BETWEEN 1 AND 5 AND \"Energy\" BETWEEN 1 AND 5 AND \"Rpe\" BETWEEN 1 AND 10");

            migrationBuilder.AddCheckConstraint(
                name: "CK_Activities_Type",
                table: "Activities",
                sql: "\"Type\" IN ('Running', 'Strength', 'Walking', 'Cycling', 'Hiking')");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "SeedHistory");

            migrationBuilder.DropCheckConstraint(
                name: "CK_StrengthSet_HasWork",
                table: "StrengthSet");

            migrationBuilder.DropCheckConstraint(
                name: "CK_StrengthSet_Values",
                table: "StrengthSet");

            migrationBuilder.DropCheckConstraint(
                name: "CK_StrengthExercise_Values",
                table: "StrengthExercise");

            migrationBuilder.DropCheckConstraint(
                name: "CK_RunningLap_HasMeasurement",
                table: "RunningLap");

            migrationBuilder.DropCheckConstraint(
                name: "CK_RunningLap_Values",
                table: "RunningLap");

            migrationBuilder.DropCheckConstraint(
                name: "CK_RunningDetails_ActiveCalories",
                table: "RunningDetails");

            migrationBuilder.DropCheckConstraint(
                name: "CK_RunningDetails_AerobicTrainingEffect",
                table: "RunningDetails");

            migrationBuilder.DropCheckConstraint(
                name: "CK_RunningDetails_AnaerobicTrainingEffect",
                table: "RunningDetails");

            migrationBuilder.DropCheckConstraint(
                name: "CK_RunningDetails_AverageCadence",
                table: "RunningDetails");

            migrationBuilder.DropCheckConstraint(
                name: "CK_RunningDetails_AverageHeartRate",
                table: "RunningDetails");

            migrationBuilder.DropCheckConstraint(
                name: "CK_RunningDetails_AveragePaceSecondsPerKm",
                table: "RunningDetails");

            migrationBuilder.DropCheckConstraint(
                name: "CK_RunningDetails_AveragePowerWatts",
                table: "RunningDetails");

            migrationBuilder.DropCheckConstraint(
                name: "CK_RunningDetails_AverageStrideLengthMeters",
                table: "RunningDetails");

            migrationBuilder.DropCheckConstraint(
                name: "CK_RunningDetails_BestPaceSecondsPerKm",
                table: "RunningDetails");

            migrationBuilder.DropCheckConstraint(
                name: "CK_RunningDetails_Cadence",
                table: "RunningDetails");

            migrationBuilder.DropCheckConstraint(
                name: "CK_RunningDetails_Calories",
                table: "RunningDetails");

            migrationBuilder.DropCheckConstraint(
                name: "CK_RunningDetails_DistanceKm",
                table: "RunningDetails");

            migrationBuilder.DropCheckConstraint(
                name: "CK_RunningDetails_Durations",
                table: "RunningDetails");

            migrationBuilder.DropCheckConstraint(
                name: "CK_RunningDetails_Elevation",
                table: "RunningDetails");

            migrationBuilder.DropCheckConstraint(
                name: "CK_RunningDetails_EstimatedFluidLossMl",
                table: "RunningDetails");

            migrationBuilder.DropCheckConstraint(
                name: "CK_RunningDetails_HeartRate",
                table: "RunningDetails");

            migrationBuilder.DropCheckConstraint(
                name: "CK_RunningDetails_MaxCadence",
                table: "RunningDetails");

            migrationBuilder.DropCheckConstraint(
                name: "CK_RunningDetails_MaxElevationMeters",
                table: "RunningDetails");

            migrationBuilder.DropCheckConstraint(
                name: "CK_RunningDetails_MaxHeartRate",
                table: "RunningDetails");

            migrationBuilder.DropCheckConstraint(
                name: "CK_RunningDetails_MaxPowerWatts",
                table: "RunningDetails");

            migrationBuilder.DropCheckConstraint(
                name: "CK_RunningDetails_MinElevationMeters",
                table: "RunningDetails");

            migrationBuilder.DropCheckConstraint(
                name: "CK_RunningDetails_MovingDurationSeconds",
                table: "RunningDetails");

            migrationBuilder.DropCheckConstraint(
                name: "CK_RunningDetails_MovingPaceSecondsPerKm",
                table: "RunningDetails");

            migrationBuilder.DropCheckConstraint(
                name: "CK_RunningDetails_Power",
                table: "RunningDetails");

            migrationBuilder.DropCheckConstraint(
                name: "CK_RunningDetails_RecoveryHeartRate",
                table: "RunningDetails");

            migrationBuilder.DropCheckConstraint(
                name: "CK_RunningDetails_RunningDurationSeconds",
                table: "RunningDetails");

            migrationBuilder.DropCheckConstraint(
                name: "CK_RunningDetails_TotalAscentMeters",
                table: "RunningDetails");

            migrationBuilder.DropCheckConstraint(
                name: "CK_RunningDetails_TotalCalories",
                table: "RunningDetails");

            migrationBuilder.DropCheckConstraint(
                name: "CK_RunningDetails_TotalDescentMeters",
                table: "RunningDetails");

            migrationBuilder.DropCheckConstraint(
                name: "CK_RunningDetails_TotalDurationSeconds",
                table: "RunningDetails");

            migrationBuilder.DropCheckConstraint(
                name: "CK_RunningDetails_TrainingEffect",
                table: "RunningDetails");

            migrationBuilder.DropCheckConstraint(
                name: "CK_RunningDetails_TrainingLoad",
                table: "RunningDetails");

            migrationBuilder.DropCheckConstraint(
                name: "CK_RunningDetails_WalkingDurationSeconds",
                table: "RunningDetails");

            migrationBuilder.DropCheckConstraint(
                name: "CK_BodyMeasurement_BodyFat",
                table: "BodyMeasurements");

            migrationBuilder.DropCheckConstraint(
                name: "CK_BodyMeasurement_Weight",
                table: "BodyMeasurements");

            migrationBuilder.DropCheckConstraint(
                name: "CK_Activities_Duration",
                table: "Activities");

            migrationBuilder.DropCheckConstraint(
                name: "CK_Activities_Subjective",
                table: "Activities");

            migrationBuilder.DropCheckConstraint(
                name: "CK_Activities_Type",
                table: "Activities");
        }
    }
}
