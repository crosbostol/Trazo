using Microsoft.AspNetCore.Antiforgery;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;

namespace Progress.Api.Security;

public static class AuthEndpoints
{
    public sealed record LoginRequest(string? Password);
    public static void MapAuth(this WebApplication app)
    {
        // Anonymous bootstrap is required for login CSRF protection. It returns
        // no personal data, only authentication state and a request token.
        app.MapGet("/api/auth/session", (HttpContext context, IAntiforgery csrf) =>
            Results.Ok(new { Authenticated = context.User.Identity?.IsAuthenticated == true, CsrfToken = csrf.GetAndStoreTokens(context).RequestToken })).AllowAnonymous();
        app.MapPost("/api/auth/login", async (LoginRequest request, HttpContext context, IPersonalAuthenticator auth, IAntiforgery csrf) =>
        {
            var principal = auth.Authenticate(request.Password ?? "");
            if (principal is null) return Results.Problem(statusCode: 401, title: "Contraseña incorrecta.");
            await context.SignInAsync(CookieAuthenticationDefaults.AuthenticationScheme, principal, new AuthenticationProperties { IsPersistent = true });
            context.User = principal;
            return Results.Ok(new { Authenticated = true, CsrfToken = csrf.GetAndStoreTokens(context).RequestToken });
        }).AllowAnonymous().RequireRateLimiting("login");
        app.MapPost("/api/auth/logout", async (HttpContext context) =>
        {
            await context.SignOutAsync(CookieAuthenticationDefaults.AuthenticationScheme);
            return Results.NoContent();
        }).RequireAuthorization();
    }
}
