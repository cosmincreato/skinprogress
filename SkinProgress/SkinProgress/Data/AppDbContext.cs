using Microsoft.EntityFrameworkCore;
using SkinProgress.Models.Entities;

namespace SkinProgress.Data;

public class AppDbContext : DbContext
{
    public AppDbContext(DbContextOptions<AppDbContext> options) : base(options) { }

    public DbSet<User> Users { get; set; }
    public DbSet<UserPreferences> UserPreferences { get; set; }
    public DbSet<AuthToken> AuthTokens { get; set; }
    public DbSet<AuditLog> AuditLogs { get; set; }
    public DbSet<UserEmailConfirmationToken> UserEmailConfirmationTokens { get; set; }

    /// <summary>
    /// AnalysisResults table: Stores CLIP analysis output for each selfie.
    /// Indexed on (UserId, Timestamp DESC) for fast date-range queries.
    /// </summary>
    public DbSet<AnalysisResult> AnalysisResults { get; set; }

    /// <summary>
    /// Photos table: Stores metadata for captured selfie images (front, left, right views).
    /// </summary>
    public DbSet<Photo> Photos { get; set; }

    /// <summary>
    /// PhotoMetadata table: Stores EXIF data, face detection results, and compression metrics.
    /// </summary>
    public DbSet<PhotoMetadata> PhotoMetadatas { get; set; }

    /// <summary>
    /// SelfieCaptures table: Groups up to 3 photos (front, left, right) into daily sessions.
    /// </summary>
    public DbSet<SelfieCapture> SelfieCaptures { get; set; }

