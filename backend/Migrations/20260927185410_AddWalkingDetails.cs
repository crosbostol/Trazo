using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Progress.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddWalkingDetails : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "WalkingDetails",
                columns: table => new
                {
                    ActivityId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    DistanceKm = table.Column<double>(type: "float", nullable: true),
                    AveragePaceSecondsPerKm = table.Column<double>(type: "float", nullable: true),
                    MovingPaceSecondsPerKm = table.Column<double>(type: "float", nullable: true),
                    BestPaceSecondsPerKm = table.Column<double>(type: "float", nullable: true),
                    TotalAscentMeters = table.Column<double>(type: "float", nullable: true),
                    TotalDescentMeters = table.Column<double>(type: "float", nullable: true),
                    MinElevationMeters = table.Column<double>(type: "float", nullable: true),
                    MaxElevationMeters = table.Column<double>(type: "float", nullable: true),
                    AerobicTrainingEffect = table.Column<double>(type: "float", nullable: true),
                    AnaerobicTrainingEffect = table.Column<double>(type: "float", nullable: true),
                    TrainingLoad = table.Column<double>(type: "float", nullable: true),
                    TotalDurationSeconds = table.Column<int>(type: "int", nullable: true),
                    MovingDurationSeconds = table.Column<int>(type: "int", nullable: true),
                    AverageHeartRate = table.Column<int>(type: "int", nullable: true),
                    MaxHeartRate = table.Column<int>(type: "int", nullable: true),
                    RecoveryHeartRate = table.Column<int>(type: "int", nullable: true),
                    AverageCadence = table.Column<int>(type: "int", nullable: true),
                    MaxCadence = table.Column<int>(type: "int", nullable: true),
                    Steps = table.Column<int>(type: "int", nullable: true),
                    ActiveCalories = table.Column<int>(type: "int", nullable: true),
                    TotalCalories = table.Column<int>(type: "int", nullable: true),
                    EstimatedFluidLossMl = table.Column<int>(type: "int", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_WalkingDetails", x => x.ActivityId);
                    table.CheckConstraint("CK_WalkingDetails_ActiveCalories", "[ActiveCalories] >= 0");
                    table.CheckConstraint("CK_WalkingDetails_AerobicTrainingEffect", "[AerobicTrainingEffect] >= 0");
                    table.CheckConstraint("CK_WalkingDetails_AnaerobicTrainingEffect", "[AnaerobicTrainingEffect] >= 0");
                    table.CheckConstraint("CK_WalkingDetails_AverageCadence", "[AverageCadence] >= 0");
                    table.CheckConstraint("CK_WalkingDetails_AverageHeartRate", "[AverageHeartRate] >= 0");
                    table.CheckConstraint("CK_WalkingDetails_AveragePaceSecondsPerKm", "[AveragePaceSecondsPerKm] >= 0");
                    table.CheckConstraint("CK_WalkingDetails_BestPaceSecondsPerKm", "[BestPaceSecondsPerKm] >= 0");
                    table.CheckConstraint("CK_WalkingDetails_Cadence", "[AverageCadence] <= [MaxCadence]");
                    table.CheckConstraint("CK_WalkingDetails_Calories", "[ActiveCalories] <= [TotalCalories]");
                    table.CheckConstraint("CK_WalkingDetails_DistanceKm", "[DistanceKm] >= 0");
                    table.CheckConstraint("CK_WalkingDetails_Durations", "[TotalDurationSeconds] > 0 AND [MovingDurationSeconds] <= [TotalDurationSeconds]");
                    table.CheckConstraint("CK_WalkingDetails_Elevation", "[MinElevationMeters] <= [MaxElevationMeters]");
                    table.CheckConstraint("CK_WalkingDetails_EstimatedFluidLossMl", "[EstimatedFluidLossMl] >= 0");
                    table.CheckConstraint("CK_WalkingDetails_HeartRate", "[AverageHeartRate] > 0 AND [MaxHeartRate] > 0 AND [RecoveryHeartRate] > 0 AND [AverageHeartRate] <= [MaxHeartRate]");
                    table.CheckConstraint("CK_WalkingDetails_MaxCadence", "[MaxCadence] >= 0");
                    table.CheckConstraint("CK_WalkingDetails_MaxHeartRate", "[MaxHeartRate] >= 0");
                    table.CheckConstraint("CK_WalkingDetails_MovingDurationSeconds", "[MovingDurationSeconds] >= 0");
                    table.CheckConstraint("CK_WalkingDetails_MovingPaceSecondsPerKm", "[MovingPaceSecondsPerKm] >= 0");
                    table.CheckConstraint("CK_WalkingDetails_Pace", "[AveragePaceSecondsPerKm] > 0 AND [MovingPaceSecondsPerKm] > 0 AND [BestPaceSecondsPerKm] > 0");
                    table.CheckConstraint("CK_WalkingDetails_RecoveryHeartRate", "[RecoveryHeartRate] >= 0");
                    table.CheckConstraint("CK_WalkingDetails_Steps", "[Steps] >= 0");
                    table.CheckConstraint("CK_WalkingDetails_TotalAscentMeters", "[TotalAscentMeters] >= 0");
                    table.CheckConstraint("CK_WalkingDetails_TotalCalories", "[TotalCalories] >= 0");
                    table.CheckConstraint("CK_WalkingDetails_TotalDescentMeters", "[TotalDescentMeters] >= 0");
                    table.CheckConstraint("CK_WalkingDetails_TotalDurationSeconds", "[TotalDurationSeconds] >= 0");
                    table.CheckConstraint("CK_WalkingDetails_TrainingEffect", "[AerobicTrainingEffect] <= 5 AND [AnaerobicTrainingEffect] <= 5");
                    table.CheckConstraint("CK_WalkingDetails_TrainingLoad", "[TrainingLoad] >= 0");
                    table.ForeignKey(
                        name: "FK_WalkingDetails_Activities_ActivityId",
                        column: x => x.ActivityId,
                        principalTable: "Activities",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "WalkingDetails");
        }
    }
}
