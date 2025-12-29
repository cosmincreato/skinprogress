using Microsoft.EntityFrameworkCore;
using SkinProgress.Models.Entities;

namespace SkinProgress.Data;

public class AppDbContext : DbContext
{
    public AppDbContext(DbContextOptions<AppDbContext> options) : base(options) { }
    
    public DbSet<User> Users { get; set; }
}