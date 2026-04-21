using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace SkinProgress.Migrations
{
    /// <inheritdoc />
    public partial class AddPhotoCaptureSystem : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<long>(
                name: "CurrentStorageUsed",
                table: "Users",
                type: "bigint",
                nullable: false,
                defaultValue: 0L);

            migrationBuilder.AddColumn<long>(
                name: "StandardStorageQuota",
                table: "Users",
                type: "bigint",
                nullable: false,
                defaultValue: 0L);

            migrationBuilder.AlterColumn<DateTime>(
                name: "CreatedAt",
                table: "AnalysisResults",
                type: "timestamp with time zone",
                nullable: false,
                defaultValueSql: "NOW()",
                oldClrType: typeof(DateTime),
                oldType: "timestamp with time zone",
                oldDefaultValueSql: "GETUTCDATE()");

            migrationBuilder.CreateTable(
                name: "PhotoMetadatas",
                columns: table => new
                {
                    MetadataId = table.Column<Guid>(type: "uuid", nullable: false),
                    PhotoId = table.Column<Guid>(type: "uuid", nullable: false),
                    CaptureTimestamp = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    DeviceModel = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    Orientation = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false, defaultValue: "normal"),
                    Brightness = table.Column<decimal>(type: "numeric(3,1)", precision: 3, scale: 1, nullable: false),
                    FaceDetectionConfidence = table.Column<decimal>(type: "numeric(4,3)", precision: 4, scale: 3, nullable: false),
                    FaceCount = table.Column<int>(type: "integer", nullable: false),
                    CompressionQuality = table.Column<int>(type: "integer", nullable: false),
                    CompressionRatio = table.Column<decimal>(type: "numeric", nullable: true),
                    ExifRaw = table.Column<string>(type: "text", nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false, defaultValueSql: "NOW()")
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PhotoMetadatas", x => x.MetadataId);
                });

            migrationBuilder.CreateTable(
                name: "Photos",
                columns: table => new
                {
                    PhotoId = table.Column<Guid>(type: "uuid", nullable: false),
                    UserId = table.Column<Guid>(type: "uuid", nullable: false),
                    SelfieCaptures_CaptureId = table.Column<Guid>(type: "uuid", nullable: true),
                    ViewType = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    CaptureDate = table.Column<DateTime>(type: "timestamp(0) with time zone", precision: 0, nullable: false),
                    FilePath = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: false),
                    FileSize = table.Column<long>(type: "bigint", nullable: false),
                    MetadataId = table.Column<Guid>(type: "uuid", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false, defaultValueSql: "NOW()"),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false, defaultValueSql: "NOW()"),
                    DeletedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Photos", x => x.PhotoId);
                    table.ForeignKey(
                        name: "FK_Photos_PhotoMetadatas_MetadataId",
                        column: x => x.MetadataId,
                        principalTable: "PhotoMetadatas",
                        principalColumn: "MetadataId",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_Photos_Users_UserId",
                        column: x => x.UserId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "SelfieCaptures",
                columns: table => new
                {
                    CaptureId = table.Column<Guid>(type: "uuid", nullable: false),
                    UserId = table.Column<Guid>(type: "uuid", nullable: false),
                    CaptureDate = table.Column<DateTime>(type: "timestamp(0) with time zone", precision: 0, nullable: false),
                    Status = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false, defaultValue: "partial"),
                    FrontPhotoId = table.Column<Guid>(type: "uuid", nullable: true),
                    LeftPhotoId = table.Column<Guid>(type: "uuid", nullable: true),
                    RightPhotoId = table.Column<Guid>(type: "uuid", nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false, defaultValueSql: "NOW()"),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false, defaultValueSql: "NOW()"),
                    DeletedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_SelfieCaptures", x => x.CaptureId);
                    table.ForeignKey(
                        name: "FK_SelfieCaptures_Photos_FrontPhotoId",
                        column: x => x.FrontPhotoId,
                        principalTable: "Photos",
                        principalColumn: "PhotoId",
                        onDelete: ReferentialAction.SetNull);
                    table.ForeignKey(
                        name: "FK_SelfieCaptures_Photos_LeftPhotoId",
                        column: x => x.LeftPhotoId,
                        principalTable: "Photos",
                        principalColumn: "PhotoId",
                        onDelete: ReferentialAction.SetNull);
                    table.ForeignKey(
                        name: "FK_SelfieCaptures_Photos_RightPhotoId",
                        column: x => x.RightPhotoId,
                        principalTable: "Photos",
                        principalColumn: "PhotoId",
                        onDelete: ReferentialAction.SetNull);
                    table.ForeignKey(
                        name: "FK_SelfieCaptures_Users_UserId",
                        column: x => x.UserId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_PhotoMetadata_Brightness",
                table: "PhotoMetadatas",
                column: "Brightness");

            migrationBuilder.CreateIndex(
                name: "IX_PhotoMetadata_FaceDetectionConfidence",
                table: "PhotoMetadatas",
                column: "FaceDetectionConfidence");

            migrationBuilder.CreateIndex(
                name: "UX_PhotoMetadata_PhotoId",
                table: "PhotoMetadatas",
                column: "PhotoId",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_Photo_UserId_CaptureDate",
                table: "Photos",
                columns: new[] { "UserId", "CaptureDate" },
                descending: new[] { false, true },
                filter: "\"DeletedAt\" IS NULL");

            migrationBuilder.CreateIndex(
                name: "IX_Photo_ViewType",
                table: "Photos",
                column: "ViewType",
                filter: "\"DeletedAt\" IS NULL");

            migrationBuilder.CreateIndex(
                name: "IX_Photos_MetadataId",
                table: "Photos",
                column: "MetadataId",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_Photos_SelfieCaptures_CaptureId",
                table: "Photos",
                column: "SelfieCaptures_CaptureId");

            migrationBuilder.CreateIndex(
                name: "UX_Photo_FilePath",
                table: "Photos",
                column: "FilePath",
                unique: true,
                filter: "\"DeletedAt\" IS NULL");

            migrationBuilder.CreateIndex(
                name: "IX_SelfieCapture_CaptureDate",
                table: "SelfieCaptures",
                column: "CaptureDate",
                filter: "\"DeletedAt\" IS NULL");

            migrationBuilder.CreateIndex(
                name: "IX_SelfieCapture_UserId",
                table: "SelfieCaptures",
                column: "UserId",
                filter: "\"DeletedAt\" IS NULL");

            migrationBuilder.CreateIndex(
                name: "IX_SelfieCaptures_FrontPhotoId",
                table: "SelfieCaptures",
                column: "FrontPhotoId",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_SelfieCaptures_LeftPhotoId",
                table: "SelfieCaptures",
                column: "LeftPhotoId",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_SelfieCaptures_RightPhotoId",
                table: "SelfieCaptures",
                column: "RightPhotoId",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "UX_SelfieCapture_User_Date",
                table: "SelfieCaptures",
                columns: new[] { "UserId", "CaptureDate" },
                unique: true,
                filter: "\"DeletedAt\" IS NULL");

            migrationBuilder.AddForeignKey(
                name: "FK_Photos_SelfieCaptures_SelfieCaptures_CaptureId",
                table: "Photos",
                column: "SelfieCaptures_CaptureId",
                principalTable: "SelfieCaptures",
                principalColumn: "CaptureId",
                onDelete: ReferentialAction.SetNull);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_Photos_PhotoMetadatas_MetadataId",
                table: "Photos");

            migrationBuilder.DropForeignKey(
                name: "FK_Photos_SelfieCaptures_SelfieCaptures_CaptureId",
                table: "Photos");

            migrationBuilder.DropTable(
                name: "PhotoMetadatas");

            migrationBuilder.DropTable(
                name: "SelfieCaptures");

            migrationBuilder.DropTable(
                name: "Photos");

            migrationBuilder.DropColumn(
                name: "CurrentStorageUsed",
                table: "Users");

            migrationBuilder.DropColumn(
                name: "StandardStorageQuota",
                table: "Users");

            migrationBuilder.AlterColumn<DateTime>(
                name: "CreatedAt",
                table: "AnalysisResults",
                type: "timestamp with time zone",
                nullable: false,
                defaultValueSql: "GETUTCDATE()",
                oldClrType: typeof(DateTime),
                oldType: "timestamp with time zone",
                oldDefaultValueSql: "NOW()");
        }
    }
}
