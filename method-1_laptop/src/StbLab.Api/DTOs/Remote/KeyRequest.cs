using System.ComponentModel.DataAnnotations;

namespace StbLab.Api.DTOs.Remote;

/// <summary>Request body for <c>POST /api/v1/remote/key</c>.</summary>
/// <remarks>
/// A class rather than a record because MVC validates PROPERTIES, and a positional record's parameters
/// are only incidentally properties — attribute placement there silently depends on the attribute's own
/// AttributeTargets. Requests are validated; responses are not, so those stay records.
/// Properties are nullable so "absent" and "empty" both reach [Required] instead of a
/// NullReferenceException.
/// </remarks>
public sealed class KeyRequest
{
    /// <summary>Key name. Matched case- and separator-insensitively, so <c>dpad up</c> resolves.</summary>
    [Required(AllowEmptyStrings = false, ErrorMessage = "A key name is required.")]
    [StringLength(64, ErrorMessage = "A key name is at most 64 characters.")]
    public string? Key { get; set; }

    /// <summary><c>SHORT</c> (default), <c>START_LONG</c> or <c>END_LONG</c>.</summary>
    public string? Direction { get; set; }
}
