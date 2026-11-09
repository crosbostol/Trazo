using System.Text.Json.Serialization;
using Microsoft.EntityFrameworkCore;
using Progress.Api.Data;
using Progress.Api.Endpoints;
using Progress.Api.Services;
using Progress.Api.Security;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Antiforgery;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.DataProtection;
using System.Threading.RateLimiting;
using Progress.Api.Persistence;
using Microsoft.AspNetCore.DataProtection.KeyManagement;

// Read the password through stdin, never through a command-line argument.
if (args.Contains("--hash-password"))
{
    var password = Console.ReadLine() ?? "";
    if (password.Length < 12 || password.Length > 1024) throw new InvalidOperationException("Usa una contraseña de 12 a 1024 caracteres.");
    Console.WriteLine(PersonalAuthenticator.CreateHasher().HashPassword("personal", password));
    return;
}
if (args.Contains("--configure-app-role"))
{
    var connection = Environment.GetEnvironmentVariable("ConnectionStrings__Progress")
        ?? throw new InvalidOperationException("Configura ConnectionStrings__Progress.");
    var password = Console.ReadLine() ?? "";
    if (password.Length < 20 || password.Contains('\0') || password.Contains('\n') || password.Contains('\r')) throw new InvalidOperationException("Usa una contraseña SQL de al menos 20 caracteres, en una línea.");
    await using var db = new Microsoft.Data.SqlClient.SqlConnection(connection);
    await db.OpenAsync();
    await using var transaction = (Microsoft.Data.SqlClient.SqlTransaction)await db.BeginTransactionAsync();
    // Fixed contained user; the password is escaped as a SQL string, never logged.
    var literal = password.Replace("'", "''");
    await using var command = new Microsoft.Data.SqlClient.SqlCommand($"""
        IF DATABASE_PRINCIPAL_ID('trazo_app') IS NULL
            CREATE USER [trazo_app] WITH PASSWORD = '{literal}';
        ELSE
            ALTER USER [trazo_app] WITH PASSWORD = '{literal}';
        GRANT CONNECT TO [trazo_app];
        GRANT SELECT, INSERT, UPDATE, DELETE ON SCHEMA::dbo TO [trazo_app];
        """, db, transaction);
    try { await command.ExecuteNonQueryAsync(); await transaction.CommitAsync(); }
    catch { throw new InvalidOperationException("No se pudo preparar el rol de aplicación. Revisa permisos del administrador; no se muestran SQL ni credenciales."); }
    Console.WriteLine("Rol trazo_app configurado para operaciones de datos, sin propiedad del esquema ni permisos de migración.");
    return;
}
if (args.Contains("--check-database"))
{
    var connection = Environment.GetEnvironmentVariable("ConnectionStrings__Progress")
        ?? throw new InvalidOperationException("Configura ConnectionStrings__Progress.");
    await using var db = new ProgressDbContext(new DbContextOptionsBuilder<ProgressDbContext>().UseSqlServer(connection).Options);
    if ((await db.Database.GetPendingMigrationsAsync()).Any()) throw new InvalidOperationException("Hay migraciones pendientes.");
    var activities = await db.Activities.CountAsync();
    var measurements = await db.BodyMeasurements.CountAsync();
    if (args.Contains("--require-empty") && (activities != 0 || measurements != 0)) throw new InvalidOperationException("La base contiene registros. No se borró ni importó ningún dato.");
    Console.WriteLine(System.Text.Json.JsonSerializer.Serialize(new { Activities = activities, BodyMeasurements = measurements, PendingMigrations = 0 }));
    return;
}

var builder = WebApplication.CreateBuilder(args);
if (args.Contains("--export-cosmos-migration") || args.Contains("--import-cosmos-migration") || args.Contains("--verify-cosmos-migration"))
{
    await Progress.Api.Transfer.CosmosMigration.RunAsync(args, builder.Configuration);
    return;
}
builder.Logging.ClearProviders();
builder.Logging.AddConsole();
var provider = builder.Configuration["Database:Provider"] ?? "SqlServer";
if (provider is not ("SqlServer" or "Cosmos")) throw new InvalidOperationException("Database:Provider debe ser SqlServer o Cosmos.");
var useCosmos = provider == "Cosmos";
builder.Services.AddDbContext<ProgressDbContext>(options => options.UseSqlServer(builder.Configuration.GetConnectionString("Progress"), sql =>
{
    if (builder.Environment.IsProduction()) sql.EnableRetryOnFailure(6, TimeSpan.FromSeconds(10), null);
}));
builder.Services.AddScoped<DashboardService>();
builder.Services.AddScoped<StrengthProgressService>();
if (useCosmos)
{
    builder.Services.AddSingleton<CosmosRecordStore>();
    builder.Services.AddSingleton<CosmosXmlRepository>();
    builder.Services.AddScoped<CosmosDashboardService>();
    builder.Services.AddScoped<CosmosStrengthProgressService>();
    builder.Services.AddOptions<KeyManagementOptions>().Configure<CosmosXmlRepository>((options, repository) => options.XmlRepository = repository);
}
builder.Services.AddSingleton(TimeProvider.System);
builder.Services.AddOptions<PersonalAuthOptions>().BindConfiguration("Auth")
    .Validate(o => PersonalAuthenticator.IsValidHash(o.PasswordHash), "Configura Auth:PasswordHash con scripts/New-AuthSecret.ps1.").ValidateOnStart();
