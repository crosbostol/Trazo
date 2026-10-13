FROM node:24-alpine AS frontend
WORKDIR /src/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

FROM mcr.microsoft.com/dotnet/sdk:10.0 AS backend
WORKDIR /src
COPY backend/Progress.Api.csproj backend/
RUN dotnet restore backend
COPY backend/ backend/
RUN dotnet publish backend -c Release -o /out --no-restore /p:UseAppHost=false

FROM mcr.microsoft.com/dotnet/aspnet:10.0-noble-chiseled-extra AS runtime
WORKDIR /app
COPY --from=backend /out ./
COPY --from=frontend /src/frontend/dist ./wwwroot
ENV ASPNETCORE_ENVIRONMENT=Production \
    ASPNETCORE_HTTP_PORTS=8080 \
    ASPNETCORE_FORWARDEDHEADERS_ENABLED=true \
    Database__Initialize=false \
    Database__SeedDemo=false
USER $APP_UID
EXPOSE 8080
ENTRYPOINT ["dotnet", "Progress.Api.dll"]
