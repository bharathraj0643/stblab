namespace StbLab.Api.DTOs.Remote;

/// <summary>Confirms which key was sent, after the name was resolved.</summary>
/// <remarks>
/// Echoes the RESOLVED name, not the one supplied: tolerant matching means several inputs map to one
/// key, so this is the only way a client learns which one it actually hit.
/// </remarks>
public sealed record KeyAcknowledgment(string Key, string Direction);