builder.Services.AddSingleton<IPersonalAuthenticator, PersonalAuthenticator>();
var dataProtection = builder.Services.AddDataProtection().SetApplicationName("Trazo");
if (!useCosmos) dataProtection.PersistKeysToDbContext<ProgressDbContext>();
builder.Services.AddAuthentication(CookieAuthenticationDefaults.AuthenticationScheme).AddCookie(options =>
{
    options.Cookie.Name = builder.Environment.IsProduction() ? "__Host-trazo-session" : "trazo-session";
    options.Cookie.HttpOnly = true;
    options.Cookie.SecurePolicy = builder.Environment.IsProduction() ? CookieSecurePolicy.Always : CookieSecurePolicy.SameAsRequest;
    options.Cookie.SameSite = SameSiteMode.Strict;
    options.Cookie.Path = "/";
    options.ExpireTimeSpan = TimeSpan.FromHours(12);
    options.SlidingExpiration = false;
    options.Events.OnRedirectToLogin = context => { context.Response.StatusCode = 401; return Task.CompletedTask; };
    options.Events.OnRedirectToAccessDenied = context => { context.Response.StatusCode = 403; return Task.CompletedTask; };
    options.Events.OnValidatePrincipal = async context =>
    {
        if (!context.HttpContext.RequestServices.GetRequiredService<IPersonalAuthenticator>().IsCurrent(context.Principal!))
        {
            context.RejectPrincipal();
            await context.HttpContext.SignOutAsync(CookieAuthenticationDefaults.AuthenticationScheme);
        }
    };
});
builder.Services.AddAuthorization();
builder.Services.AddAntiforgery(options =>
{
    options.HeaderName = "X-CSRF-TOKEN";
    options.Cookie.Name = builder.Environment.IsProduction() ? "__Host-trazo-csrf" : "trazo-csrf";
    options.Cookie.HttpOnly = true;
    options.Cookie.SameSite = SameSiteMode.Strict;
    options.Cookie.SecurePolicy = builder.Environment.IsProduction() ? CookieSecurePolicy.Always : CookieSecurePolicy.SameAsRequest;
});
builder.Services.AddRateLimiter(options =>
{
    options.RejectionStatusCode = 429;
    options.AddPolicy("login", _ => RateLimitPartition.GetFixedWindowLimiter("personal-login", _ => new FixedWindowRateLimiterOptions
    { PermitLimit = 5, Window = TimeSpan.FromMinutes(1), QueueLimit = 0, AutoReplenishment = true }));
});
builder.Services.ConfigureHttpJsonOptions(options => options.SerializerOptions.Converters.Add(new JsonStringEnumConverter(allowIntegerValues: false)));
builder.Services.AddOpenApi();
builder.Services.AddProblemDetails();
// Keep malformed JSON responses consistent in Development and Production.
builder.Services.Configure<Microsoft.AspNetCore.Routing.RouteHandlerOptions>(options => options.ThrowOnBadRequest = true);
var app = builder.Build();
app.Use(async (context, next) =>
{
    context.Response.Headers["X-Content-Type-Options"] = "nosniff";
    context.Response.Headers["Referrer-Policy"] = "no-referrer";
    context.Response.Headers["X-Frame-Options"] = "DENY";
    if (app.Environment.IsProduction()) context.Response.Headers["Strict-Transport-Security"] = "max-age=31536000";
    if (context.Request.Path.StartsWithSegments("/api")) context.Response.Headers.CacheControl = "no-store";
    await next();
});
app.UseExceptionHandler(new ExceptionHandlerOptions
{
    StatusCodeSelector = exception => exception is BadHttpRequestException badRequest
        ? badRequest.StatusCode : StatusCodes.Status500InternalServerError
});
if (app.Environment.IsDevelopment())
{
    app.MapOpenApi().RequireAuthorization();
    if (!useCosmos && app.Configuration.GetValue<bool>("Database:Initialize"))
    {
        await using var scope = app.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<ProgressDbContext>();
        await db.Database.MigrateAsync();
        if (app.Configuration.GetValue<bool>("Database:SeedDemo")) await DemoSeed.RunAsync(db);
    }
}
app.UseDefaultFiles();
app.UseStaticFiles();
app.UseRouting();
app.UseAuthentication();
app.UseAuthorization();
app.UseRateLimiter();
app.Use(async (context, next) =>
{
    if (app.Configuration.GetValue<bool>("Database:ReadOnly") &&
        context.Request.Path.StartsWithSegments("/api") &&
        !context.Request.Path.StartsWithSegments("/api/auth") &&
        context.Request.Method is not ("GET" or "HEAD" or "OPTIONS"))
    {
        context.Response.Headers.RetryAfter = "60";
        await Results.Problem(statusCode: 503, title: "Estamos actualizando el almacenamiento. Intenta guardar nuevamente en un momento.").ExecuteAsync(context);
        return;
    }
    await next();
});
app.Use(async (context, next) =>
{
    if (context.Request.Path.StartsWithSegments("/api") && !HttpMethods.IsGet(context.Request.Method) && !HttpMethods.IsHead(context.Request.Method) && !HttpMethods.IsOptions(context.Request.Method))
    {
        try { await context.RequestServices.GetRequiredService<IAntiforgery>().ValidateRequestAsync(context); }
        catch (AntiforgeryValidationException)
        {
            await Results.Problem(statusCode: 400, title: "Sesión de formulario vencida o solicitud no válida. Recarga la página.").ExecuteAsync(context);
            return;
        }
    }
    await next();
});
app.MapAuth();
app.MapGet("/health/live", () => Results.Ok(new { Status = "alive" })).AllowAnonymous();
// Probes test the process only. Database checks are explicit deployment/functional checks,
// otherwise periodic readiness traffic would prevent Azure SQL serverless auto-pause.
app.MapGet("/health/ready", () => Results.Ok(new { Status = "ready" })).AllowAnonymous();
if (useCosmos) app.MapCosmosApi();
else app.MapApi();
app.Map("/api/{**path}", () => Results.NotFound()).RequireAuthorization();
app.MapFallbackToFile("index.html");
app.Run();
