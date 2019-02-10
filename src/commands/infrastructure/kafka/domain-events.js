import { v4 as uuidv4 } from "uuid";

// TODO: exponential backoffs
// TODO: poison messages
// TODO: research kafka best practices
const DomainEvents = kafka => {
  return new Promise((resolve, reject) => {
    let subscriptions = {};
    // TODO: pass config to client
    const brokerLocation = "localhost:9092";
    const producer = new kafka.Producer({
      "client.id": "checking-account",
      "metadata.broker.list": brokerLocation,
      "max.in.flight.requests.per.connection": 1
    });

    const getTopic = eventName => {
      return eventName.split(".")[0];
    };

    const addSubscription = ({ eventName, handler, handleOnce }) => {
      const topic = getTopic(eventName);
      if (!subscriptions[topic]) {
        subscriptions[topic] = {
          pubsub: {
            isConsuming: false,
            cleanup: null,
            events: {}
          },
          broadcast: {
            isConsuming: false,
            cleanup: null,
            events: {}
          }
        };
      }
      if (handleOnce) {
        if (!subscriptions[topic].pubsub.events[eventName]) {
          subscriptions[topic].pubsub.events[eventName] = {
            handlers: []
          };
        }
        subscriptions[topic].pubsub.events[eventName].handlers.push(handler);
      } else {
        if (!subscriptions[topic].broadcast.events[eventName]) {
          subscriptions[topic].broadcast.events[eventName] = {
            handlers: []
          };
        }
        subscriptions[topic].broadcast.events[eventName].handlers.push(handler);
      }
    };

    const createConsumer = (topic, isBroadcast, events) => {
      return new Promise((resolve, reject) => {
        const consumer = new kafka.KafkaConsumer({
          "group.id": isBroadcast ? uuidv4() : "checking-account",
          "auto.offset.reset": isBroadcast ? "latest" : "earliest",
          "metadata.broker.list": brokerLocation
        });
        consumer.connect();

        consumer.on("ready", () => {
          console.debug(
            `the kafka consumer is waiting for ${
              isBroadcast ? "broadcasts" : "events"
            } on topic ${topic}`
          );
          consumer.subscribe([topic]);
          const poller = setInterval(() => {
            consumer.consume(1);
          }, 250);
          resolve(() => {
            consumer.disconnect();
            clearInterval(poller);
          });
        });

        consumer.on("data", data => {
          const event = JSON.parse(data.value.toString());
          const eventSubscriptions = events[event.name];
          if (!eventSubscriptions) {
            return;
          }
          console.debug(`event ${event.name} occurred with id ${event.id}`);
          const promises = eventSubscriptions.handlers.map(handler =>
            handler(event)
          );
          // TODO: What needs to happen here to trigger a retry?
          Promise.all(promises)
            .then(() => console.debug(`event ${event.id} handled`))
            .catch(error => console.error(error));
        });

        consumer.on("event.error", error => {
          reject(error);
        });

        consumer.on("error", error => {
          console.error(error);
        });
      });
    };

    const end = () => {
      if (Object.keys(subscriptions).length) {
        producer.disconnect();
        Object.keys(subscriptions).forEach(topic => {
          if (subscriptions[topic].pubsub.isConsuming) {
            subscriptions[topic].pubsub.cleanup();
          }
          if (subscriptions[topic].broadcast.isConsuming) {
            subscriptions[topic].broadcast.cleanup();
          }
        });
        subscriptions = {};
      }
    };

    producer.connect();

    producer.on("ready", () => {
      console.debug(
        `the kafka producer is ready to send messages to ${brokerLocation}`
      );
      resolve({
        raise: events => {
          if (!events) {
            throw new Error("an event must be passed");
          }
          if (!Array.isArray(events)) {
            events = [events];
          }
          events
            .sort((x, y) => x.occurredOn - y.occurredOn)
            .forEach(event => {
              const topic = getTopic(event.name);
              console.debug(
                `raising the ${event.name} event with id ${
                  event.id
                } on topic ${topic}`
              );
              // TODO: partitition by aggregate id
              const partition = null;
              try {
                producer.produce(
                  topic,
                  partition,
                  Buffer.from(JSON.stringify(event))
                );
              } catch (error) {
                console.error(error);
              }
            });
        },
        listenAndHandleOnce: (eventName, handler) => {
          console.debug(`listening to the ${eventName} event`);
          addSubscription({
            eventName,
            handler,
            handleOnce: true
          });
        },
        listenToBroadcast: (eventName, handler) => {
          console.debug(`listening to the ${eventName} broadcast`);
          addSubscription({
            eventName,
            handler,
            handleOnce: false
          });
        },
        ignore: eventName => {
          const topic = getTopic(eventName);
          if (subscriptions[topic]) {
            if (subscriptions[topic].pubsub.events[eventName]) {
              console.debug(`ignoring the ${eventName} event`);
              delete subscriptions[topic].pubsub.events[eventName];
            }
            if (subscriptions[topic].broadcast.events[eventName]) {
              console.debug(`ignoring the ${eventName} broadcast`);
              delete subscriptions[topic].broadcast.events[eventName];
            }
          }
        },
        start: async () => {
          for (const topic of Object.keys(subscriptions)) {
            if (Object.keys(subscriptions[topic].pubsub.events).length) {
              /* This condition and the one like it below in the broadcast block of code,
                 is helpful when ConfiguredEventsHandler.reregister is called.
                 If a topic has already been subscribed, move on. Otherwise,
                 a new domain has been included in a new ConfiguredEvent. */
              if (!subscriptions[topic].pubsub.isConsuming) {
                const isBroadcast = false;
                const events = subscriptions[topic].pubsub.events;
                subscriptions[topic].pubsub.isConsuming = true;
                subscriptions[topic].pubsub.cleanup = await createConsumer(
                  topic,
                  isBroadcast,
                  events
                );
              }
            }
            if (Object.keys(subscriptions[topic].broadcast.events).length) {
              if (!subscriptions[topic].broadcast.isConsuming) {
                const isBroadcast = true;
                const events = subscriptions[topic].broadcast.events;
                subscriptions[topic].broadcast.isConsuming = true;
                subscriptions[topic].broadcast.cleanup = await createConsumer(
                  topic,
                  isBroadcast,
                  events
                );
              }
            }
          }
        },
        end: end
      });
    });

    producer.on("event.error", error => {
      reject(error);
    });

    process.once("SIGINT", end);
  });
};

export { DomainEvents };