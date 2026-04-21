using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace SkinProgress.Migrations
{
    /// <inheritdoc />
    public partial class AddEmailAuthExpansion : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "UserEmailConfirmationTokens",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    UserId = table.Column<Guid>(type: "uuid", nullable: false),
                    Token = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    ExpiresAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_UserEmailConfirmationTokens", x => x.Id);
                    table.ForeignKey(
                        name: "FK_UserEmailConfirmationTokens_Users_UserId",
                        column: x => x.UserId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_UserEmailConfirmationTokens_ExpiresAt",
                table: "UserEmailConfirmationTokens",
                column: "ExpiresAt");

            migrationBuilder.CreateIndex(
                name: "IX_UserEmailConfirmationTokens_Token",
                table: "UserEmailConfirmationTokens",
                column: "Token",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_UserEmailConfirmationTokens_UserId",
                table: "UserEmailConfirmationTokens",
                column: "UserId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "UserEmailConfirmationTokens");
        }
    }
}
