using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace SkinProgress.Migrations
{
    /// <inheritdoc />
    public partial class AddAnalysisResultsTable : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "AnalysisResults",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    UserId = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: false),
                    SelfieId = table.Column<Guid>(type: "uuid", nullable: false),
                    Timestamp = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    AcneSeverity = table.Column<int>(type: "integer", nullable: true),
                    InflammationSeverity = table.Column<int>(type: "integer", nullable: true),
                    RednessSeverity = table.Column<int>(type: "integer", nullable: true),
                    ForeheadSeverity = table.Column<int>(type: "integer", nullable: true),
                    LeftCheekSeverity = table.Column<int>(type: "integer", nullable: true),
                    RightCheekSeverity = table.Column<int>(type: "integer", nullable: true),
                    ChinSeverity = table.Column<int>(type: "integer", nullable: true),
                    NoseSeverity = table.Column<int>(type: "integer", nullable: true),
                    HeatmapImageUrl = table.Column<string>(type: "text", nullable: true),
                    Status = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    ErrorMessage = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_AnalysisResults", x => x.Id);
                });

            migrationBuilder.Sql("ALTER TABLE \"AnalysisResults\" ALTER COLUMN \"CreatedAt\" SET DEFAULT CURRENT_TIMESTAMP;");

            migrationBuilder.CreateIndex(
                name: "IX_AnalysisResults_SelfieId",
                table: "AnalysisResults",
                column: "SelfieId");

            migrationBuilder.CreateIndex(
                name: "IX_AnalysisResults_UserId_Timestamp",
                table: "AnalysisResults",
                columns: new[] { "UserId", "Timestamp" },
                descending: new[] { false, true });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "AnalysisResults");
        }
    }
}
