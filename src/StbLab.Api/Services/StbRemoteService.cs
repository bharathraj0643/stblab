using System.Text;
using StbLab.Api.DTOs.Diagnostics;
using StbLab.Api.DTOs.Remote;
using StbLab.Api.Exceptions;
using StbLab.Protocol;
using StbLab.Protocol.Remote;

namespace StbLab.Api.Services;

/// <summary>
/// Translates HTTP-shaped requests into protocol operations against the live session.
/// </summary>
/// <remarks>
/// This is where the two jobs the controllers must not do live: resolving a caller's loose key name
/// into a protocol key, and deciding which failure a broken socket represents. Both need the protocol
/// types, and neither is a routing concern.
/// </remarks>
internal sealed class StbRemoteService(StbConnection connection) : IStbRemoteService
{
    /// <summary>How many near-miss key names to suggest when a name does not resolve.</summary>
    private const int MaxSuggestions = 3;

    /// <summary>Largest edit distance still worth suggesting; beyond this the "match" is noise.</summary>
    private const int MaxSuggestionDistance = 4;

    public StateResponse GetState()
    {
        // Deliberately not RequireClient(): "disconnected" is a legitimate answer here, not a failure.
        RemoteSnapshot snapshot = connection.CertificateFailed || !HasClient()
            ? new RemoteSnapshot(false, null, null, null, null, RemoteFeature.None)
            : connection.RequireClient().Snapshot();

        return new StateResponse(
            snapshot.Connected,
            snapshot.IsOn,
            snapshot.CurrentApp,
            snapshot.Volume is null
                ? null
                : new VolumeResponse(snapshot.Volume.Level, snapshot.Volume.Max, snapshot.Volume.Muted),
            snapshot.Device is null
                ? null
                : new DeviceResponse(snapshot.Device.Manufacturer, snapshot.Device.Model, snapshot.Device.SoftwareVersion),
            FeatureNames(snapshot.Features));
    }

    public HealthResponse GetHealth() =>
        connection.CertificateFailed
            ? new HealthResponse("degraded", false, "No client certificate. Run the CLI 'pair' command first.")
            : HasClient()
                ? new HealthResponse("ok", true, null)
                : new HealthResponse("degraded", false, "No live session with the device.");

    public IReadOnlyList<string> GetKeyNames() => KeyCodes.Names;

    public async Task<KeyAcknowledgment> SendKeyAsync(KeyRequest request, CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();

        string suppliedKey = request.Key ?? string.Empty;

        if (!KeyCodes.TryResolve(suppliedKey, out RemoteKeyCode keyCode))
        {
            throw new UnknownKeyException(suppliedKey, SuggestKeys(suppliedKey));
        }

        if (!Directions.TryParse(request.Direction, out KeyDirection direction))
        {
            throw new UnknownDirectionException(request.Direction!);
        }

        RemoteClient client = connection.RequireClient();

        try
        {
            await client.SendKeyAsync(keyCode, direction);
        }
        catch (Exception ex) when (ex is not StbException)
        {
            // The socket died between RequireClient() and here. Surfacing it as 503 keeps the caller's
            // "try again" decision the same as for a disconnected device.
            throw new StbUnreachableException($"Could not send {KeyCodes.NameOf(keyCode)}: {ex.Message}", ex);
        }

        return new KeyAcknowledgment(KeyCodes.NameOf(keyCode), direction.ToString().ToUpperInvariant());
    }

    public async Task<TextAcknowledgment> SendTextAsync(TextRequest request, CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();

        string text = request.Text ?? string.Empty;
        RemoteClient client = connection.RequireClient();

        try
        {
            await client.SendTextAsync(text);
        }
        catch (Exception ex) when (ex is not StbException)
        {
            throw new StbUnreachableException($"Could not send text: {ex.Message}", ex);
        }

        return new TextAcknowledgment(text, text.Length);
    }

    public async Task<LaunchAcknowledgment> LaunchAsync(LaunchRequest request, CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();

        string app = request.App ?? string.Empty;
        RemoteClient client = connection.RequireClient();

        try
        {
            await client.LaunchAppAsync(app);
        }
        catch (Exception ex) when (ex is not StbException)
        {
            throw new StbUnreachableException($"Could not launch '{app}': {ex.Message}", ex);
        }

        return new LaunchAcknowledgment(app);
    }

