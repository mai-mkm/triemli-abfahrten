// Each tab owns its selection and navigation state independently.
export const createTab = () => ({
  selected: null, stops: [], index: 0, mapData: null, mapOpen: false,
  origin: null, manualLocation: '', lastSwitch: 0
});

export function restoreSavedTabs(raw) {
  const tabs = { gps: createTab(), manual: createTab() };
  if (!raw || typeof raw !== 'object') return tabs;
  for (const key of ['gps', 'manual']) {
    const saved = raw[key];
    if (!saved || typeof saved !== 'object') continue;
    const stops = Array.isArray(saved.stops)
      ? saved.stops.filter(stop => stop && stop.id != null && stop.name)
          .slice(0, 10).map(stop => ({ ...stop, id: String(stop.id), name: String(stop.name) }))
      : [];
    const index = Number.isInteger(saved.index)
      ? Math.min(Math.max(saved.index, 0), Math.max(0, stops.length - 1)) : 0;
    tabs[key] = {
      ...createTab(),
      selected: saved.selected?.id != null && saved.selected?.name
        ? { ...saved.selected, id: String(saved.selected.id), name: String(saved.selected.name) }
        : null,
      stops, index,
      // Map handles and GPS coordinates should be recreated at runtime, not restored from storage.
      mapData: null, mapOpen: false, origin: null,
      manualLocation: typeof saved.manualLocation === 'string' ? saved.manualLocation : '',
      lastSwitch: 0
    };
  }
  return tabs;
}
