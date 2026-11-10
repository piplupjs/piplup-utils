import * as React from 'react';

export function useEventListener<EventName extends keyof MediaQueryListEventMap>(
  eventName: EventName,
  handler: (event: MediaQueryListEventMap[EventName]) => void,
  element: React.RefObject<MediaQueryList>,
  options?: AddEventListenerOptions | boolean,
): void;

export function useEventListener<EventName extends keyof WindowEventMap>(
  eventName: EventName,
  handler: (event: WindowEventMap[EventName]) => void,
  element?: undefined,
  options?: AddEventListenerOptions | boolean,
): void;

export function useEventListener<
  EventName extends keyof HTMLElementEventMap,
  T extends HTMLElement = HTMLDivElement,
>(
  eventName: EventName,
  handler: (event: HTMLElementEventMap[EventName]) => void,
  element: React.RefObject<T>,
  options?: AddEventListenerOptions | boolean,
): void;

export function useEventListener<EventName extends keyof DocumentEventMap>(
  eventName: EventName,
  handler: (event: DocumentEventMap[EventName]) => void,
  element: React.RefObject<Document>,
  options?: AddEventListenerOptions | boolean,
): void;

export function useEventListener<
  EventName extends string,
  EventElement extends HTMLElement = HTMLDivElement,
>(
  eventName: EventName,
  handler: (event: Event) => void,
  element?: React.RefObject<EventElement>,
  options?: AddEventListenerOptions | boolean,
): void;

export function useEventListener<
  EventName extends string,
  EventNameWindow extends keyof WindowEventMap,
  EventNameHTMLElement extends keyof HTMLElementEventMap,
  EventNameMediaQuery extends keyof MediaQueryListEventMap,
  EventElement extends HTMLElement | MediaQueryList | void = void,
>(
  eventName: EventName | EventNameHTMLElement | EventNameMediaQuery | EventNameWindow,
  handler: (
    event:
      | Event
      | HTMLElementEventMap[EventNameHTMLElement]
      | MediaQueryListEventMap[EventNameMediaQuery]
      | WindowEventMap[EventNameWindow],
  ) => void,
  element?: React.RefObject<EventElement>,
  options?: AddEventListenerOptions | boolean,
) {
  const eventHandler = React.useRef(handler);
  eventHandler.current = handler;

  React.useEffect(() => {
    const eventElement: EventElement | Window = element?.current ?? window;

    if (!(eventElement && eventElement.addEventListener)) {
      // eslint-disable-next-line @typescript-eslint/no-empty-function
      return () => {};
    }

    const eventListener: typeof handler = (event) => {
      return eventHandler.current(event);
    };

    eventElement.addEventListener(eventName, eventListener, options);

    return () => {
      eventElement.removeEventListener(eventName, eventListener, options);
    };
  }, [eventName, element, options]);
}
