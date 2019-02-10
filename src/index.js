import express from "express";
import helmet from "helmet";
import cors from "cors";
import jwt from "express-jwt";
import kafka from "node-rdkafka";
import "./console-overrides";
import { Datastores } from "./commands/application-services/registries/datastores";
import { DomainEvents } from "./commands/infrastructure/kafka/domain-events";
import { DomainServices } from "./commands/application-services/registries/domain-services";
import { Controllers as CommandControllers } from "./commands/application-services/registries/controllers";
import { EventHandlers as CommandEventHandlers } from "./commands/application-services/registries/event-handlers";
import { Controllers as QueryControllers } from "./queries/controllers";

const configureDatastores = () => {
  const promises = Object.keys(Datastores).map(store => {
    console.debug(`building the ${store} datastore`);
    return Datastores[store].build();
  });
  return Promise.all(promises);
};

configureDatastores()
  .then(() => {
    DomainEvents(kafka)
      .then(domainEvents => {
        const app = express();
        configureEventHandlers(domainEvents).then(() => {
          configureApi(app, () => {
            const domainServices = DomainServices(domainEvents);
            configureControllers(app, domainEvents, domainServices);
          });
        });
      })
      .catch(error => console.error(error));
  })
  .catch(error => console.error(error));

const configureEventHandlers = async domainEvents => {
  const configure = async handlers => {
    const promises = Object.keys(handlers).map(handler => {
      // TODO: convert some of the debug logs to info
      console.debug(`registering the ${handler} event handler`);
      return handlers[handler].register();
    });
    return Promise.all(promises);
  };
  const commandHandlers = CommandEventHandlers(domainEvents);
  await configure(commandHandlers);
  await domainEvents.start();
};

const configureControllers = (app, domainEvents, domainServices) => {
  const configure = controllers => {
    Object.keys(controllers).forEach(controller => {
      console.debug(`registering the ${controller} controller`);
      controllers[controller].register();
    });
  };
  const commandControllers = CommandControllers(
    app,
    domainEvents,
    domainServices
  );
  configure(commandControllers);
  const queryControllers = QueryControllers(app);
  configure(queryControllers);
};

const configureApi = (app, registerRoutes) => {
  app.use(helmet());
  app.use(express.json());
  app.use(
    cors({
      origin: "*"
    })
  );
  // TODO: replace secret
  app.use(jwt({ secret: "secret" }).unless({ path: ["/"] }));

  // add a route for health checking the api
  app.get("/", (request, response) => {
    response.end();
  });

  registerRoutes();

  // this must be the last thing added to app or errors will not go through it
  app.use((error, request, response, next) => {
    if (error.name === "UnauthorizedError") {
      response.status(401).end();
    } else {
      console.error(error.stack);
      response.status(500).end();
    }
  });

  const port = process.env.PORT || 8080;
  app.listen(port, () => {
    console.log(
      `${process.env.npm_package_name} is ready at port ${port}, captain!`
    );
  });
};
