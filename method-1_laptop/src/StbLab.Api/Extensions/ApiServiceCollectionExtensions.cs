using Asp.Versioning;
using Microsoft.AspNetCore.Mvc;
using StbLab.Api.Configuration;
using StbLab.Api.Exceptions;

namespace StbLab.Api.Extensions;

/// <summary>Web-layer wiring: MVC, errors, versioning, OpenAPI and CORS.</summary>
public static class ApiServiceCollectionExtensions
{
    /// <summary>Controllers and JSON conventions.</summary>
    public static IServiceCollection AddStbApiControllers(this IServiceCollection services)
    {
        // The automatic 400 that [ApiController] produces for invalid ModelState is left ON. The
        // reference project (UpiApi) suppresses it in favour of a FluentValidation filter, but that
        // exists to unify two validation paths — with four annotated fields there is only one path
        // here, and the built-in ValidationProblemDetails shape is already what clients want.
        services.AddControllers();

        return services;
    }

    /// <summary>RFC 9457 ProblemDetails plus the global exception handler.</summary>
    public static IServiceCollection AddStbApiErrorHandling(this IServiceCollection services)
    {
        // Makes the framework emit ProblemDetails for bare status codes too (a 404 from routing, a 400
        // from ModelState), so EVERY error in the API has one shape — not just the ones our handler
        // produces.
        services.AddProblemDetails(options =>
        {
            options.CustomizeProblemDetails = context =>
            {
                context.ProblemDetails.Extensions.TryAdd("requestId", context.HttpContext.TraceIdentifier);
                context.ProblemDetails.Instance ??=
                    $"{context.HttpContext.Request.Method} {context.HttpContext.Request.Path}";
            };
        });

        services.AddExceptionHandler<GlobalExceptionHandler>();

        return services;
    }

    /// <summary>URL-segment API versioning, with a header reader as a second option.</summary>
    public static IServiceCollection AddStbApiVersioning(this IServiceCollection services)
    {
        services
            .AddApiVersioning(options =>
            {
                options.DefaultApiVersion = new ApiVersion(1, 0);

                // A request with no version gets v1 rather than a 400.
                options.AssumeDefaultVersionWhenUnspecified = true;

                // Adds api-supported-versions to responses, so a client can discover the rest.
                options.ReportApiVersions = true;

                options.ApiVersionReader = ApiVersionReader.Combine(
                    new UrlSegmentApiVersionReader(),
                    new HeaderApiVersionReader("X-Api-Version"));
            })
            .AddMvc()
            .AddApiExplorer(options =>
            {
                options.GroupNameFormat = "'v'VVV";

                // Without this the spec advertises the literal {version:apiVersion} template and every
                // generated client calls a 404.
                options.SubstituteApiVersionInUrl = true;
            });

        return services;
    }

    /// <summary>OpenAPI document generation. The UI is mapped in the pipeline.</summary>
    public static IServiceCollection AddStbApiDocumentation(this IServiceCollection services)
    {
        services.AddOpenApi();

        return services;
    }

    /// <summary>CORS, driven by configuration.</summary>
    public static IServiceCollection AddStbApiCors(this IServiceCollection services, IConfiguration configuration)
    {
        // CORS is a browser protection, not a server one: curl ignores it entirely. The Next.js app
        // proxies /api/* through its own origin, so it never triggers a preflight — this policy exists
        // for pointing a browser straight at the API while debugging.
        string[] allowedOrigins = configuration
            .GetSection($"{StbOptions.SectionName}:AllowedOrigins")
            .Get<string[]>() ?? [];

        services.AddCors(options =>
        {
            options.AddPolicy(CorsPolicies.Default, policy =>
            {
                if (allowedOrigins.Length == 0)
                {
                    // Fail closed: no origins configured means none allowed.
                    policy.WithOrigins();
                }
                else
                {
                    policy.WithOrigins(allowedOrigins).AllowAnyHeader().AllowAnyMethod();
                }
            });
        });

        return services;
    }
}

/// <summary>Named policy constants, so call sites cannot typo them.</summary>
public static class CorsPolicies
{
    public const string Default = "Default";
}
