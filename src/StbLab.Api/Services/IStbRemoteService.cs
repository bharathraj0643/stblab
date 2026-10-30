using StbLab.Api.DTOs.Diagnostics;
using StbLab.Api.DTOs.Remote;

namespace StbLab.Api.Services;

/// <summary>
/// Everything the API can do to the TV. Controllers depend on this, never on the socket.
/// </summary>
/// <remarks>
/// Implementations throw <see cref="Exceptions.StbException"/> for expected failures ("not paired",
/// "no key by that name") rather than returning null or a sentinel, so the HTTP layer never has to
/// guess what a falsy return meant.
/// </remarks>
public interface IStbRemoteService
{
    /// <summary>Current device state. Works while disconnected, reporting <c>Connected = false</c>.</summary>
    StateResponse GetState();

    /// <summary>Whether the device link is up, and why not when it isn't.</summary>
    HealthResponse GetHealth();

    /// <summary>Every key name the protocol defines, for discovery and for client-side validation.</summary>
    IReadOnlyList<string> GetKeyNames();

    /// <summary>Presses a key. Throws if the name or direction is not recognised.</summary>
    Task<KeyAcknowledgment> SendKeyAsync(KeyRequest request, CancellationToken cancellationToken);

    /// <summary>Injects text into the device's focused field.</summary>
    Task<TextAcknowledgment> SendTextAsync(TextRequest request, CancellationToken cancellationToken);

    /// <summary>Opens an app by package name or deep link.</summary>
    Task<LaunchAcknowledgment> LaunchAsync(LaunchRequest request, CancellationToken cancellationToken);

    /// <summary>Tunes a channel by bringing Live TV to the foreground and sending the redirect number.</summary>
    Task<TuneAcknowledgment> TuneAsync(TuneRequest request, CancellationToken cancellationToken);
}
