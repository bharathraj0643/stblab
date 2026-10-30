using System.Net.Security;
using System.Net.Sockets;
using System.Security.Authentication;
using System.Security.Cryptography.X509Certificates;
using StbLab.Protocol.Remote;

namespace StbLab.Protocol;

/// <summary>Feature bits the device and client negotiate in <c>remote_configure</c>.</summary>
[Flags]
public enum RemoteFeature
{
    None = 0,
    Ping = 1 << 0,
    Key = 1 << 1,
    Ime = 1 << 2,
    Voice = 1 << 3,
    Unknown1 = 1 << 4,
    Power = 1 << 5,
    Volume = 1 << 6,
    AppLink = 1 << 9,

    /// <summary>What this client asks for when the device has not narrowed it down.</summary>
    Default = Ping | Key | Ime | Power | Volume | AppLink,
}

/// <summary>Direction of a key press.</summary>
public enum KeyDirection
{
    Short,
    StartLong,
    EndLong,
}

/// <summary>Point-in-time view of the device, as reported over the command channel.</summary>
public sealed record RemoteSnapshot(
    bool Connected,
    bool? IsOn,
    string? CurrentApp,
    VolumeState? Volume,
    DeviceDetails? Device,
    RemoteFeature Features);

/// <summary>Volume level reported by the device.</summary>
public sealed record VolumeState(int Level, int Max, bool Muted);

/// <summary>Identity the device announces during the handshake.</summary>
public sealed record DeviceDetails(string Manufacturer, string Model, string SoftwareVersion);

/// <summary>
/// Command-channel client for the Android TV Remote v2 protocol (port 6466, mutual TLS).
/// </summary>
/// <remarks>
/// <para>
/// The wire protocol is <c>RemoteMessage</c> protobufs, varint length-prefixed, over a TLS
/// session authenticated with the certificate produced during pairing.
/// </para>
/// <para>
/// Connecting is not passive: the device opens by sending <c>remote_configure</c> and the
/// client must answer with its own <c>remote_configure</c> and then <c>remote_set_active</c>
/// before the device accepts commands. Libraries that only open the socket and start
/// writing keys appear "connected" but never work — that is why this is hand-rolled.
/// </para>
/// <para>
/// The reference implementation disconnects after 16 seconds of silence because its
/// reconnect loop is the consumer's problem. This client keeps the session open
/// indefinitely instead, which is what a remote control wants, by answering the device's
/// 5-second pings. It is the caller's job to reconnect if the socket drops.
/// </para>
/// </remarks>
public sealed class RemoteClient : IAsyncDisposable
{
    /// <summary>Port carrying commands (mutual TLS).</summary>
    public const int CommandPort = 6466;

    /// <summary>Port carrying the pairing handshake (mutual TLS).</summary>
    public const int PairingPort = 6467;

    private const string ClientPackageName = "atvremote";
    private const string ClientAppVersion = "1.0.0";

    private readonly string _host;
    private readonly X509Certificate2 _certificate;
    private readonly SemaphoreSlim _writeLock = new(1, 1);
    private readonly Lock _stateLock = new();
    private readonly CancellationTokenSource _lifetime = new();
    private readonly TaskCompletionSource _ready =
        new(TaskCreationOptions.RunContinuationsAsynchronously);

    /// <summary>Set once the device reports it is activated via <c>remote_start</c>.</summary>
    private volatile bool _activated;

    /// <summary>Tick count of the last state-bearing message, used to detect the end of the opening burst.</summary>
    private long _lastStateTicks;

    private TcpClient? _tcp;
    private SslStream? _ssl;
    private Task? _pump;
    private Exception? _fault;

    private bool? _isOn;
    private string? _currentApp;
    private VolumeState? _volume;
    private DeviceDetails? _device;
    private int _imeCounter;
    private int _imeFieldCounter;

    /// <param name="host">Device address.</param>
    /// <param name="certificate">Client certificate produced during pairing.</param>
    /// <param name="features">Features to request; narrowed by whatever the device supports.</param>
    public RemoteClient(string host, X509Certificate2 certificate, RemoteFeature features = RemoteFeature.Default)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(host);
        ArgumentNullException.ThrowIfNull(certificate);

