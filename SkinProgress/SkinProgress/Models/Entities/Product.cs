namespace SkinProgress.Models.Entities;

public class Product
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public string Name { get; set; } = string.Empty;
    public string Brand { get; set; } = string.Empty;
    public bool IsVegan { get; set; } = false;
    public bool IsCrueltyFree { get; set; } = false;
    public bool IsFragranceFree { get; set; } = false;
    public bool IsAlcoholFree { get; set; } = false;
    public string? IngredientList { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}
