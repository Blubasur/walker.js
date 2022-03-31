import { AnyObject, Elbwalker, Walker, WebDestination } from '@elbwalker/types';
import { initHandler } from './lib/handler';
import { destination } from './destinations/google-tag-manager';
import { loadProject } from './lib/project';
import {
  assign,
  getGlobalProperties,
  randomString,
  trycatch,
} from './lib/utils';

const w = window;
const elbwalker = {} as Elbwalker.Function;
const destinations: WebDestination.Functions = [];

let count = 0; // Event counter for each run
let group = randomString(); // random id to group events of a run
let globals: AnyObject = {}; // init globals as some random var
let user: Elbwalker.User = {}; // handles the user ids

elbwalker.go = function (config: Elbwalker.Config = {}) {
  if (config.projectId) {
    // load individual project configuration
    loadProject(config.projectId);
  } else {
    // load custom destination and auto run
    addDestination(destination);
    run();
  }
};

elbwalker.push = function (
  event: string,
  data?: AnyObject,
  trigger?: string,
  nested?: Walker.Entities,
): void {
  if (!event) return;

  // Check for valid entity and action event format
  const [entity, action] = event.split(' ');
  if (!entity || !action) return;

  // Handle internal walker command events
  if (entity === Elbwalker.Commands.Walker) {
    handleCommand(action, data);
    return;
  }

  ++count;
  const timestamp = Date.now();
  const timing = Math.round(performance.now() / 10) / 100;
  const id = `${timestamp}-${group}-${count}`;

  destinations.map((destination) => {
    trycatch(() => {
      // Destination initialization
      // Check if the destination was initialized properly or try to do so
      if (destination.init && !destination.config.init)
        destination.config.init = destination.init();

      destination.push({
        event,
        // Create a new objects for each destination
        // to prevent data manipulation
        data: assign({}, data),
        globals: assign({}, globals),
        user: assign({}, user as AnyObject),
        nested: nested || [],
        id,
        trigger: trigger || '',
        entity,
        action,
        timestamp,
        timing,
        group,
        count,
      });
    })();
  });
};

function elbLayerInit() {
  // @TODO support to push predefined stack
  // @TODO pass elbwalker object as paramter to detach from window workaround

  const elbLayer = w.elbLayer || [];

  elbLayer.push = function (...args: unknown[]) {
    const [event, data, trigger] = args;

    // @TODO push nested
    w.elbwalker.push(event as string, data as AnyObject, trigger as string);

    return Array.prototype.push.apply(this, [args]);
  };

  w.elbLayer = elbLayer;
}

function handleCommand(action: string, data: AnyObject = {}) {
  switch (action) {
    case Elbwalker.Commands.Destination:
      addDestination(data);
      break;
    case Elbwalker.Commands.Run:
      run();
      break;
    case Elbwalker.Commands.User:
      setUserIds(data);
      break;
    default:
      break;
  }
}

function run() {
  // Reset the run counter
  count = 0;

  // Generate a new group id for each run
  group = randomString();

  // Load globals properties
  // Due to site performance only once every run
  globals = getGlobalProperties();

  // Pushes for elbwalker
  elbLayerInit();

  // Register all handlers
  initHandler();
}

function setUserIds(data: Elbwalker.User) {
  // user ids can't be set to undefined
  if (data.id) user.id = data.id;
  if (data.device) user.device = data.device;
  if (data.hash) user.hash = data.hash;
}

function addDestination(data: AnyObject | WebDestination.Function) {
  // Skip validation due to trycatch calls on push
  const destination = {
    init: data.init,
    push: data.push,
    config: data.config || { init: false },
  } as WebDestination.Function;

  destinations.push(destination);
}

w.elbwalker = elbwalker;

export default elbwalker;
