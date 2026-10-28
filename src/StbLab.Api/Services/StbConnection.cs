using System.Security.Cryptography.X509Certificates;
using Microsoft.Extensions.Options;
using StbLab.Api.Configuration;
using StbLab.Api.Exceptions;
using StbLab.Protocol;

namespace StbLab.Api.Services;

/// <summary>
/// Holds one long-lived session with the TV and redials it whenever it drops.
/// </summary>
/// <remarks>
/// The Android TV remote service accepts a single active remote session, so this keeps exactly one
/// connection open and serves every request through it. A second connection completes its TLS
/// handshake and then never receives state, which looks like a hang rather than an error.
/// Internal on purpose: nothing outside the service layer should reach for a socket.
/// </remarks>
internal sealed class StbConnection(
    IOptions<StbOptions> options,
    ILogger<StbConnection> logger) : BackgroundService
{
    private readonly StbOptions _options = options.Value;
    private volatile RemoteClient? _client;
    private volatile bool _certificateFailed;

    public bool CertificateFailed => _certificateFailed;

    /// <summary>
    /// The live session, or throws the exception that describes why there isn't one. This is where
    /// "return null and let every caller decide" is replaced by one decision made in one place.
    /// </summary>
    public RemoteClient RequireClient() =>
        _client ?? throw (_certificateFailed
            ? new StbNotPairedException()
            : new StbUnreachableException(_options.Host));

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        X509Certificate2 certificate;
        string certPath = ResolvePath(_options.CertificatePath, "client_cert.pem");
        string keyPath = ResolvePath(_options.PrivateKeyPath, "client_key.pem");

        try
        {
            certificate = Certificates.LoadClientCertificate(certPath, keyPath);
        }
        catch (Exception ex)
        {
            // No certificate means no amount of retrying helps, so leave the loop closed. The API stays
            // up and answers 503 with the pairing instructions.
            _certificateFailed = true;
            logger.LogError(
                ex,
                "Could not load the client certificate ({CertificatePath} / {PrivateKeyPath}). " +
                "Pair first with: dotnet run --project src/StbLab.Cli -- pair",
                certPath,
                keyPath);
            return;
        }

        try
        {
            while (!stoppingToken.IsCancellationRequested)
            {
                await RunSessionAsync(certificate, stoppingToken);

                try
                {
                    await Task.Delay(TimeSpan.FromSeconds(_options.ReconnectDelaySeconds), stoppingToken);
                }
                catch (OperationCanceledException)
                {
                    break;
                }
            }
        }
        finally
        {
            certificate.Dispose();
        }
    }

    private async Task RunSessionAsync(X509Certificate2 certificate, CancellationToken stoppingToken)
    {
        await using RemoteClient client = new(_options.Host, certificate);

        // Subscribe before connecting: the session can drop during the handshake, and a missed
        // notification would leave this loop waiting on a connection that is already gone.
        TaskCompletionSource lost = new(TaskCreationOptions.RunContinuationsAsynchronously);
        client.Disconnected += _ => lost.TrySetResult();

        try
        {
            await client.ConnectAsync(cancellationToken: stoppingToken);
            _client = client;
            logger.LogInformation("Connected to the TV at {Host}.", _options.Host);

            // Don't announce the session as usable until the device has pushed its initial state, so
            // the first request after a reconnect doesn't read a half-populated snapshot.
            await client.WaitForInitialStateAsync(TimeSpan.FromSeconds(5), stoppingToken);
            await lost.Task.WaitAsync(stoppingToken);
        }
        catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
        {
            // Shutting down.
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "Lost the connection to {Host}; will retry.", _options.Host);
        }
        finally
        {
            _client = null;
        }
    }

    private static string ResolvePath(string? path, string defaultFileName)
    {
        if (string.IsNullOrWhiteSpace(path))
        {
            return Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.UserProfile),
                "stb-lab",
                defaultFileName);
        }

        if (path.StartsWith("~/") || path.StartsWith("~\\"))
        {
            return Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.UserProfile),
                path[2..]);
        }

        return path;
    }
}
