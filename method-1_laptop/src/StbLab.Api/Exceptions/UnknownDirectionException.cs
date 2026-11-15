namespace StbLab.Api.Exceptions;

/// <summary>A key direction outside the three the protocol defines. 400.</summary>
public sealed class UnknownDirectionException : StbException
{
    public UnknownDirectionException(string suppliedDirection)
        : base(
            $"'{suppliedDirection}' is not a valid key direction. Use SHORT, START_LONG or END_LONG.",
            StatusCodes.Status400BadRequest,
            "Unknown key direction")
    {
        SuppliedDirection = suppliedDirection;
    }

    public string SuppliedDirection { get; }
}
