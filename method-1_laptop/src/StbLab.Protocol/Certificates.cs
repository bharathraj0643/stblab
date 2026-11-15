using System.Security.Cryptography;
using System.Security.Cryptography.X509Certificates;

namespace StbLab.Protocol;

/// <summary>
/// Loads the mutually-authenticated TLS client credential used by both the pairing
/// (6467) and command (6466) channels.
/// </summary>
public static class Certificates
{
    /// <summary>
    /// Loads a certificate and its private key from PEM files.
    /// </summary>
    /// <param name="certificatePath">PEM file holding the client certificate.</param>
    /// <param name="privateKeyPath">
    /// PEM file holding the matching private key. PKCS#8 (<c>PRIVATE KEY</c>) and
    /// PKCS#1 (<c>RSA PRIVATE KEY</c>) are both accepted.
    /// </param>
    public static X509Certificate2 LoadClientCertificate(string certificatePath, string privateKeyPath)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(certificatePath);
        ArgumentException.ThrowIfNullOrWhiteSpace(privateKeyPath);

        return FromPem(File.ReadAllText(certificatePath), File.ReadAllText(privateKeyPath));
    }

    /// <summary>Combines a PEM certificate and a PEM private key into one usable credential.</summary>
    public static X509Certificate2 FromPem(string certificatePem, string privateKeyPem)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(certificatePem);
        ArgumentException.ThrowIfNullOrWhiteSpace(privateKeyPem);

        string key = NormalisePrivateKeyPem(privateKeyPem);
        X509Certificate2 certificate = X509Certificate2.CreateFromPem(certificatePem, key);

        // CreateFromPem binds the key through an ephemeral handle that OpenSSL will not
        // sign with, so SslStream fails to present the certificate on Linux. Round-tripping
        // through PKCS#12 materialises a real RSA key that OpenSSL accepts.
        try
        {
            return X509CertificateLoader.LoadPkcs12(certificate.Export(X509ContentType.Pkcs12), null);
        }
        finally
        {
            certificate.Dispose();
        }
    }

    /// <summary>
    /// Rewrites a private key PEM into PKCS#8, which is the only encoding
    /// <see cref="X509Certificate2.CreateFromPem(string, string)"/> understands.
    /// </summary>
    /// <remarks>
    /// OpenSSL's default output is PKCS#1 (<c>-----BEGIN RSA PRIVATE KEY-----</c>), and
    /// .NET rejects that with <c>NotSupportedException: RSA PRIVATE KEY</c>. Converting
    /// here means an existing paired credential can be reused as-is instead of being
    /// re-exported by hand.
    /// </remarks>
    public static string NormalisePrivateKeyPem(string privateKeyPem)
    {
        if (!PemEncoding.TryFind(privateKeyPem, out PemFields fields))
        {
            throw new CryptographicException("No PEM block found in the private key.");
        }

        string label = privateKeyPem[fields.Label];

        if (label == "PRIVATE KEY")
        {
            return privateKeyPem;
        }

        if (label == "ENCRYPTED PRIVATE KEY")
        {
            throw new CryptographicException(
                "The private key is encrypted. Decrypt it first, e.g. " +
                "`openssl pkcs8 -topk8 -nocrypt -in key.pem -out key_pkcs8.pem`.");
        }

        if (label != "RSA PRIVATE KEY")
        {
            throw new CryptographicException($"Unsupported private key encoding '{label}'.");
        }

        byte[] pkcs1 = Convert.FromBase64String(privateKeyPem[fields.Base64Data]);

        using RSA rsa = RSA.Create();
        rsa.ImportRSAPrivateKey(pkcs1, out _);

        return PemEncoding.WriteString("PRIVATE KEY", rsa.ExportPkcs8PrivateKey());
    }

    /// <summary>
    /// Extracts the raw big-endian modulus and exponent used to derive the pairing secret.
    /// </summary>
    /// <remarks>
    /// The reference implementation builds these by formatting the numbers as uppercase
    /// hex and calling <c>bytes.fromhex</c>, which drops leading zero bytes. Stripping
    /// them here reproduces that exactly, so the secret matches byte for byte.
    /// </remarks>
    internal static (byte[] Modulus, byte[] Exponent) GetPublicNumbers(X509Certificate2 certificate)
    {
        using RSA rsa = certificate.GetRSAPublicKey()
            ?? throw new CryptographicException("The certificate does not hold an RSA public key.");

        RSAParameters parameters = rsa.ExportParameters(false);

        return (
            StripLeadingZeros(parameters.Modulus ?? throw new CryptographicException("RSA modulus is missing.")),
            StripLeadingZeros(parameters.Exponent ?? throw new CryptographicException("RSA exponent is missing.")));
    }

    private static byte[] StripLeadingZeros(byte[] value)
    {
        int start = 0;
        while (start < value.Length - 1 && value[start] == 0)
        {
            start++;
        }

        return start == 0 ? value : value[start..];
    }
}
