using System.Net.Security;
using System.Net.Sockets;
using System.Security.Authentication;
using System.Security.Cryptography;
using System.Security.Cryptography.X509Certificates;
using Google.Protobuf;
using StbLab.Protocol.Polo;

namespace StbLab.Protocol;

/// <summary>Raised when the pairing handshake cannot be completed.</summary>
public sealed class PairingException(string message, Exception? inner = null)
    : Exception(message, inner);

/// <summary>
/// Pairs with an Android TV so the client certificate can be trusted on the command channel.
/// </summary>
/// <remarks>
/// <para>
/// Pairing runs over port 6467 as a short handshake that <em>the device drives</em>:
/// the client sends <c>pairing_request</c> and then answers each of the device's messages,
/// ending with a <c>secret</c> derived from both certificates and the six-digit code shown
/// on screen. Splitting this into <see cref="StartAsync"/> and <see cref="FinishAsync"/>
/// mirrors that: the window between them is when a human is reading the code off the TV.
/// </para>
/// <para>
/// Note the deliberate use of the flattened <c>OuterMessage</c> layout from
/// <c>polo.proto</c> — the AOSP proto of the same name carries these messages inside a
/// <c>type</c>/<c>payload</c> envelope and is not what shipping devices speak.
/// </para>
/// </remarks>
public sealed class PairingClient(string host, string clientName, X509Certificate2 certificate)
    : IAsyncDisposable
{
    /// <summary>Every step is answered by the device itself, so this never waits on a human.</summary>
    private static readonly TimeSpan HandshakeTimeout = TimeSpan.FromSeconds(10);

    private const string ServiceName = "atvremote";
    private const int SymbolLength = 6;

    private TcpClient? _tcp;
    private SslStream? _ssl;
    private FrameReader? _reader;
    private X509Certificate2? _serverCertificate;

    /// <summary>
    /// Opens the pairing connection and drives the handshake up to the point where the
    /// device is displaying a code.
    /// </summary>
    public async Task StartAsync(CancellationToken cancellationToken = default)
    {
        if (_ssl is not null)
        {
            throw new InvalidOperationException("This pairing session has already started.");
        }

        TcpClient tcp = new();
        SslStream ssl;

        try
        {
            await tcp.ConnectAsync(host, RemoteClient.PairingPort, cancellationToken).ConfigureAwait(false);

            // GetStream() refuses to run on an unconnected socket, so this has to come after
            // the connect rather than wrapping the socket up front.
            ssl = new SslStream(
                tcp.GetStream(),
                leaveInnerStreamOpen: false,
                userCertificateValidationCallback: static (_, _, _, _) => true);
        }
        catch
        {
            tcp.Dispose();
            throw;
        }

        try
        {
            await ssl.AuthenticateAsClientAsync(
                new SslClientAuthenticationOptions
                {
                    TargetHost = host,
                    ClientCertificates = [certificate],
                    EnabledSslProtocols = SslProtocols.Tls12 | SslProtocols.Tls13,
                    CertificateRevocationCheckMode = X509RevocationMode.NoCheck,
                },
                cancellationToken).ConfigureAwait(false);
        }
        catch
        {
            await ssl.DisposeAsync().ConfigureAwait(false);
            tcp.Dispose();
            throw;
        }

        // The device's certificate is half of the pairing secret, so keep it.
        _serverCertificate = X509CertificateLoader.LoadCertificate(
            ssl.RemoteCertificate?.Export(X509ContentType.Cert)
                ?? throw new PairingException("The device did not present a certificate."));

        _tcp = tcp;
        _ssl = ssl;
        _reader = new FrameReader(ssl);

        OuterMessage request = NewMessage();
        request.PairingRequest = new PairingRequest
        {
            ServiceName = ServiceName,
            ClientName = clientName,
        };
        await SendAsync(request).ConfigureAwait(false);

        while (true)
        {
            OuterMessage message = await ReceiveAsync(cancellationToken).ConfigureAwait(false);

            if (message.Status != OuterMessage.Types.Status.Ok)
            {
                throw new PairingException($"The device rejected the pairing request: {message.Status}.");
            }

            if (message.PairingRequestAck is not null)
            {
                await SendOptionsAsync().ConfigureAwait(false);
            }
            else if (message.Options is not null)
            {
                await SendConfigurationAsync().ConfigureAwait(false);
            }
            else if (message.ConfigurationAck is not null)
            {
                // The device is now showing the code and waiting for the secret.
                return;
            }
            else
            {
                throw new PairingException($"Unexpected message during pairing: {message}");
            }
        }
    }

    /// <summary>
    /// Completes pairing with the code displayed on the device.
    /// </summary>
    /// <param name="pairingCode">The six hexadecimal digits shown on screen, e.g. <c>46D2EA</c>.</param>
    public async Task FinishAsync(string pairingCode, CancellationToken cancellationToken = default)
    {
        if (_reader is null || _serverCertificate is null)
        {
            throw new InvalidOperationException("StartAsync must complete before FinishAsync.");
        }

        byte[] secret = ComputeSecret(certificate, _serverCertificate, pairingCode);

        OuterMessage message = NewMessage();

        // protoc renames this property to Secret_ because it would otherwise collide with
        // the enclosing Secret message's own type name.
        message.Secret = new Secret { Secret_ = ByteString.CopyFrom(secret) };
        await SendAsync(message).ConfigureAwait(false);

        OuterMessage response = await ReceiveAsync(cancellationToken).ConfigureAwait(false);

        if (response.Status != OuterMessage.Types.Status.Ok)
        {
            throw new PairingException(
                $"The device rejected the pairing secret ({response.Status}). " +
                "The code usually expires quickly — start pairing again for a fresh one.");
        }

        if (response.SecretAck is null)
        {
            throw new PairingException($"Unexpected message while confirming pairing: {response}");
        }
    }

    /// <summary>
    /// Derives the pairing secret from both certificates and the on-screen code.
    /// </summary>
    /// <remarks>
    /// <para>
    /// The digest is <c>SHA256(client_modulus ‖ client_exponent ‖ server_modulus ‖
    /// server_exponent ‖ code[2:])</c>, all big-endian, with the code contributing only its
    /// last four hex digits.
    /// </para>
    /// <para>
    /// That leaves 16 bits of entropy, which is the whole point: the device deliberately
    /// gate-keeps pairing on a value a person has to read off the screen, so brute forcing
    /// it means completing a visible handshake 65,536 times.
    /// </para>
    /// <para>
    /// The first digest byte doubles as a checksum over the code — the device only ever
    /// issues codes whose leading two hex digits equal it — so a mismatch here means the
    /// code was misread, not that the derivation is wrong.
    /// </para>
    /// </remarks>
    public static byte[] ComputeSecret(
        X509Certificate2 clientCertificate,
        X509Certificate2 serverCertificate,
        string pairingCode)
    {
        ValidatePairingCode(pairingCode);

        (byte[] clientModulus, byte[] clientExponent) = Certificates.GetPublicNumbers(clientCertificate);
        (byte[] serverModulus, byte[] serverExponent) = Certificates.GetPublicNumbers(serverCertificate);
        byte[] codeTail = Convert.FromHexString(pairingCode[2..]);

        byte[] material = new byte[
            clientModulus.Length + clientExponent.Length +
            serverModulus.Length + serverExponent.Length +
            codeTail.Length];

        int offset = 0;
        Append(material, ref offset, clientModulus);
        Append(material, ref offset, clientExponent);
        Append(material, ref offset, serverModulus);
        Append(material, ref offset, serverExponent);
        Append(material, ref offset, codeTail);

        byte[] secret = SHA256.HashData(material);

        if (secret[0] != Convert.ToByte(pairingCode[..2], 16))
        {
            throw new PairingException(
                $"The pairing code {pairingCode} failed its checksum; re-read the code on the TV.");
        }

        return secret;
    }

    private static void ValidatePairingCode(string pairingCode)
    {
        if (pairingCode is not { Length: 6 })
        {
            throw new PairingException("A pairing code is exactly 6 characters, e.g. 46D2EA.");
        }

        if (!pairingCode.All(char.IsAsciiHexDigit))
        {
            throw new PairingException($"The pairing code {pairingCode} must be hexadecimal.");
        }
    }

    private static void Append(byte[] destination, ref int offset, byte[] value)
    {
        value.CopyTo(destination, offset);
        offset += value.Length;
    }

    private static OuterMessage NewMessage() => new()
    {
        ProtocolVersion = 2,
        Status = OuterMessage.Types.Status.Ok,
    };

    private Task SendOptionsAsync()
    {
        OuterMessage message = NewMessage();
        message.Options = new Options
        {
            PreferredRole = Options.Types.RoleType.Input,
            InputEncodings = { HexEncoding() },
        };

        return SendAsync(message);
    }

    private Task SendConfigurationAsync()
    {
        OuterMessage message = NewMessage();
        message.Configuration = new Configuration
        {
            ClientRole = Options.Types.RoleType.Input,
            Encoding = HexEncoding(),
        };

        return SendAsync(message);
    }

    private static Options.Types.Encoding HexEncoding() => new()
    {
        Type = Options.Types.Encoding.Types.EncodingType.Hexadecimal,
        SymbolLength = SymbolLength,
    };

    private async Task SendAsync(OuterMessage message)
    {
        SslStream ssl = _ssl ?? throw new InvalidOperationException("Not connected.");

        using CancellationTokenSource timeout = new(HandshakeTimeout);
        byte[] frame = Framing.Encode(message);

        await ssl.WriteAsync(frame, timeout.Token).ConfigureAwait(false);
        await ssl.FlushAsync(timeout.Token).ConfigureAwait(false);
    }

    private async Task<OuterMessage> ReceiveAsync(CancellationToken cancellationToken)
    {
        FrameReader reader = _reader ?? throw new InvalidOperationException("Not connected.");

        using CancellationTokenSource timeout =
            CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        timeout.CancelAfter(HandshakeTimeout);

        byte[]? frame;
        try
        {
            frame = await reader.ReadAsync(timeout.Token).ConfigureAwait(false);
        }
        catch (OperationCanceledException) when (!cancellationToken.IsCancellationRequested)
        {
            throw new PairingException(
                $"The device did not respond within {HandshakeTimeout.TotalSeconds:0} seconds.");
        }

        return frame is null
            ? throw new PairingException("The device closed the pairing connection.")
            : OuterMessage.Parser.ParseFrom(frame);
    }

    public async ValueTask DisposeAsync()
    {
        if (_ssl is not null)
        {
            await _ssl.DisposeAsync().ConfigureAwait(false);
        }

        _tcp?.Dispose();
        _serverCertificate?.Dispose();
    }
}
