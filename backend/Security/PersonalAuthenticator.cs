using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Identity;
using Microsoft.Extensions.Options;

namespace Progress.Api.Security;

public sealed class PersonalAuthOptions
{
    public string PasswordHash { get; set; } = "";
}

// Replace this service when introducing real accounts; domain records are not
// coupled to this temporary personal credential or given a fictional UserId.
public interface IPersonalAuthenticator
{
    ClaimsPrincipal? Authenticate(string password);
    bool IsCurrent(ClaimsPrincipal principal);
}

public sealed class PersonalAuthenticator(IOptions<PersonalAuthOptions> options) : IPersonalAuthenticator
{
    public static PasswordHasher<string> CreateHasher() => new(Options.Create(new PasswordHasherOptions { IterationCount = 210_000 }));
    private string Stamp => Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(options.Value.PasswordHash)));
    public ClaimsPrincipal? Authenticate(string password)
    {
        if (string.IsNullOrEmpty(password) || password.Length > 1024) return null;
        if (CreateHasher().VerifyHashedPassword("personal", options.Value.PasswordHash, password) == PasswordVerificationResult.Failed) return null;
        return new ClaimsPrincipal(new ClaimsIdentity([
            new Claim(ClaimTypes.NameIdentifier, "personal"),
            new Claim("credential-version", Stamp)
        ], CookieAuthenticationDefaults.AuthenticationScheme));
    }
    public bool IsCurrent(ClaimsPrincipal principal) => principal.FindFirstValue("credential-version") == Stamp;

    public static bool IsValidHash(string hash)
    {
        try { return Convert.FromBase64String(hash) is { Length: >= 49 } bytes && bytes[0] == 1; }
        catch (FormatException) { return false; }
    }
}
