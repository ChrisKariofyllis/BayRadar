export const NEW_MONITOR_EVENT = "bayradar:new-monitor";

export function requestNewMonitor() {
  window.dispatchEvent(new Event(NEW_MONITOR_EVENT));
}
