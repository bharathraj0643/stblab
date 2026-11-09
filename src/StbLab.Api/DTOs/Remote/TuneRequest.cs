using System.ComponentModel.DataAnnotations;

namespace StbLab.Api.DTOs.Remote;

/// <summary>Request body for <c>POST /api/v1/remote/tune</c>.</summary>
public sealed class TuneRequest
{
    [Required]
    [Range(0, 9999)]
    public int RedirectNumber { get; set; }

    public string? ChannelName { get; set; }

    /// <summary>Skips the normal tuner startup wait for channel-step auto-tuning.</summary>
    public bool FastTune { get; set; }
}

public sealed record TuneAcknowledgment(int RedirectNumber, string? ChannelName);

