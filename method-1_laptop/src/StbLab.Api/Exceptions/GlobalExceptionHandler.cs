using System.Diagnostics;
using Microsoft.AspNetCore.Diagnostics;
using Microsoft.AspNetCore.Mvc;

namespace StbLab.Api.Exceptions;

/// <summary>
/// The single place an unhandled exception becomes an HTTP response, so no controller needs a
/// try/catch and every failure in the API has one shape (RFC 9457 ProblemDetails).
/// </summary>
public sealed class GlobalExceptionHandler : IExceptionHandler
{
    private readonly IProblemDetailsService _problemDetailsService;
    private readonly IHostEnvironment _environment;
    private readonly ILogger<GlobalExceptionHandler> _logger;

    public GlobalExceptionHandler(
        IProblemDetailsService problemDetailsService,
        IHostEnvironment environment,
        ILogger<GlobalExceptionHandler> logger)
    {
        _problemDetailsService = problemDetailsService;
        _environment = environment;
        _logger = logger;
    }

    public async ValueTask<bool> TryHandleAsync(
        HttpContext httpContext,
        Exception exception,
        CancellationToken cancellationToken)
    {
        // W3C trace id that flows across services; TraceIdentifier is the per-connection fallback.
        string traceId = Activity.Current?.Id ?? httpContext.TraceIdentifier;

        ProblemDetails problemDetails;

        if (exception is StbException stbException)
        {
            // Expected failure. The message was written for the caller, so it is safe to return.
            // Warning, not Error: paging someone for a 400 is how alert fatigue starts.
            _logger.LogWarning(
                "Handled {ExceptionType} on {Method} {Path} (trace {TraceId}): {Message}",
                exception.GetType().Name,
                httpContext.Request.Method,
                httpContext.Request.Path,
                traceId,
                exception.Message);

            problemDetails = new ProblemDetails
            {
                Status = stbException.StatusCode,
                Title = stbException.Title,
                Detail = exception.Message,
                Instance = $"{httpContext.Request.Method} {httpContext.Request.Path}"
            };

            // Extra ProblemDetails fields survive serialisation, so suggestions travel as data too and
            // a client can offer them as buttons instead of making the user retype out of a sentence.
            if (exception is UnknownKeyException unknownKey)
            {
                problemDetails.Extensions["key"] = unknownKey.SuppliedKey;
                problemDetails.Extensions["suggestions"] = unknownKey.Suggestions;
            }
        }
        else
        {
            // A bug on our side. Passing the exception as the first argument preserves the stack trace.
            _logger.LogError(
                exception,
                "Unhandled exception on {Method} {Path} (trace {TraceId})",
                httpContext.Request.Method,
                httpContext.Request.Path,
                traceId);

            problemDetails = new ProblemDetails
            {
                Status = StatusCodes.Status500InternalServerError,
                Title = "An unexpected error occurred",

                // Never leak exception.Message in production — it routinely carries file paths and
                // internal host names.
                Detail = _environment.IsDevelopment()
                    ? exception.ToString()
                    : "Something went wrong while processing your request. Quote the traceId when reporting it."
            };
        }

        problemDetails.Extensions["traceId"] = traceId;

        httpContext.Response.StatusCode = problemDetails.Status!.Value;

        // Hand off to IProblemDetailsService so the AddProblemDetails customisations apply. Returning
        // true means "handled, stop here".
        return await _problemDetailsService.TryWriteAsync(new ProblemDetailsContext
        {
            HttpContext = httpContext,
            ProblemDetails = problemDetails,
            Exception = exception
        });
    }
}
