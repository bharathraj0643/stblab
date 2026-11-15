using System.ComponentModel.DataAnnotations;

namespace StbLab.Api.DTOs.Remote;

/// <summary>Request body for <c>POST /api/v1/remote/text</c>.</summary>
/// <remarks>The text goes to whatever field has focus on the device; there is no way to address a
/// specific input or read back what was typed.</remarks>
public sealed class TextRequest
{
    [Required(AllowEmptyStrings = false, ErrorMessage = "Text must not be empty.")]
    [StringLength(512, ErrorMessage = "Text is at most 512 characters.")]
    public string? Text { get; set; }
}
