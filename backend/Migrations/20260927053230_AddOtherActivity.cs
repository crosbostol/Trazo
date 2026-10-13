using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Progress.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddOtherActivity : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropCheckConstraint(
                name: "CK_Activities_Type",
                table: "Activities");

            migrationBuilder.AddColumn<string>(
                name: "ActivitySubtype",
                table: "Activities",
                type: "nvarchar(200)",
                maxLength: 200,
                nullable: true);

            migrationBuilder.AddCheckConstraint(
                name: "CK_Activities_Subtype",
                table: "Activities",
                sql: "[ActivitySubtype] IS NULL OR ([Type] = 'Other' AND LEN(LTRIM(RTRIM([ActivitySubtype]))) > 0)");

            migrationBuilder.AddCheckConstraint(
                name: "CK_Activities_Type",
                table: "Activities",
                sql: "\"Type\" IN ('Running', 'Strength', 'Walking', 'Cycling', 'Hiking', 'Other')");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropCheckConstraint(
                name: "CK_Activities_Subtype",
                table: "Activities");

            migrationBuilder.DropCheckConstraint(
                name: "CK_Activities_Type",
                table: "Activities");

            migrationBuilder.DropColumn(
                name: "ActivitySubtype",
                table: "Activities");

            migrationBuilder.AddCheckConstraint(
                name: "CK_Activities_Type",
                table: "Activities",
                sql: "\"Type\" IN ('Running', 'Strength', 'Walking', 'Cycling', 'Hiking')");
        }
    }
}
