namespace StbLab.Api.DTOs.Remote;

/// <summary>Volume as reported by the device.</summary>
/// <remarks>
/// <c>Max</c> is 0 when unreported. The device sends its real maximum (25 on the Xstream box) once at
/// handshake, so a UI that assumes 100 draws a wrong bar for every real level.
/// </remarks>
public sealed record VolumeResponse(int Level, int Max, bool Muted);