        _host = host;
        _certificate = certificate;
        Features = features;
    }

    /// <summary>Raised once the session ends, with the cause or <see langword="null"/> for a clean close.</summary>
    public event Action<Exception?>? Disconnected;

    /// <summary>Features actually in effect, after intersecting with the device's capabilities.</summary>
    public RemoteFeature Features { get; private set; }

    public bool IsConnected
    {
        get
        {
            SslStream? ssl = _ssl;
            return ssl is not null && ssl.CanWrite && _fault is null;
        }
    }

    /// <summary>Opens the command channel and completes the handshake.</summary>
    /// <remarks>
    /// Returns as soon as the device has accepted configuration; state (power, volume,
    /// current app) arrives moments later on the receive loop.
    /// </remarks>
    public async Task ConnectAsync(TimeSpan? handshakeTimeout = null, CancellationToken cancellationToken = default)
    {
        if (_ssl is not null)
        {
            throw new InvalidOperationException("This client is already connected.");
        }

        TcpClient tcp = new();
        SslStream ssl;

        try
        {
            await tcp.ConnectAsync(_host, CommandPort, cancellationToken).ConfigureAwait(false);

            // GetStream() refuses to run on an unconnected socket, so this has to come after
            // the connect rather than wrapping the socket up front.
            ssl = new SslStream(
                tcp.GetStream(),
                leaveInnerStreamOpen: false,
                // The device presents a self-signed certificate; trust comes from the pairing
                // exchange and mutual TLS, not from a CA chain.
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
                    TargetHost = _host,
                    ClientCertificates = [_certificate],
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

        _tcp = tcp;
        _ssl = ssl;
        _pump = Task.Run(() => PumpAsync(ssl, _lifetime.Token), CancellationToken.None);

        await _ready.Task
            .WaitAsync(handshakeTimeout ?? TimeSpan.FromSeconds(10), cancellationToken)
            .ConfigureAwait(false);
    }

    /// <summary>Sends a key press by name, e.g. <c>POWER</c> or <c>KEYCODE_DPAD_UP</c>.</summary>
    public Task SendKeyAsync(string key, KeyDirection direction = KeyDirection.Short) =>
        SendKeyAsync(KeyCodes.Resolve(key), direction);

    /// <summary>Sends a key press.</summary>
    public Task SendKeyAsync(RemoteKeyCode keyCode, KeyDirection direction = KeyDirection.Short) =>
        SendAsync(new RemoteMessage
        {
            RemoteKeyInject = new RemoteKeyInject
            {
                KeyCode = keyCode,
                Direction = direction switch
                {
                    KeyDirection.StartLong => RemoteDirection.StartLong,
                    KeyDirection.EndLong => RemoteDirection.EndLong,
                    _ => RemoteDirection.Short,
                },
            },
        });

    /// <summary>
    /// Types text into whatever field currently has focus.
    /// </summary>
    /// <remarks>
    /// Only works after the device has sent a <c>remote_ime_batch_edit</c>, which supplies
    /// the counters the input method expects. That normally happens as soon as an editable
    /// field gains focus, so this throws rather than sending counters the device will reject.
    /// </remarks>
    public Task SendTextAsync(string text)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(text);

        int imeCounter, fieldCounter;
        lock (_stateLock)
        {
            imeCounter = _imeCounter;
            fieldCounter = _imeFieldCounter;
        }

        // The reference implementation uses length-1 for both offsets; the device treats the
        // pair as a selection range covering the inserted text.
        int offset = text.Length - 1;

        return SendAsync(new RemoteMessage
        {
            RemoteImeBatchEdit = new RemoteImeBatchEdit
            {
                ImeCounter = imeCounter,
                FieldCounter = fieldCounter,
                EditInfo =
                {
                    new RemoteEditInfo
                    {
                        Insert = 1,
                        TextFieldStatus = new RemoteImeObject
                        {
                            Start = offset,
                            End = offset,
                            Value = text,
                        },
                    },
                },
            },
        });
    }

    /// <summary>Launches an app by its package name or deep link.</summary>
    public Task LaunchAppAsync(string appLink)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(appLink);

        string trimmed = appLink.Trim();

        if (AppLinks.IsTvTuner(trimmed))
        {
            return SendKeyAsync(RemoteKeyCode.KeycodeTv);
        }

        string resolved = AppLinks.Resolve(trimmed);

        return SendAsync(new RemoteMessage
        {
            RemoteAppLinkLaunchRequest = new RemoteAppLinkLaunchRequest { AppLink = resolved },
        });
    }

    /// <summary>Captures the current device state.</summary>
    public RemoteSnapshot Snapshot()
    {
        lock (_stateLock)
        {
            return new RemoteSnapshot(IsConnected, _isOn, _currentApp, _volume, _device, Features);
        }
    }

    /// <summary>
    /// Waits until the device has finished pushing its state after the handshake.
    /// </summary>
    /// <remarks>
    /// <para>
    /// <see cref="ConnectAsync"/> only covers the handshake; power, volume and the current
    /// app arrive afterwards as a burst of separate messages. The device sends
    /// <c>remote_start</c> first and the rest right behind it, so waiting on that one
    /// message reads a half-populated snapshot.
    /// </para>
    /// <para>
    /// Rather than hard-coding the order, this waits for the burst to go quiet: once
    /// activation is seen and nothing further has arrived for a short interval, the
    /// snapshot is as complete as it is going to get.
    /// </para>
    /// </remarks>
    /// <returns>
    /// <see langword="true"/> once the burst settled, <see langword="false"/> if the device
    /// never reported — a device mid-transition may stay quiet, and that is not an error.
    /// </returns>
    public async Task<bool> WaitForInitialStateAsync(TimeSpan timeout, CancellationToken cancellationToken = default)
    {
        const int QuietPeriodMs = 150;
        const int PollIntervalMs = 25;

        long deadline = Environment.TickCount64 + (long)timeout.TotalMilliseconds;

        while (Environment.TickCount64 < deadline)
        {
            cancellationToken.ThrowIfCancellationRequested();

            if (_activated &&
                Environment.TickCount64 - Interlocked.Read(ref _lastStateTicks) >= QuietPeriodMs)
            {
                return true;
            }

            await Task.Delay(PollIntervalMs, cancellationToken).ConfigureAwait(false);
        }

        return false;
    }

    public async ValueTask DisposeAsync()
    {
        await _lifetime.CancelAsync().ConfigureAwait(false);

        if (_ssl is not null)
        {
            await _ssl.DisposeAsync().ConfigureAwait(false);
        }

        _tcp?.Dispose();

        if (_pump is not null)
        {
            try
            {
                await _pump.ConfigureAwait(false);
            }
            catch (OperationCanceledException)
            {
                // Expected: we just cancelled the pump.
            }
        }

        _writeLock.Dispose();
        _lifetime.Dispose();
    }

    private async Task SendAsync(RemoteMessage message)
    {
        SslStream ssl = _ssl ?? throw new InvalidOperationException("Not connected to the device.");
        byte[] frame = Framing.Encode(message);

        await _writeLock.WaitAsync(_lifetime.Token).ConfigureAwait(false);
        try
        {
            // A write must not hang forever; if it does, something is wrong with the socket
            // and the caller wants an exception, not a stuck request thread.
            using CancellationTokenSource timeout =
                CancellationTokenSource.CreateLinkedTokenSource(_lifetime.Token);
            timeout.CancelAfter(TimeSpan.FromSeconds(10));

            await ssl.WriteAsync(frame, timeout.Token).ConfigureAwait(false);
            await ssl.FlushAsync(timeout.Token).ConfigureAwait(false);
        }
        finally
        {
            _writeLock.Release();
        }
    }

    private async Task PumpAsync(SslStream ssl, CancellationToken cancellationToken)
    {
        FrameReader reader = new(ssl);

        try
        {
            while (!cancellationToken.IsCancellationRequested)
            {
                byte[]? frame = await reader.ReadAsync(cancellationToken).ConfigureAwait(false);
                if (frame is null)
                {
                    break;
                }

                await HandleAsync(frame).ConfigureAwait(false);
            }
        }
        catch (OperationCanceledException)
        {
            // Normal shutdown.
        }
        catch (Exception ex)
        {
            _fault = ex;
            _ready.TrySetException(ex);
        }
        finally
        {
            // Unblock anyone still waiting on the handshake.
            _ready.TrySetCanceled();

            Disconnected?.Invoke(_fault);
        }
    }

    private async Task HandleAsync(byte[] frame)
    {
        RemoteMessage message = RemoteMessage.Parser.ParseFrom(frame);

        // Only state-bearing messages count towards the opening burst; pings are excluded
        // so an idle link cannot keep resetting the quiet period.
        if (message.RemoteConfigure is not null ||
            message.RemoteSetActive is not null ||
            message.RemoteImeKeyInject is not null ||
            message.RemoteImeBatchEdit is not null ||
            message.RemoteSetVolumeLevel is not null ||
            message.RemoteStart is not null)
        {
            if (message.RemoteStart is not null)
            {
                _activated = true;
            }

            Interlocked.Exchange(ref _lastStateTicks, Environment.TickCount64);
        }

        // protoc's C# generator exposes presence for message fields through nullability
        // rather than Has* accessors, so each branch matches on the field being non-null.
        if (message.RemoteConfigure is { } configure)
        {
            await HandleConfigureAsync(configure).ConfigureAwait(false);
        }
        else if (message.RemoteSetActive is not null)
        {
            await SendAsync(new RemoteMessage
            {
                RemoteSetActive = new RemoteSetActive { Active = (int)Features },
            }).ConfigureAwait(false);
        }
        else if (message.RemoteImeKeyInject is { } imeKeyInject)
        {
            lock (_stateLock)
            {
                _currentApp = imeKeyInject.AppInfo.AppPackage;
            }
        }
        else if (message.RemoteImeBatchEdit is { } batchEdit)
        {
            lock (_stateLock)
            {
                _imeCounter = batchEdit.ImeCounter;
                _imeFieldCounter = batchEdit.FieldCounter;
            }
        }
        else if (message.RemoteSetVolumeLevel is { } volume)
        {
            lock (_stateLock)
            {
                _volume = new VolumeState((int)volume.VolumeLevel, (int)volume.VolumeMax, volume.VolumeMuted);
            }
        }
        else if (message.RemoteStart is { } start)
        {
            lock (_stateLock)
            {
                _isOn = start.Started;
            }
        }
        else if (message.RemotePingRequest is { } ping)
        {
            // The device pings every ~5s and drops the connection after three unanswered
            // pings. Echoing val1 back is what keeps a long-lived session alive.
            await SendAsync(new RemoteMessage
            {
                RemotePingResponse = new RemotePingResponse { Val1 = ping.Val1 },
            }).ConfigureAwait(false);
        }
        else if (message.RemoteError is { } error)
        {
            throw new InvalidOperationException($"Device reported a protocol error: {error}");
        }
    }

    private async Task HandleConfigureAsync(RemoteConfigure configure)
    {
        RemoteFeature supported = (RemoteFeature)configure.Code1;
        Features &= supported;

        lock (_stateLock)
        {
            _device = new DeviceDetails(
                configure.DeviceInfo.Vendor,
                configure.DeviceInfo.Model,
                configure.DeviceInfo.AppVersion);
        }

        await SendAsync(new RemoteMessage
        {
            RemoteConfigure = new RemoteConfigure
            {
                Code1 = (int)Features,
                DeviceInfo = new RemoteDeviceInfo
                {
                    Unknown1 = 1,
                    Unknown2 = "1",
                    PackageName = ClientPackageName,
                    AppVersion = ClientAppVersion,
                },
            },
        }).ConfigureAwait(false);

        _ready.TrySetResult();
    }
}
