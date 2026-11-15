using System.ComponentModel.DataAnnotations;

namespace StbLab.Api.DTOs.Remote;

/// <summary>Request body for <c>POST /api/v1/remote/launch</c>.</summary>
/// <remarks>Accepts a deep link, package name, or TV tuner alias (e.g. xstream, com.airtel.tv).</remarks>
public sealed class LaunchRequest
{
    [Required(AllowEmptyStrings = false, ErrorMessage = "An app package or link is required.")]
    [StringLength(512, ErrorMessage = "An app package or link is at most 512 characters.")]
    public string? App { get; set; }
}
