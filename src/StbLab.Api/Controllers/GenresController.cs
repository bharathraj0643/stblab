using Asp.Versioning;
using Microsoft.AspNetCore.Mvc;
using StbLab.Api.Database;
using StbLab.Api.DTOs.Channels;
using StbLab.Api.Models;

namespace StbLab.Api.Controllers;

[ApiController]
[ApiVersion("1.0")]
[Route("api/v{version:apiVersion}/genres")]
[Produces("application/json")]
public sealed class GenresController(ChannelRepository repo) : ControllerBase
{
    [HttpGet]
    [ProducesResponseType(typeof(IReadOnlyList<GenreDto>), StatusCodes.Status200OK)]
    public async Task<ActionResult<IReadOnlyList<GenreDto>>> GetGenres(CancellationToken ct)
    {
        var genres = await repo.GetGenresAsync(ct);
        return Ok(genres.Select(MapGenre).ToList());
    }

    [HttpGet("{id:int}")]
    [ProducesResponseType(typeof(GenreDto), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<ActionResult<GenreDto>> GetGenre(int id, CancellationToken ct)
    {
        var genre = await repo.GetGenreByIdAsync(id, ct);
        if (genre is null) return NotFound();
        return Ok(MapGenre(genre));
    }

    [HttpPost]
    [ProducesResponseType(typeof(GenreDto), StatusCodes.Status201Created)]
    public async Task<ActionResult<GenreDto>> CreateGenre(CreateGenreRequest request, CancellationToken ct)
    {
        var genre = await repo.CreateGenreAsync(request.Name, request.SortOrder, ct);
        return StatusCode(StatusCodes.Status201Created, MapGenre(genre));
    }

    [HttpPut("{id:int}")]
    [ProducesResponseType(typeof(GenreDto), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<ActionResult<GenreDto>> UpdateGenre(int id, UpdateGenreRequest request, CancellationToken ct)
    {
        var updated = await repo.UpdateGenreAsync(id, request.Name, request.SortOrder, ct);
        if (updated is null) return NotFound();
        return Ok(MapGenre(updated));
    }

    [HttpDelete("{id:int}")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> DeleteGenre(int id, CancellationToken ct)
    {
        bool deleted = await repo.DeleteGenreAsync(id, ct);
        if (!deleted) return NotFound();
        return NoContent();
    }

    private static GenreDto MapGenre(Genre g) =>
        new(g.Id, g.Name, g.SortOrder, g.Channels.Select(MapChannel).ToList());

    private static ChannelDto MapChannel(Channel c) =>
        new(c.Id, c.GenreId, c.Name, c.DummyNumber, c.RedirectNumber, c.SortOrder);
}

