using StbLab.Api.Database;
using StbLab.Api.Extensions;

WebApplicationBuilder builder = WebApplication.CreateBuilder(args);

// ── Database initialization ──────────────────────────────────────────────────────────────────
DbInitializer.Initialize();

// ── Application layer ──────────────────────────────────────────────────────────────────────────
builder.Services
    .AddStbOptions(builder.Configuration)
    .AddStbRemoteService();

builder.Services.AddSingleton<ChannelRepository>();

// ── Web layer ──────────────────────────────────────────────────────────────────────────────────
builder.Services
    .AddStbApiControllers()
    .AddStbApiErrorHandling()
    .AddStbApiVersioning()
    .AddStbApiDocumentation()
    .AddStbApiCors(builder.Configuration);

WebApplication app = builder.Build();

app.UseStbApiPipeline();

app.Run();

/// <summary>Test hook: lets WebApplicationFactory&lt;Program&gt; reach this assembly's entry point.</summary>
public partial class Program;
