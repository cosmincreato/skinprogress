using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace SkinProgress.Migrations
{
    public partial class RepairMissingColumns : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // PostgreSQL 9.6+ supports ADD COLUMN IF NOT EXISTS directly.
            // These columns were declared in empty migrations and were never actually added to the DB.
            migrationBuilder.Sql(@"ALTER TABLE ""AnalysisResults"" ADD COLUMN IF NOT EXISTS ""UnderEyeBagsSeverity"" integer;");
            migrationBuilder.Sql(@"ALTER TABLE ""AnalysisResults"" ADD COLUMN IF NOT EXISTS ""HeatmapFrontUrl"" text;");
            migrationBuilder.Sql(@"ALTER TABLE ""AnalysisResults"" ADD COLUMN IF NOT EXISTS ""HeatmapLeftUrl"" text;");
            migrationBuilder.Sql(@"ALTER TABLE ""AnalysisResults"" ADD COLUMN IF NOT EXISTS ""HeatmapRightUrl"" text;");
            migrationBuilder.Sql(@"ALTER TABLE ""AnalysisResults"" ADD COLUMN IF NOT EXISTS ""ProgressScore"" integer;");
            migrationBuilder.Sql(@"ALTER TABLE ""AnalysisResults"" ADD COLUMN IF NOT EXISTS ""CompensationMetadata"" text;");
            migrationBuilder.Sql(@"ALTER TABLE ""AnalysisResults"" ADD COLUMN IF NOT EXISTS ""LesionData"" text;");
            migrationBuilder.Sql(@"ALTER TABLE ""AnalysisResults"" ADD COLUMN IF NOT EXISTS ""SegmentationMasks"" text;");
            migrationBuilder.Sql(@"ALTER TABLE ""AnalysisResults"" ADD COLUMN IF NOT EXISTS ""QualityWarning"" text;");
            migrationBuilder.Sql(@"ALTER TABLE ""AnalysisResults"" ADD COLUMN IF NOT EXISTS ""Model3DUrl"" text;");
            migrationBuilder.Sql(@"ALTER TABLE ""AnalysisResults"" ADD COLUMN IF NOT EXISTS ""TimelapseUrl"" text;");
            migrationBuilder.Sql(@"ALTER TABLE ""AnalysisResults"" ADD COLUMN IF NOT EXISTS ""DetectionsFrontJson"" text;");
            migrationBuilder.Sql(@"ALTER TABLE ""AnalysisResults"" ADD COLUMN IF NOT EXISTS ""DetectionsLeftJson"" text;");
            migrationBuilder.Sql(@"ALTER TABLE ""AnalysisResults"" ADD COLUMN IF NOT EXISTS ""DetectionsRightJson"" text;");
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
        }
    }
}
