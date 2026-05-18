using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace SkinProgress.Migrations
{
    /// <inheritdoc />
    public partial class AddUnderEyeBagsSeverity : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "UnderEyeBagsSeverity",
                table: "AnalysisResults",
                type: "integer",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "UnderEyeBagsSeverity",
                table: "AnalysisResults");
        }
    }
}
