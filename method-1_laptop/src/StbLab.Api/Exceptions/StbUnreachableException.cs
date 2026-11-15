namespace StbLab.Api.Exceptions;

/// <summary>Paired, but no live session right now — the TV is off, asleep, off the network, or already
/// holding a session for another remote. Transient: the connection loop redials every few seconds.</summary>
public sealed class StbUnreachableException : StbException
{
    public StbUnreachableException(string host)
        : base(
            $"No live session with the device at {host}. It may be off, asleep, or already " +
            "connected to another remote.",
            StatusCodes.Status503ServiceUnavailable,
            "Device not connected")
    {
    }

    /// <summary>Wraps a transport failure that happened while talking to a connected device.</summary>
    public StbUnreachableException(string message, Exception innerException)
        : base(message, StatusCodes.Status503ServiceUnavailable, "Device not connected", innerException)
    {
    }
}
