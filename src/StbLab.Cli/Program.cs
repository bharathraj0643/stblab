using System.Security.Cryptography.X509Certificates;
using StbLab.Protocol;

// Command-line front end for the protocol library: pair, inspect state, and send keys
// without any UI in the way. Handy for checking the wire protocol in isolation when the
// web remote misbehaves.

const string DefaultHost = "192.168.1.128";

string labDir = Environment.GetEnvironmentVariable("STB_LAB_DIR")
    ?? Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), "stb-lab");

string host = Environment.GetEnvironmentVariable("STB_HOST") ?? DefaultHost;
string certPath = Path.Combine(labDir, "client_cert.pem");
string keyPath = Path.Combine(labDir, "client_key.pem");

List<string> remainingArgs = [];
for (int i = 0; i < args.Length; i++)
{
    switch (args[i])
    {
        case "--host" when i + 1 < args.Length:
            host = args[++i];
            break;
        case "--dir" when i + 1 < args.Length:
            labDir = args[++i];
            certPath = Path.Combine(labDir, "client_cert.pem");
            keyPath = Path.Combine(labDir, "client_key.pem");
            break;
        default:
            remainingArgs.Add(args[i]);
            break;
    }
}

if (remainingArgs.Count == 0)
{
    PrintUsage();
    return 1;
}

string command = remainingArgs[0];
string[] rest = [.. remainingArgs.Skip(1)];

try
{
    switch (command)
    {
        case "keys":
            foreach (string name in KeyCodes.Names)
            {
                Console.WriteLine(name);
            }

            return 0;

        case "pair":
            return await PairAsync(rest);

        case "state":
            return await WithClientAsync(StateAsync);

        case "key":
            if (rest.Length == 0)
            {
                Console.Error.WriteLine("usage: stb key <NAME> [SHORT|START_LONG|END_LONG]");
                return 1;
            }

            return await WithClientAsync(async (client, _) =>
            {
                KeyDirection direction = Directions.Parse(rest.Length > 1 ? rest[1] : "SHORT");
                await client.SendKeyAsync(rest[0], direction);

                Console.WriteLine($"sent {rest[0]} ({direction})");
                return 0;
            });

        case "text":
            if (rest.Length == 0)
            {
                Console.Error.WriteLine("usage: stb text <message>");
                return 1;
            }

            return await WithClientAsync(async (client, _) =>
            {
                await client.SendTextAsync(string.Join(' ', rest));
                Console.WriteLine("sent text");
                return 0;
            });

        case "launch":
            if (rest.Length == 0)
            {
                Console.Error.WriteLine("usage: stb launch <package-or-link>");
                return 1;
            }

            return await WithClientAsync(async (client, _) =>
            {
                await client.LaunchAppAsync(rest[0]);
                Console.WriteLine($"launched {rest[0]}");
                return 0;
            });

        default:
            PrintUsage();
            return 1;
    }
}
catch (Exception ex)
{
    Console.Error.WriteLine($"error: {ex.Message}");
    if (ex is not PairingException)
    {
        Console.Error.WriteLine(ex.StackTrace);
    }
    return 2;
}

void PrintUsage()
{
    Console.Error.WriteLine("""
        usage: stb [--host <ip>] [--dir <lab-dir>] <command> [args]

          state                                    show power / app / volume
          key <NAME> [SHORT|START_LONG|END_LONG]   send a key press
          text <message>                           type into the focused field
          launch <package>                         launch an app
          keys                                     list every known key name
          pair [code]                              pair; omit code to be prompted

        device host defaults to STB_HOST or 192.168.1.128
        credentials default to $STB_LAB_DIR or ~/stb-lab
        """);
}

async Task<int> PairAsync(string[] pairArgs)
{
    if (!File.Exists(certPath) || !File.Exists(keyPath))
    {
        (string newCert, string newKey) = CertificateFactory.CreateSelfSigned(Environment.MachineName);
        Directory.CreateDirectory(labDir);
        await File.WriteAllTextAsync(certPath, newCert);
        await File.WriteAllTextAsync(keyPath, newKey);
        Console.WriteLine($"generated a new client certificate at {certPath}");
    }

    using X509Certificate2 certificate = Certificates.LoadClientCertificate(certPath, keyPath);
    await using PairingClient pairing = new(host, "stb-lab", certificate);

    await pairing.StartAsync();
    Console.WriteLine("A code is now on the TV screen.");

    string code = pairArgs.Length > 0 ? pairArgs[0] : PromptForCode();
    await pairing.FinishAsync(code);

    Console.WriteLine("Paired. The credential is now trusted on the command channel.");
    return 0;
}

string PromptForCode()
{
    if (Console.IsInputRedirected)
    {
        // Allows: echo 46D2EA | stb pair
        return Console.ReadLine()?.Trim() ?? string.Empty;
    }

    Console.Write("Enter the 6-digit code: ");
    return Console.ReadLine()?.Trim() ?? string.Empty;
}

async Task<int> WithClientAsync(Func<RemoteClient, CancellationToken, Task<int>> action)
{
    using X509Certificate2 certificate = Certificates.LoadClientCertificate(certPath, keyPath);

    await using RemoteClient client = new(host, certificate);
    using CancellationTokenSource shutdown = new();

    Console.CancelKeyPress += (_, e) =>
    {
        e.Cancel = true;
        shutdown.Cancel();
    };

    client.Disconnected += ex =>
    {
        if (ex is not null)
        {
            Console.Error.WriteLine($"disconnected: {ex.Message}");
        }
    };

    await client.ConnectAsync(cancellationToken: shutdown.Token);

    return await action(client, shutdown.Token);
}

async Task<int> StateAsync(RemoteClient client, CancellationToken cancellationToken)
{
    // The handshake only makes the device accept commands; power, volume and the current
    // app are pushed separately right afterwards.
    bool primed = await client.WaitForInitialStateAsync(TimeSpan.FromSeconds(5), cancellationToken);
    if (!primed)
    {
        Console.WriteLine("(the device has not reported its state yet)");
    }

    RemoteSnapshot state = client.Snapshot();

    Console.WriteLine($"connected : {state.Connected}");
    Console.WriteLine($"device    : {state.Device?.Manufacturer} {state.Device?.Model} ({state.Device?.SoftwareVersion})");
    Console.WriteLine($"features  : {state.Features}");
    Console.WriteLine($"power     : {(state.IsOn is null ? "unknown" : state.IsOn.Value ? "on" : "standby")}");
    Console.WriteLine($"app       : {(string.IsNullOrEmpty(state.CurrentApp) ? "unknown" : state.CurrentApp)}");
    Console.WriteLine($"volume    : {(state.Volume is null ? "unknown" : $"{state.Volume.Level}/{state.Volume.Max}{(state.Volume.Muted ? " (muted)" : string.Empty)}")}");

    return 0;
}
