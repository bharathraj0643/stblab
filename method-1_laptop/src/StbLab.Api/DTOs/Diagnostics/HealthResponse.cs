namespace StbLab.Api.DTOs.Diagnostics;

/// <summary>Response for <c>GET /api/v1/health</c>.</summary>
/// <remarks>Reports whether the DEVICE LINK is up, not merely that the process is running — a
/// process-level "ok" is true while every remote request fails, which answers nothing useful.</remarks>
public sealed record HealthResponse(string Status, bool DeviceConnected, string? Detail);
