namespace StbLab.Api.DTOs.Remote;

/// <summary>Identity the device announces during the handshake.</summary>
public sealed record DeviceResponse(string Manufacturer, string Model, string SoftwareVersion);