    public async Task<TuneAcknowledgment> TuneAsync(TuneRequest request, CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();

        RemoteClient client = connection.RequireClient();

        try
        {
            // 1. Send TV key to bring Live TV into foreground
            await client.SendKeyAsync(RemoteKeyCode.KeycodeTv);

            // 2. Wait 3 seconds for Live TV to open and be ready to receive input
            await Task.Delay(3000, cancellationToken);

            // 3. Send redirect number as text input or sequential numeric keys
            string digits = request.RedirectNumber.ToString();
            try
            {
                await client.SendTextAsync(digits);
            }
            catch
            {
                // Fallback to individual numeric key codes if IME is not active
                foreach (char ch in digits)
                {
                    if (KeyCodes.TryResolve($"NUM_{ch}", out RemoteKeyCode digitCode) ||
                        KeyCodes.TryResolve($"{ch}", out digitCode))
                    {
                        await client.SendKeyAsync(digitCode);
                        await Task.Delay(150, cancellationToken);
                    }
                }
            }
        }
        catch (Exception ex) when (ex is not StbException)
        {
            throw new StbUnreachableException($"Could not tune channel {request.RedirectNumber}: {ex.Message}", ex);
        }

        return new TuneAcknowledgment(request.RedirectNumber, request.ChannelName);
    }

    private bool HasClient() => connection.CertificateFailed == false && ClientIsLive();

    private bool ClientIsLive()
    {
        try
        {
            return connection.RequireClient().IsConnected;
        }
        catch (StbException)
        {
            return false;
        }
    }

    private static IReadOnlyList<string> FeatureNames(RemoteFeature features)
    {
        List<string> names = [];

        foreach (RemoteFeature feature in Enum.GetValues<RemoteFeature>())
        {
            // Skip None, and skip Default because it is a composite of the others and would appear as
            // a bogus extra entry rather than as a feature the device agreed to.
            if (feature is RemoteFeature.None or RemoteFeature.Default)
            {
                continue;
            }

            if (features.HasFlag(feature))
            {
                names.Add(feature.ToString().ToUpperInvariant());
            }
        }

        return names;
    }

    /// <summary>
    /// Ranks known key names by how close they are to what the caller typed, so a 400 can name the one
    /// character that was wrong instead of listing 305 valid options.
    /// </summary>
    private static IReadOnlyList<string> SuggestKeys(string suppliedKey)
    {
        string target = Normalise(suppliedKey);
        List<(string Name, int Distance)> scored = [];

        foreach (string name in KeyCodes.Names)
        {
            int distance = EditDistance(target, Normalise(name));

            if (distance <= MaxSuggestionDistance)
            {
                scored.Add((name, distance));
            }
        }

        return scored
            .OrderBy(candidate => candidate.Distance)
            .ThenBy(candidate => candidate.Name, StringComparer.Ordinal)
            .Take(MaxSuggestions)
            .Select(candidate => candidate.Name)
            .ToList();
    }

    /// <summary>
    /// Folds a key name to a comparison form: letters and digits only, upper-cased, with the
    /// <c>KEYCODE_</c> prefix dropped. This mirrors how KeyCodes resolves names, so the suggestions
    /// stay consistent with what would actually have worked.
    /// </summary>
    private static string Normalise(string value)
    {
        StringBuilder builder = new(value.Length);

        foreach (char character in value)
        {
            if (char.IsLetterOrDigit(character))
            {
                builder.Append(char.ToUpperInvariant(character));
            }
        }

        string compact = builder.ToString();

        return compact.StartsWith("KEYCODE", StringComparison.Ordinal)
            ? compact["KEYCODE".Length..]
            : compact;
    }

    /// <summary>Levenshtein distance — the number of single-character edits between two strings.</summary>
    private static int EditDistance(string left, string right)
    {
        if (left.Length == 0)
        {
            return right.Length;
        }

        if (right.Length == 0)
        {
            return left.Length;
        }

        int[] previous = new int[right.Length + 1];
        int[] current = new int[right.Length + 1];

        for (int column = 0; column <= right.Length; column++)
        {
            previous[column] = column;
        }

        for (int row = 1; row <= left.Length; row++)
        {
            current[0] = row;

            for (int column = 1; column <= right.Length; column++)
            {
                int substitutionCost = left[row - 1] == right[column - 1] ? 0 : 1;

                current[column] = Math.Min(
                    Math.Min(current[column - 1] + 1, previous[column] + 1),
                    previous[column - 1] + substitutionCost);
            }

            (previous, current) = (current, previous);
        }

        return previous[right.Length];
    }
}