    // --- New entities ---
    public DbSet<PasswordResetToken> PasswordResetTokens { get; set; }
    public DbSet<HabitDefinition> HabitDefinitions { get; set; }
    public DbSet<HabitCompletion> HabitCompletions { get; set; }
    public DbSet<HabitStreak> HabitStreaks { get; set; }
    public DbSet<Badge> Badges { get; set; }
    public DbSet<UserBadge> UserBadges { get; set; }
    public DbSet<Mission> Missions { get; set; }
    public DbSet<UserMission> UserMissions { get; set; }
    public DbSet<Notification> Notifications { get; set; }
    public DbSet<NotificationPreferences> NotificationPreferences { get; set; }
    public DbSet<ChatSession> ChatSessions { get; set; }
    public DbSet<ChatMessage> ChatMessages { get; set; }
    public DbSet<Ingredient> Ingredients { get; set; }
    public DbSet<Product> Products { get; set; }
    public DbSet<SkinTrend> SkinTrends { get; set; }
    public DbSet<GeneratedReport> GeneratedReports { get; set; }
    public DbSet<GdprRequest> GdprRequests { get; set; }
    public DbSet<AsyncJob> AsyncJobs { get; set; }

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);

        // -----------------------------------------------------------------------
        // AnalysisResult
        // -----------------------------------------------------------------------
        modelBuilder.Entity<AnalysisResult>(entity =>
        {
            entity.HasKey(ar => ar.Id);

            entity.HasIndex(ar => new { ar.UserId, ar.Timestamp })
                .IsDescending(false, true)
                .HasName("IX_AnalysisResults_UserId_Timestamp");

            entity.HasIndex(ar => ar.SelfieId)
                .HasName("IX_AnalysisResults_SelfieId");

            entity.Property(ar => ar.UserId).IsRequired().HasMaxLength(128);
            entity.Property(ar => ar.Status).IsRequired().HasMaxLength(20);
            entity.Property(ar => ar.ErrorMessage).HasMaxLength(500);
            entity.Property(ar => ar.CreatedAt).HasDefaultValueSql("NOW()");
            entity.Property(ar => ar.Timestamp).IsRequired();
        });

        // -----------------------------------------------------------------------
        // PhotoMetadata
        // -----------------------------------------------------------------------
        modelBuilder.Entity<PhotoMetadata>(entity =>
        {
            entity.HasKey(pm => pm.MetadataId);

            entity.HasOne(pm => pm.Photo)
                .WithOne(p => p.Metadata)
                .HasForeignKey<PhotoMetadata>(pm => pm.PhotoId)
                .OnDelete(DeleteBehavior.Cascade);

            entity.HasIndex(pm => pm.PhotoId)
                .IsUnique()
                .HasName("UX_PhotoMetadata_PhotoId");

            entity.HasIndex(pm => pm.Brightness)
                .HasName("IX_PhotoMetadata_Brightness");

            entity.HasIndex(pm => pm.FaceDetectionConfidence)
                .HasName("IX_PhotoMetadata_FaceDetectionConfidence");

            entity.Property(pm => pm.Orientation).HasMaxLength(20).HasDefaultValue("normal");
            entity.Property(pm => pm.DeviceModel).HasMaxLength(100);
            entity.Property(pm => pm.ExifRaw).HasColumnType("text");
            entity.Property(pm => pm.Brightness).HasPrecision(3, 1);
            entity.Property(pm => pm.FaceDetectionConfidence).HasPrecision(4, 3);
            entity.Property(pm => pm.CreatedAt).HasDefaultValueSql("NOW()");
        });

        // -----------------------------------------------------------------------
        // Photo
        // -----------------------------------------------------------------------
        modelBuilder.Entity<Photo>(entity =>
        {
            entity.HasKey(p => p.PhotoId);

            entity.HasOne(p => p.User)
                .WithMany(u => u.Photos)
                .HasForeignKey(p => p.UserId)
                .OnDelete(DeleteBehavior.Restrict);

            entity.HasOne(p => p.SelfieCapture)
                .WithMany()
                .HasForeignKey(p => p.SelfieCaptures_CaptureId)
                .OnDelete(DeleteBehavior.SetNull);

            entity.HasOne(p => p.Metadata)
                .WithOne(pm => pm.Photo)
                .HasForeignKey<Photo>(p => p.MetadataId)
                .OnDelete(DeleteBehavior.Cascade);

            entity.HasIndex(p => new { p.UserId, p.CaptureDate })
                .IsDescending(false, true)
                .HasName("IX_Photo_UserId_CaptureDate")
                .HasFilter("[DeletedAt] IS NULL");

            entity.HasIndex(p => p.ViewType)
                .HasName("IX_Photo_ViewType")
                .HasFilter("[DeletedAt] IS NULL");

            entity.HasIndex(p => p.FilePath)
                .IsUnique()
                .HasName("UX_Photo_FilePath")
                .HasFilter("[DeletedAt] IS NULL");

            entity.Property(p => p.ViewType).HasMaxLength(20).IsRequired();
            entity.Property(p => p.FilePath).HasMaxLength(500).IsRequired();
            entity.Property(p => p.CaptureDate).HasPrecision(0);
            entity.Property(p => p.CreatedAt).HasDefaultValueSql("NOW()");
            entity.Property(p => p.UpdatedAt).HasDefaultValueSql("NOW()");
        });

        // -----------------------------------------------------------------------
        // SelfieCapture
        // -----------------------------------------------------------------------
        modelBuilder.Entity<SelfieCapture>(entity =>
        {
            entity.HasKey(sc => sc.CaptureId);

            entity.HasOne(sc => sc.User)
                .WithMany(u => u.SelfieCaptures)
                .HasForeignKey(sc => sc.UserId)
                .OnDelete(DeleteBehavior.Restrict);

            entity.HasOne(sc => sc.FrontPhoto)
                .WithOne()
                .HasForeignKey<SelfieCapture>(sc => sc.FrontPhotoId)
                .OnDelete(DeleteBehavior.SetNull);

            entity.HasOne(sc => sc.LeftPhoto)
                .WithOne()
                .HasForeignKey<SelfieCapture>(sc => sc.LeftPhotoId)
                .OnDelete(DeleteBehavior.SetNull);

            entity.HasOne(sc => sc.RightPhoto)
                .WithOne()
                .HasForeignKey<SelfieCapture>(sc => sc.RightPhotoId)
                .OnDelete(DeleteBehavior.SetNull);

            entity.HasIndex(sc => new { sc.UserId, sc.CaptureDate })
                .IsUnique()
                .HasName("UX_SelfieCapture_User_Date")
                .HasFilter("[DeletedAt] IS NULL");

            entity.HasIndex(sc => sc.UserId)
                .HasName("IX_SelfieCapture_UserId")
                .HasFilter("[DeletedAt] IS NULL");

            entity.HasIndex(sc => sc.CaptureDate)
                .HasName("IX_SelfieCapture_CaptureDate")
                .HasFilter("[DeletedAt] IS NULL");

            entity.Property(sc => sc.Status).HasMaxLength(20).HasDefaultValue("partial");
            entity.Property(sc => sc.CaptureDate).HasPrecision(0);
            entity.Property(sc => sc.CreatedAt).HasDefaultValueSql("NOW()");
            entity.Property(sc => sc.UpdatedAt).HasDefaultValueSql("NOW()");
        });

        // -----------------------------------------------------------------------
        // PasswordResetToken
        // -----------------------------------------------------------------------
        modelBuilder.Entity<PasswordResetToken>(entity =>
        {
            entity.HasKey(t => t.Id);

            entity.HasOne(t => t.User)
                .WithMany()
                .HasForeignKey(t => t.UserId)
                .OnDelete(DeleteBehavior.Cascade);

            entity.HasIndex(t => t.UserId)
                .HasName("IX_PasswordResetTokens_UserId");

            entity.Property(t => t.TokenHash).IsRequired().HasMaxLength(128);
        });

        // -----------------------------------------------------------------------
        // HabitDefinition  (+ seed data)
        // -----------------------------------------------------------------------
        modelBuilder.Entity<HabitDefinition>(entity =>
        {
            entity.HasKey(h => h.Id);
            entity.Property(h => h.Name).IsRequired().HasMaxLength(100);
            entity.Property(h => h.Description).HasMaxLength(500);

            // Seed default habits
            entity.HasData(
                new HabitDefinition
                {
                    Id = new Guid("11111111-0000-0000-0000-000000000001"),
                    Name = "Morning Cleansing",
                    Description = "Cleanse your face in the morning",
                    IsDefault = true,
                    CreatedAt = new DateTime(2026, 1, 1, 0, 0, 0, DateTimeKind.Utc)
                },
                new HabitDefinition
                {
                    Id = new Guid("11111111-0000-0000-0000-000000000002"),
                    Name = "Moisturizing",
                    Description = "Apply moisturizer to your face",
                    IsDefault = true,
                    CreatedAt = new DateTime(2026, 1, 1, 0, 0, 0, DateTimeKind.Utc)
                },
                new HabitDefinition
                {
                    Id = new Guid("11111111-0000-0000-0000-000000000003"),
                    Name = "SPF Application",
                    Description = "Apply SPF sunscreen before going outside",
                    IsDefault = true,
                    CreatedAt = new DateTime(2026, 1, 1, 0, 0, 0, DateTimeKind.Utc)
                }
            );
        });

        // -----------------------------------------------------------------------
        // HabitCompletion
        // -----------------------------------------------------------------------
        modelBuilder.Entity<HabitCompletion>(entity =>
        {
            entity.HasKey(hc => hc.Id);

            entity.HasOne(hc => hc.User)
                .WithMany()
                .HasForeignKey(hc => hc.UserId)
                .OnDelete(DeleteBehavior.Cascade);

            entity.HasOne(hc => hc.HabitDefinition)
                .WithMany()
                .HasForeignKey(hc => hc.HabitDefinitionId)
                .OnDelete(DeleteBehavior.Cascade);

            // Index for daily checklist queries
            entity.HasIndex(hc => new { hc.UserId, hc.Date })
                .HasName("IX_HabitCompletions_UserId_Date");
        });

        // -----------------------------------------------------------------------
        // HabitStreak
        // -----------------------------------------------------------------------
        modelBuilder.Entity<HabitStreak>(entity =>
        {
            entity.HasKey(hs => hs.Id);

            entity.HasIndex(hs => new { hs.UserId, hs.HabitDefinitionId })
                .IsUnique()
                .HasName("UX_HabitStreaks_UserId_HabitDefinitionId");
        });

        // -----------------------------------------------------------------------
        // Badge  (+ seed data)
        // -----------------------------------------------------------------------
        modelBuilder.Entity<Badge>(entity =>
        {
            entity.HasKey(b => b.Id);
            entity.Property(b => b.Code).IsRequired().HasMaxLength(50);
            entity.Property(b => b.Name).IsRequired().HasMaxLength(100);
            entity.Property(b => b.Description).HasMaxLength(500);
            entity.Property(b => b.IconUrl).HasMaxLength(500);

            entity.HasIndex(b => b.Code)
                .IsUnique()
                .HasName("UX_Badges_Code");

            // Seed default badges
            entity.HasData(
                new Badge
                {
                    Id = new Guid("22222222-0000-0000-0000-000000000001"),
                    Code = "STREAK_7",
                    Name = "7-Day Streak",
                    Description = "Completed a habit for 7 consecutive days",
                    IconUrl = "/icons/badges/streak-7.svg"
                },
                new Badge
                {
                    Id = new Guid("22222222-0000-0000-0000-000000000002"),
                    Code = "STREAK_30",
                    Name = "30-Day Streak",
                    Description = "Completed a habit for 30 consecutive days",
                    IconUrl = "/icons/badges/streak-30.svg"
                },
                new Badge
                {
                    Id = new Guid("22222222-0000-0000-0000-000000000003"),
                    Code = "STREAK_90",
                    Name = "90-Day Streak",
                    Description = "Completed a habit for 90 consecutive days",
                    IconUrl = "/icons/badges/streak-90.svg"
                },
                new Badge
                {
                    Id = new Guid("22222222-0000-0000-0000-000000000004"),
                    Code = "PROGRESS_20",
                    Name = "20% Progress",
                    Description = "Improved your Progress Score by 20% or more",
                    IconUrl = "/icons/badges/progress-20.svg"
                }
            );
        });

        // -----------------------------------------------------------------------
        // UserBadge
        // -----------------------------------------------------------------------
        modelBuilder.Entity<UserBadge>(entity =>
        {
            entity.HasKey(ub => ub.Id);

            entity.HasOne(ub => ub.User)
                .WithMany()
                .HasForeignKey(ub => ub.UserId)
                .OnDelete(DeleteBehavior.Cascade);

            entity.HasOne(ub => ub.Badge)
                .WithMany()
                .HasForeignKey(ub => ub.BadgeId)
                .OnDelete(DeleteBehavior.Cascade);

            entity.HasIndex(ub => new { ub.UserId, ub.BadgeId })
                .IsUnique()
                .HasName("UX_UserBadges_UserId_BadgeId");
        });

        // -----------------------------------------------------------------------
        // Mission
        // -----------------------------------------------------------------------
        modelBuilder.Entity<Mission>(entity =>
        {
            entity.HasKey(m => m.Id);
            entity.Property(m => m.Type).IsRequired().HasMaxLength(50);
            entity.Property(m => m.Title).IsRequired().HasMaxLength(200);
            entity.Property(m => m.Description).HasMaxLength(500);

            entity.HasOne(m => m.RewardBadge)
                .WithMany()
                .HasForeignKey(m => m.RewardBadgeId)
                .OnDelete(DeleteBehavior.SetNull);
        });

        // -----------------------------------------------------------------------
        // UserMission
        // -----------------------------------------------------------------------
        modelBuilder.Entity<UserMission>(entity =>
        {
            entity.HasKey(um => um.Id);

            entity.HasOne(um => um.User)
                .WithMany()
                .HasForeignKey(um => um.UserId)
                .OnDelete(DeleteBehavior.Cascade);

            entity.HasOne(um => um.Mission)
                .WithMany()
                .HasForeignKey(um => um.MissionId)
                .OnDelete(DeleteBehavior.Cascade);

            entity.HasIndex(um => new { um.UserId, um.WeekStart })
                .HasDatabaseName("IX_UserMissions_UserId_WeekStart");

            entity.Property(um => um.Status).IsRequired().HasMaxLength(20);
        });

        // -----------------------------------------------------------------------
        // Notification
        // -----------------------------------------------------------------------
        modelBuilder.Entity<Notification>(entity =>
        {
            entity.HasKey(n => n.Id);

            entity.HasOne(n => n.User)
                .WithMany()
                .HasForeignKey(n => n.UserId)
                .OnDelete(DeleteBehavior.Cascade);

            // Index: (UserId, IsRead, CreatedAt DESC)
            entity.HasIndex(n => new { n.UserId, n.IsRead, n.CreatedAt })
                .IsDescending(false, false, true)
                .HasDatabaseName("IX_Notifications_UserId_IsRead_CreatedAt");

            entity.Property(n => n.Type).IsRequired().HasMaxLength(50);
            entity.Property(n => n.Title).IsRequired().HasMaxLength(200);
            entity.Property(n => n.Body).IsRequired().HasMaxLength(1000);
        });

        // -----------------------------------------------------------------------
        // NotificationPreferences
        // -----------------------------------------------------------------------
        modelBuilder.Entity<NotificationPreferences>(entity =>
        {
            entity.HasKey(np => np.Id);

            entity.HasIndex(np => np.UserId)
                .IsUnique()
                .HasDatabaseName("UX_NotificationPreferences_UserId");
        });

        // -----------------------------------------------------------------------
        // ChatSession
        // -----------------------------------------------------------------------
        modelBuilder.Entity<ChatSession>(entity =>
        {
            entity.HasKey(cs => cs.Id);

            entity.HasOne(cs => cs.User)
                .WithMany()
                .HasForeignKey(cs => cs.UserId)
                .OnDelete(DeleteBehavior.Cascade);

            entity.HasMany(cs => cs.Messages)
                .WithOne(cm => cm.Session)
                .HasForeignKey(cm => cm.SessionId)
                .OnDelete(DeleteBehavior.Cascade);

            entity.HasIndex(cs => cs.UserId)
                .HasDatabaseName("IX_ChatSessions_UserId");
        });

        // -----------------------------------------------------------------------
        // ChatMessage
        // -----------------------------------------------------------------------
        modelBuilder.Entity<ChatMessage>(entity =>
        {
            entity.HasKey(cm => cm.Id);
            entity.Property(cm => cm.Role).IsRequired().HasMaxLength(20);
            entity.Property(cm => cm.Content).IsRequired().HasColumnType("text");
        });

        // -----------------------------------------------------------------------
        // Ingredient
        // -----------------------------------------------------------------------
        modelBuilder.Entity<Ingredient>(entity =>
        {
            entity.HasKey(i => i.Id);
            entity.Property(i => i.Name).IsRequired().HasMaxLength(200);
        });

        // -----------------------------------------------------------------------
        // Product
        // -----------------------------------------------------------------------
        modelBuilder.Entity<Product>(entity =>
        {
            entity.HasKey(p => p.Id);
            entity.Property(p => p.Name).IsRequired().HasMaxLength(200);
            entity.Property(p => p.Brand).IsRequired().HasMaxLength(200);
        });

        // -----------------------------------------------------------------------
        // SkinTrend
        // -----------------------------------------------------------------------
        modelBuilder.Entity<SkinTrend>(entity =>
        {
            entity.HasKey(st => st.Id);

            entity.HasOne(st => st.User)
                .WithMany()
                .HasForeignKey(st => st.UserId)
                .OnDelete(DeleteBehavior.Cascade);

            entity.Property(st => st.TrendType).IsRequired().HasMaxLength(50);
            entity.Property(st => st.Zone).IsRequired().HasMaxLength(50);
            entity.Property(st => st.Description).IsRequired().HasMaxLength(1000);
            entity.Property(st => st.Metadata).HasColumnType("text");
        });

        // -----------------------------------------------------------------------
        // GeneratedReport
        // -----------------------------------------------------------------------
        modelBuilder.Entity<GeneratedReport>(entity =>
        {
            entity.HasKey(gr => gr.Id);

            entity.HasOne(gr => gr.User)
                .WithMany()
                .HasForeignKey(gr => gr.UserId)
                .OnDelete(DeleteBehavior.Cascade);

            entity.Property(gr => gr.ReportType).IsRequired().HasMaxLength(20);
            entity.Property(gr => gr.Content).IsRequired().HasColumnType("text");
        });

        // -----------------------------------------------------------------------
        // GdprRequest
        // -----------------------------------------------------------------------
        modelBuilder.Entity<GdprRequest>(entity =>
        {
            entity.HasKey(gr => gr.Id);

            entity.HasOne(gr => gr.User)
                .WithMany()
                .HasForeignKey(gr => gr.UserId)
                .OnDelete(DeleteBehavior.Cascade);

            entity.Property(gr => gr.RequestType).IsRequired().HasMaxLength(20);
            entity.Property(gr => gr.Status).IsRequired().HasMaxLength(20);
        });

        // -----------------------------------------------------------------------
        // AsyncJob
        // -----------------------------------------------------------------------
        modelBuilder.Entity<AsyncJob>(entity =>
        {
            entity.HasKey(aj => aj.Id);

            entity.HasOne(aj => aj.User)
                .WithMany()
                .HasForeignKey(aj => aj.UserId)
                .OnDelete(DeleteBehavior.Cascade);

            entity.Property(aj => aj.JobType).IsRequired().HasMaxLength(50);
            entity.Property(aj => aj.Status).IsRequired().HasMaxLength(20);
        });
    }
}
