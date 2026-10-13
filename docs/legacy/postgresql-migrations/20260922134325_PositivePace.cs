using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Progress.Api.Migrations
{
    /// <inheritdoc />
    public partial class PositivePace : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddCheckConstraint(
                name: "CK_RunningDetails_Pace",
                table: "RunningDetails",
                sql: "\"AveragePaceSecondsPerKm\" > 0 AND \"MovingPaceSecondsPerKm\" > 0 AND \"BestPaceSecondsPerKm\" > 0");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropCheckConstraint(
                name: "CK_RunningDetails_Pace",
                table: "RunningDetails");
        }
    }
}
