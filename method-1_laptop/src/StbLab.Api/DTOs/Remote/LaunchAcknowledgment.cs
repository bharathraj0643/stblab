namespace StbLab.Api.DTOs.Remote;

/// <summary>Confirms a launch intent was sent. Fire-and-forget: the device does not reply whether the
/// package exists or started. Poll <c>state</c> and watch <c>currentApp</c> to see what happened.</summary>
public sealed record LaunchAcknowledgment(string App);
