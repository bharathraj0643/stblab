namespace StbLab.Api.DTOs.Remote;

/// <summary>Confirms text was written to the socket. The protocol has no acknowledgement for IME
/// injection, so this cannot claim the characters landed anywhere.</summary>
public sealed record TextAcknowledgment(string Text, int Length);
