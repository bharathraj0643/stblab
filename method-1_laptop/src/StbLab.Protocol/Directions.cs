namespace StbLab.Protocol;

/// <summary>
/// Parses the direction vocabulary used by the wire protocol: <c>SHORT</c>,
/// <c>START_LONG</c> and <c>END_LONG</c>.
/// </summary>
public static class Directions
{
    /// <summary>
    /// Parses a direction name, tolerating the separators and casing people actually type.
    /// </summary>
    /// <param name="value">Direction name; <see langword="null"/> or empty means <see cref="KeyDirection.Short"/>.</param>
    public static bool TryParse(string? value, out KeyDirection direction)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            direction = KeyDirection.Short;
            return true;
        }

        direction = value.Replace("_", string.Empty, StringComparison.Ordinal).ToUpperInvariant() switch
        {
            "SHORT" => KeyDirection.Short,
            "STARTLONG" => KeyDirection.StartLong,
            "ENDLONG" => KeyDirection.EndLong,
            _ => (KeyDirection)(-1),
        };

        return direction != (KeyDirection)(-1);
    }

    /// <summary>Parses a direction name, throwing if it is not recognised.</summary>
    public static KeyDirection Parse(string? value) =>
        TryParse(value, out KeyDirection direction)
            ? direction
            : throw new ArgumentException($"Unknown key direction '{value}'.", nameof(value));
}
