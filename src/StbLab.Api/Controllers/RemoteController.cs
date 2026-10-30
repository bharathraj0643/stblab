using Asp.Versioning;
using Microsoft.AspNetCore.Mvc;
using StbLab.Api.DTOs.Remote;
using StbLab.Api.Services;

namespace StbLab.Api.Controllers;

/// <summary>Remote-control operations against the paired Android TV device.</summary>
[ApiController]
[ApiVersion("1.0")]
[Route("api/v{version:apiVersion}/remote")]
[Produces("application/json")]
public sealed class RemoteController(IStbRemoteService remote) : ControllerBase
{
    /// <summary>Current device state: power, foreground app, volume and identity.</summary>
    [HttpGet("state")]
    [ProducesResponseType(typeof(StateResponse), StatusCodes.Status200OK)]
    public ActionResult<StateResponse> GetState() => Ok(remote.GetState());

    /// <summary>Every key name the protocol defines.</summary>
    [HttpGet("keys")]
    [ProducesResponseType(typeof(IReadOnlyList<string>), StatusCodes.Status200OK)]
    public ActionResult<IReadOnlyList<string>> GetKeys() => Ok(remote.GetKeyNames());

    /// <summary>Presses a key. An unknown name returns 400 with the closest matches.</summary>
    [HttpPost("key")]
    [ProducesResponseType(typeof(KeyAcknowledgment), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status400BadRequest)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status503ServiceUnavailable)]
    public async Task<ActionResult<KeyAcknowledgment>> SendKey(
        KeyRequest request,
        CancellationToken cancellationToken) =>
        Ok(await remote.SendKeyAsync(request, cancellationToken));

    /// <summary>Injects text into whatever field has focus on the device.</summary>
    [HttpPost("text")]
    [ProducesResponseType(typeof(TextAcknowledgment), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status400BadRequest)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status503ServiceUnavailable)]
    public async Task<ActionResult<TextAcknowledgment>> SendText(
        TextRequest request,
        CancellationToken cancellationToken) =>
        Ok(await remote.SendTextAsync(request, cancellationToken));

    /// <summary>Opens an app by package name or deep link.</summary>
    [HttpPost("launch")]
    [ProducesResponseType(typeof(LaunchAcknowledgment), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status400BadRequest)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status503ServiceUnavailable)]
    public async Task<ActionResult<LaunchAcknowledgment>> Launch(
        LaunchRequest request,
        CancellationToken cancellationToken) =>
        Ok(await remote.LaunchAsync(request, cancellationToken));

    /// <summary>Tunes a channel by triggering TV key and typing the redirect number.</summary>
    [HttpPost("tune")]
    [ProducesResponseType(typeof(TuneAcknowledgment), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status400BadRequest)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status503ServiceUnavailable)]
    public async Task<ActionResult<TuneAcknowledgment>> Tune(
        TuneRequest request,
        CancellationToken cancellationToken) =>
        Ok(await remote.TuneAsync(request, cancellationToken));
}
