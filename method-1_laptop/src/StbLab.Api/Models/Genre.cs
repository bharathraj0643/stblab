namespace StbLab.Api.Models;

public sealed record Genre(
    int Id,
    string Name,
    int SortOrder,
    DateTime CreatedAt,
    DateTime UpdatedAt,
    IReadOnlyList<Channel> Channels);

