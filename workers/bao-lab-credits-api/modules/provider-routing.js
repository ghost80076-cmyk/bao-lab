import {
  modelAllowed,
} from "./model-pricing.js";

// Hosted provider route resolution and read-only override lookup.
const WorkerProviderRouting = (() => {
  const HOSTED_ROUTE_CONTROL = Object.freeze({
    "gemini-3-flash": {
      label: "Gemini 3 Flash",
      default_route: "google-official",
      routes: {
        "google-official": {
          label: "Google Gemini 官方",
          provider: "gemini",
          model: "gemini-3-flash-preview",
        },
        openrouter: {
          label: "OpenRouter",
          provider: "openrouter",
          model: "google/gemini-3-flash-preview",
        },
      },
    },
    "gemini-3.1-pro": {
      label: "Gemini 3.1 Pro",
      default_route: "google-official",
      routes: {
        "google-official": {
          label: "Google Gemini 官方",
          provider: "gemini",
          model: "gemini-3.1-pro-preview",
        },
        openrouter: {
          label: "OpenRouter",
          provider: "openrouter",
          model: "google/gemini-3.1-pro-preview",
        },
      },
    },
  });

  function hostedLogicalModel(
    provider,
    model
  ) {
    for (
      const [
        modelId,
        config,
      ]
      of Object.entries(
        HOSTED_ROUTE_CONTROL
      )
    ) {
      for (
        const [
          routeId,
          route,
        ]
        of Object.entries(
          config.routes
        )
      ) {
        if (
          route.provider ===
            provider &&
          route.model ===
            model
        ) {
          return {
            modelId,
            config,
            routeId,
          };
        }
      }
    }
  
    return null;
  }
  
  async function readHostedRouteOverride(
    db,
    modelId
  ) {
    try {
      const row =
        await db
          .prepare(
            `
            SELECT
              route_id
  
            FROM hosted_route_overrides
  
            WHERE
              model_id = ?
  
            LIMIT 1
            `
          )
          .bind(
            modelId
          )
          .first();
  
      return (
        typeof row?.route_id ===
          "string"
          ? row.route_id
          : null
      );
    }
  
    catch {
      // The control tables are created lazily from the authenticated
      // admin page. Before the first admin visit, production routing
      // must remain exactly as it was.
      return null;
    }
  }
  
  async function resolveHostedRoute(
    db,
    env,
    provider,
    model
  ) {
    const logical =
      hostedLogicalModel(
        provider,
        model
      );
  
    if (!logical) {
      return {
        provider,
        model,
        logical_model_id:
          null,
        route_id:
          null,
        overridden:
          false,
        fallback:
          false,
      };
    }
  
    const savedRouteId =
      await readHostedRouteOverride(
        db,
        logical.modelId
      );
  
    const requestedRouteId =
      logical.config.routes[
        savedRouteId
      ]
        ? savedRouteId
        : logical.config
            .default_route;
  
    let routeId =
      requestedRouteId;
  
    let route =
      logical.config
        .routes[routeId];
  
    let fallback =
      false;
  
    if (
      !modelAllowed(
        env,
        route.provider,
        route.model
      )
    ) {
      const defaultRoute =
        logical.config.routes[
          logical.config
            .default_route
        ];
  
      if (
        defaultRoute &&
        modelAllowed(
          env,
          defaultRoute.provider,
          defaultRoute.model
        )
      ) {
        routeId =
          logical.config
            .default_route;
  
        route =
          defaultRoute;
  
        fallback =
          true;
      }
    }
  
    return {
      provider:
        route.provider,
  
      model:
        route.model,
  
      logical_model_id:
        logical.modelId,
  
      route_id:
        routeId,
  
      overridden:
        Boolean(
          savedRouteId
        ),
  
      fallback,
    };
  }

  return Object.freeze({
    HOSTED_ROUTE_CONTROL,
    hostedLogicalModel,
    readHostedRouteOverride,
    resolveHostedRoute,
  });
})();

const {
  HOSTED_ROUTE_CONTROL,
  hostedLogicalModel,
  readHostedRouteOverride,
  resolveHostedRoute,
} = WorkerProviderRouting;

export {
  HOSTED_ROUTE_CONTROL,
  WorkerProviderRouting,
  hostedLogicalModel,
  readHostedRouteOverride,
  resolveHostedRoute,
};
