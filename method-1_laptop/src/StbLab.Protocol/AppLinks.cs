namespace StbLab.Protocol;

/// <summary>
/// Resolves package names and shorthand aliases to Android TV deep links (App Links),
/// and detects TV tuner key triggers.
/// </summary>
public static class AppLinks
{
    private static readonly Dictionary<string, string> DeepLinks = new(StringComparer.OrdinalIgnoreCase)
    {
        ["com.google.android.youtube.tv"] = "https://www.youtube.com/tv",
        ["com.google.android.youtube"] = "https://www.youtube.com/tv",
        ["youtube"] = "https://www.youtube.com/tv",

        ["com.netflix.ninja"] = "https://www.netflix.com/browse",
        ["com.netflix.mediaclient"] = "https://www.netflix.com/browse",
        ["netflix"] = "https://www.netflix.com/browse",

        ["com.amazon.amazonvideo.livingroom"] = "https://app.primevideo.com/",
        ["primevideo"] = "https://app.primevideo.com/",
        ["prime"] = "https://app.primevideo.com/",

        ["in.startv.hotstar"] = "https://www.hotstar.com",
        ["hotstar"] = "https://www.hotstar.com",

        ["com.spotify.tv.android"] = "market://search?q=spotify",
        ["spotify"] = "market://search?q=spotify",

        ["com.android.vending"] = "market://details?id=com.android.vending",
        ["playstore"] = "market://details?id=com.android.vending",

        ["com.jio.media.ondemand"] = "https://www.jiocinema.com",
        ["jiocinema"] = "https://www.jiocinema.com",

        ["com.jio.tvapp"] = "https://www.jiotv.com",
        ["jiotv"] = "https://www.jiotv.com",

        ["com.zee5.androiddt"] = "https://www.zee5.com",
        ["zee5"] = "https://www.zee5.com",

        ["com.sonyliv"] = "https://www.sonyliv.com",
        ["sonyliv"] = "https://www.sonyliv.com",
    };

    private static readonly HashSet<string> TunerAliases = new(StringComparer.OrdinalIgnoreCase)
    {
        "com.airtel.tv",
        "xstream",
        "airtel",
        "airteltv",
        "live",
        "livetv",
        "tv",
    };

    /// <summary>
    /// Checks whether the requested target represents the live TV tuner (e.g. Airtel Xstream Live TV).
    /// </summary>
    public static bool IsTvTuner(string target) =>
        !string.IsNullOrWhiteSpace(target) && TunerAliases.Contains(target.Trim());

    /// <summary>
    /// Resolves an app identifier or URL to a valid Android TV deep link.
    /// </summary>
    public static string Resolve(string target)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(target);

        string trimmed = target.Trim();

        // If it already contains a URI scheme (e.g. https://, market://, android-app://), pass through.
        if (trimmed.Contains("://", StringComparison.Ordinal))
        {
            return trimmed;
        }

        if (DeepLinks.TryGetValue(trimmed, out string? mapped))
        {
            return mapped;
        }

        // For unrecognized package names without a scheme (e.g. com.example.app), fallback to Play Store details
        // rather than passing a raw schemeless string that Android TV's ACTION_VIEW parser will reject.
        if (trimmed.Contains('.', StringComparison.Ordinal) && !trimmed.Contains(' ', StringComparison.Ordinal))
        {
            return $"market://details?id={trimmed}";
        }

        return trimmed;
    }
}

