namespace StbLab.Api.Exceptions;

/// <summary>No usable client certificate, so there is nothing to authenticate with. 503, not 401 —
/// no credential the caller could send would fix it; the operator has to pair first.</summary>
public sealed class StbNotPairedException : StbException
{
    public StbNotPairedException()
        : base(
            "No client certificate is available. Pair with the device first: " +
            "dotnet run --project src/StbLab.Cli -- pair",
            StatusCodes.Status503ServiceUnavailable,
            "Device not paired")
    {
    }
}
