namespace StbLab.Api.Exceptions;

/// <summary>A key name the protocol does not define. 400 — retrying unchanged fails identically.</summary>
public sealed class UnknownKeyException : StbException
{
    public UnknownKeyException(string suppliedKey, IReadOnlyList<string> suggestions)
        : base(BuildMessage(suppliedKey, suggestions), StatusCodes.Status400BadRequest, "Unknown key")
    {
        SuppliedKey = suppliedKey;
        Suggestions = suggestions;
    }

    public string SuppliedKey { get; }

    /// <summary>Closest known names, or empty when nothing was close enough.</summary>
    public IReadOnlyList<string> Suggestions { get; }

    // Near-misses are the common case, so name the nearest few rather than dumping all 305.
    private static string BuildMessage(string suppliedKey, IReadOnlyList<string> suggestions) =>
        suggestions.Count == 0
            ? $"'{suppliedKey}' is not a known remote key. GET /api/v1/remote/keys for the full list."
            : $"'{suppliedKey}' is not a known remote key. Did you mean {string.Join(", ", suggestions)}?";
}
