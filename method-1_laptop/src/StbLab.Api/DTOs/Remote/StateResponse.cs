namespace StbLab.Api.DTOs.Remote;

/// <summary>Response for <c>GET /api/v1/remote/state</c>.</summary>
/// <remarks>
/// Everything past <see cref="Connected"/> is nullable because the protocol pushes state
/// asynchronously and only on change: after a reconnect the device may have reported power but not
/// volume yet. A non-nullable volume would have to invent a value, and 0 reads as "muted" — a lie the
/// UI would then draw. Null means "the device has not said".
/// </remarks>
public sealed record StateResponse(
    bool Connected,
    bool? IsOn,
    string? CurrentApp,
    VolumeResponse? Volume,
    DeviceResponse? Device,
    IReadOnlyList<string> Features);
