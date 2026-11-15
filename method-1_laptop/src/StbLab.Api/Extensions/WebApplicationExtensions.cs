using Scalar.AspNetCore;

namespace StbLab.Api.Extensions;

/// <summary>Builds the HTTP pipeline.</summary>
public static class WebApplicationExtensions
{
    /// <summary>
    /// Middleware order matters: the pipeline is a nested onion, so "registered first" means first to
    /// see the request and LAST to see the response.
    /// </summary>
    public static WebApplication UseStbApiPipeline(this WebApplication app)
    {
        // Outermost, so it wraps everything that can throw.
        app.UseExceptionHandler();

        // Turns a bare status code with no body into a ProblemDetails body.
        app.UseStatusCodePages();

        // Development only: the OpenAPI document is a map of the API, and it is served over plain HTTP
        // on loopback.
        if (app.Environment.IsDevelopment())
        {
            app.MapOpenApi();
            app.MapScalarApiReference(options => options
                .WithTitle("StbLab API")
                .WithTheme(ScalarTheme.DeepSpace));
        }

        // No UseHttpsRedirection: this API is bound to loopback and the Next.js rewrite proxy targets
        // http://127.0.0.1:5080. Redirecting to HTTPS would break the proxy and there is no certificate
        // to redirect to.
        app.UseRouting();
        app.UseCors(CorsPolicies.Default);
        app.MapControllers();

        return app;
    }
}
