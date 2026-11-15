using Asp.Versioning;
using Microsoft.AspNetCore.Mvc;
using StbLab.Api.DTOs.Diagnostics;
using StbLab.Api.Services;

namespace StbLab.Api.Controllers;

/// <summary>Liveness of the API and of its link to the device.</summary>
[ApiController]
[ApiVersion("1.0")]
[Route("api/v{version:apiVersion}/health")]
[Produces("application/json")]
public sealed class HealthController(IStbRemoteService remote) : ControllerBase
{
    /// <summary>
    /// Returns 200 while the device link is up, 503 when it is not — so a plain status-code check is
    /// enough for a probe, and the body explains the failure for a human.
    /// </summary>
    [HttpGet]
    [ProducesResponseType(typeof(HealthResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(HealthResponse), StatusCodes.Status503ServiceUnavailable)]
    public ActionResult<HealthResponse> Get()
    {
        HealthResponse health = remote.GetHealth();

        return health.DeviceConnected ? Ok(health) : StatusCode(StatusCodes.Status503ServiceUnavailable, health);
    }
}
