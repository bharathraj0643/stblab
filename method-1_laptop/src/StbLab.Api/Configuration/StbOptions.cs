namespace StbLab.Api.Configuration;

/// <summary>Configuration for reaching the TV, bound from the <c>Stb</c> section.</summary>
public sealed class StbOptions
{
    public const string SectionName = "Stb";

    public string Host { get; set; } = "192.168.1.128";

    /// <summary>PEM file holding the client certificate produced during pairing.</summary>
    public string CertificatePath { get; set; } = string.Empty;

    /// <summary>PEM file holding the matching private key. PKCS#1 and PKCS#8 both work.</summary>
    public string PrivateKeyPath { get; set; } = string.Empty;

    /// <summary>Browser origins allowed to call this API.</summary>
    public string[] AllowedOrigins { get; set; } = ["http://localhost:3000"];

    public int ReconnectDelaySeconds { get; set; } = 5;

    /// <summary>Whether to negotiate remote text injection, which may conflict with third-party IME services.</summary>
    public bool EnableRemoteTextInput { get; set; }
}
