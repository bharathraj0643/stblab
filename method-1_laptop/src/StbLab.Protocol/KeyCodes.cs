using System.Reflection;
using Google.Protobuf.Reflection;
using StbLab.Protocol.Remote;

namespace StbLab.Protocol;

/// <summary>
/// Resolves human-friendly key names onto the protocol's <see cref="RemoteKeyCode"/> enum.
/// </summary>
/// <remarks>
/// protoc mangles C# enum member names (<c>KEYCODE_DPAD_UP</c> becomes <c>KeycodeDpadUp</c>),
/// so a plain <c>Enum.Parse</c> cannot round-trip the names people actually type. The
/// original wire names are preserved in <see cref="OriginalNameAttribute"/>, and that is
/// what this indexes.
/// </remarks>
public static class KeyCodes
{
    private static readonly Dictionary<string, RemoteKeyCode> Index = BuildIndex();

    /// <summary>Every key name accepted by <see cref="TryResolve"/>, sorted for display.</summary>
    public static IReadOnlyList<string> Names { get; } =
        [.. Index.Values.Distinct().Select(NameOf).Order(StringComparer.Ordinal)];

    /// <summary>
    /// Resolves a key name such as <c>POWER</c>, <c>KEYCODE_POWER</c> or <c>KeycodePower</c>.
    /// </summary>
    public static bool TryResolve(string? name, out RemoteKeyCode keyCode)
    {
        keyCode = default;

        return !string.IsNullOrWhiteSpace(name) && Index.TryGetValue(Normalise(name), out keyCode);
    }

    /// <summary>Resolves a key name, throwing if it is not a known key.</summary>
    public static RemoteKeyCode Resolve(string name) =>
        TryResolve(name, out RemoteKeyCode keyCode)
            ? keyCode
            : throw new ArgumentException($"Unknown key '{name}'.", nameof(name));

    /// <summary>
    /// Returns the wire name for a key code, e.g. <c>KEYCODE_DPAD_UP</c> rather than the
    /// mangled <c>KeycodeDpadUp</c> that <c>ToString</c> would give.
    /// </summary>
    public static string NameOf(RemoteKeyCode keyCode)
    {
        FieldInfo? field = typeof(RemoteKeyCode).GetField(keyCode.ToString());
        return field?.GetCustomAttribute<OriginalNameAttribute>()?.Name ?? keyCode.ToString();
    }

    private static Dictionary<string, RemoteKeyCode> BuildIndex()
    {
        Dictionary<string, RemoteKeyCode> index = new(StringComparer.Ordinal);

        foreach (FieldInfo field in typeof(RemoteKeyCode).GetFields(BindingFlags.Public | BindingFlags.Static))
        {
            if (field.FieldType != typeof(RemoteKeyCode))
            {
                continue;
            }

            RemoteKeyCode keyCode = (RemoteKeyCode)field.GetValue(null)!;
            string wireName = field.GetCustomAttribute<OriginalNameAttribute>()?.Name ?? field.Name;

            // Index both "KEYCODE_DPAD_UP" and the bare "DPAD_UP" so callers can write either.
            string bare = wireName.StartsWith("KEYCODE_", StringComparison.Ordinal)
                ? wireName["KEYCODE_".Length..]
                : wireName;

            index[Normalise(wireName)] = keyCode;
            index[Normalise(bare)] = keyCode;
        }

        return index;
    }

    /// <summary>Collapses separators and case so "dpad_up" and "DPADUP" are the same key.</summary>
    private static string Normalise(string name) =>
        name.Replace("_", string.Empty, StringComparison.Ordinal)
            .Replace(" ", string.Empty, StringComparison.Ordinal)
            .ToUpperInvariant();
}
