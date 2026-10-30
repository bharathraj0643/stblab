namespace StbLab.Api.Models;

public sealed record Channel(
    int Id,
    int GenreId,
    string Name,
    int DummyNumber,
    int RedirectNumber,
    int SortOrder,
    DateTime CreatedAt,
    DateTime UpdatedAt);

