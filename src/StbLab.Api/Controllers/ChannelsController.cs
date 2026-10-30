using Asp.Versioning;
using Microsoft.AspNetCore.Mvc;
using StbLab.Api.Database;
using StbLab.Api.DTOs.Channels;
using StbLab.Api.Models;

namespace StbLab.Api.Controllers;

[ApiController]
[ApiVersion("1.0")]
[Route("api/v{version:apiVersion}/channels")]
[Produces("application/json")]
public sealed class ChannelsController(ChannelRepository repo) : ControllerBase
{
    [HttpPost]
    [ProducesResponseType(typeof(ChannelDto), StatusCodes.Status201Created)]
    public async Task<ActionResult<ChannelDto>> CreateChannel(CreateChannelRequest request, CancellationToken ct)
    {
        var channel = await repo.CreateChannelAsync(
            request.GenreId, request.Name, request.DummyNumber, request.RedirectNumber, request.SortOrder, ct);
        return StatusCode(StatusCodes.Status201Created, MapChannel(channel));
    }

    [HttpPut("{id:int}")]
    [ProducesResponseType(typeof(ChannelDto), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<ActionResult<ChannelDto>> UpdateChannel(int id, UpdateChannelRequest request, CancellationToken ct)
    {
        var updated = await repo.UpdateChannelAsync(
            id, request.GenreId, request.Name, request.DummyNumber, request.RedirectNumber, request.SortOrder, ct);
        if (updated is null) return NotFound();
        return Ok(MapChannel(updated));
    }

    [HttpDelete("{id:int}")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> DeleteChannel(int id, CancellationToken ct)
    {
        bool deleted = await repo.DeleteChannelAsync(id, ct);
        if (!deleted) return NotFound();
        return NoContent();
    }

    [HttpPut("reorder")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    public async Task<IActionResult> ReorderChannels(ReorderChannelsRequest request, CancellationToken ct)
    {
        await repo.ReorderChannelsAsync(request.GenreId, request.ChannelIds, ct);
        return NoContent();
    }

    /// <summary>Searches a channel by number using Point 5 logic (dummy first, then redirect).</summary>
    [HttpGet("lookup")]
    [ProducesResponseType(typeof(ChannelDto), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<ActionResult<ChannelDto>> LookupChannel([FromQuery] int number, CancellationToken ct)
    {
        var channel = await repo.FindChannelByNumberAsync(number, ct);
        if (channel is null) return NotFound();
        return Ok(MapChannel(channel));
    }

    private static ChannelDto MapChannel(Channel c) =>
        new(c.Id, c.GenreId, c.Name, c.DummyNumber, c.RedirectNumber, c.SortOrder);
}

