using StbLab.Api.Configuration;
using StbLab.Api.Services;

namespace StbLab.Api.Extensions;

/// <summary>Application-layer wiring: options and services.</summary>
public static class StbServiceCollectionExtensions
{
    /// <summary>Binds the <c>Stb</c> configuration section.</summary>
    public static IServiceCollection AddStbOptions(this IServiceCollection services, IConfiguration configuration)
    {
        services.Configure<StbOptions>(configuration.GetSection(StbOptions.SectionName));

        return services;
    }

    /// <summary>The device session and the service that talks to it.</summary>
    public static IServiceCollection AddStbRemoteService(this IServiceCollection services)
    {
        // Registered as the SAME instance that the hosted service runs, so a request reads the live
        // session rather than opening a connection of its own. The device accepts only one session, so
        // a per-request client would silently connect and then never receive state.
        services.AddSingleton<StbConnection>();
        services.AddHostedService(provider => provider.GetRequiredService<StbConnection>());

        // Singleton to match its dependency, and because it holds no per-request state.
        services.AddSingleton<IStbRemoteService, StbRemoteService>();

        return services;
    }
}
