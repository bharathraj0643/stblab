using System.Security.Cryptography;
using System.Security.Cryptography.X509Certificates;

namespace StbLab.Protocol;

/// <summary>
/// Creates the self-signed client credential used to pair with an Android TV.
/// </summary>
public static class CertificateFactory
{
    /// <summary>Key size the device accepts; the pairing secret is derived from this key.</summary>
    private const int KeySizeBits = 2048;

    /// <summary>Validity period matching the reference implementation.</summary>
    private const int ValidityDays = 10 * 365;

    /// <summary>
    /// Generates a self-signed RSA certificate and returns the certificate and key as PEM.
    /// </summary>
    /// <remarks>
    /// The key is emitted as PKCS#8 rather than the PKCS#1 that OpenSSL writes by default,
    /// because that is the encoding .NET's own PEM reader accepts. Both this library and
    /// the Python reference read either form, so the credential stays interchangeable.
    /// </remarks>
    public static (string CertificatePem, string PrivateKeyPem) CreateSelfSigned(string commonName)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(commonName);

        using RSA rsa = RSA.Create(KeySizeBits);

        CertificateRequest request = new(
            new X500DistinguishedName($"CN={commonName}"),
            rsa,
            HashAlgorithmName.SHA256,
            RSASignaturePadding.Pkcs1);

        request.CertificateExtensions.Add(new X509BasicConstraintsExtension(
            certificateAuthority: true,
            hasPathLengthConstraint: true,
            pathLengthConstraint: 0,
            critical: false));

        SubjectAlternativeNameBuilder subjectAlternativeName = new();
        subjectAlternativeName.AddDnsName(commonName);
        request.CertificateExtensions.Add(subjectAlternativeName.Build());

        DateTimeOffset notBefore = DateTimeOffset.UtcNow;
        using X509Certificate2 certificate = request.CreateSelfSigned(notBefore, notBefore.AddDays(ValidityDays));

        return (certificate.ExportCertificatePem(), rsa.ExportPkcs8PrivateKeyPem());
    }
}
