namespace StbLab.Api.Exceptions;

/// <summary>
/// Base for every exception this API throws on purpose. Carrying the status code on the exception is
/// what lets <see cref="GlobalExceptionHandler"/> map failures with one lookup instead of an
/// ever-growing if/else over exception types.
/// </summary>
/// <remarks>
/// Anything NOT derived from this is treated as a bug: generic 500, message suppressed.
/// </remarks>
public abstract class StbException : Exception
{
    protected StbException(string message, int statusCode, string title)
        : base(message)
    {
        StatusCode = statusCode;
        Title = title;
    }

    protected StbException(string message, int statusCode, string title, Exception innerException)
        : base(message, innerException)
    {
        StatusCode = statusCode;
        Title = title;
    }

    public int StatusCode { get; }

    /// <summary>Short, stable summary used as the ProblemDetails "title".</summary>
    public string Title { get; }
}
