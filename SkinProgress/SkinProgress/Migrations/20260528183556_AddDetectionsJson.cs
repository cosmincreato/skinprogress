using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace SkinProgress.Migrations
{
    /// <inheritdoc />
    public partial class AddDetectionsJson : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "DetectionsFrontJson",
                table: "AnalysisResults",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "DetectionsLeftJson",
                table: "AnalysisResults",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "DetectionsRightJson",
                table: "AnalysisResults",
                type: "text",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "DetectionsFrontJson",
                table: "AnalysisResults");

            migrationBuilder.DropColumn(
                name: "DetectionsLeftJson",
                table: "AnalysisResults");

            migrationBuilder.DropColumn(
                name: "DetectionsRightJson",
                table: "AnalysisResults");
        }
    }
}
