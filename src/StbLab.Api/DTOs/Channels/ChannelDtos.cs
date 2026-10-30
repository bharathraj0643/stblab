using System.ComponentModel.DataAnnotations;

namespace StbLab.Api.DTOs.Channels;

public sealed record ChannelDto(
    int Id,
    int GenreId,
    string Name,
    int DummyNumber,
    int RedirectNumber,
    int SortOrder);

public sealed record GenreDto(
    int Id,
    string Name,
    int SortOrder,
    IReadOnlyList<ChannelDto> Channels);

public sealed class CreateGenreRequest
{
    [Required]
    [StringLength(100)]
    public string Name { get; set; } = string.Empty;

    public int SortOrder { get; set; } = 0;
}

public sealed class UpdateGenreRequest
{
    [Required]
    [StringLength(100)]
    public string Name { get; set; } = string.Empty;

    public int SortOrder { get; set; } = 0;
}

public sealed class CreateChannelRequest
{
    [Required]
    public int GenreId { get; set; }

    [Required]
    [StringLength(100)]
    public string Name { get; set; } = string.Empty;

    [Required]
    [Range(0, 9999)]
    public int DummyNumber { get; set; }

    [Required]
    [Range(0, 9999)]
    public int RedirectNumber { get; set; }

    public int SortOrder { get; set; } = 0;
}

public sealed class UpdateChannelRequest
{
    [Required]
    public int GenreId { get; set; }

    [Required]
    [StringLength(100)]
    public string Name { get; set; } = string.Empty;

    [Required]
    [Range(0, 9999)]
    public int DummyNumber { get; set; }

    [Required]
    [Range(0, 9999)]
    public int RedirectNumber { get; set; }

    public int SortOrder { get; set; } = 0;
}

public sealed class ReorderChannelsRequest
{
    [Required]
    public int GenreId { get; set; }

    [Required]
    public List<int> ChannelIds { get; set; } = [];
}

